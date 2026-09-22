package websocket

// Python 实验室（/ide）— 运行管理：脚本执行、依赖安装、venv 管理。
//
// 设计（见 docs/platform_redesign_plan.md）：
//   - 运行产物文件承载（无 DB）：logs/script_runs/<username>/<runId>/{meta.json, output.log}
//   - 执行复用 utils.RunCmdWithContext（进程组 SIGTERM→SIGKILL、逐行回调）
//   - 输出轮询：GET output?offset=N 增量读文件（不用 SSE）
//   - venv：uv venv + uv pip install，按用户隔离，全局互斥
//   - 并发限制：每用户/全局两层；超时 context.WithTimeout；20MB 输出截断
//   - 重启孤儿处理：启动时扫描 status==running 的 meta，kill 进程组并标记 error

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Tencent/AI-Infra-Guard/common/utils"
	log "github.com/sirupsen/logrus"
)

const (
	ideMaxOutputBytes = 20 << 20  // 单次运行输出上限 20MB
	ideMaxPollChunk   = 512 << 10 // 单次轮询回传上限 512KB
	ideDefaultTimeout = 600       // 默认运行超时（秒）
	ideMaxTimeout     = 1800      // 运行超时上限（秒）
	ideRunsKeep       = 50        // 每用户保留的 run 目录数
	ideRunsMaxAge     = 7 * 24 * time.Hour
)

var ideRunIDRe = regexp.MustCompile(`^run_[0-9]{8}_[0-9]{6}_[0-9a-f]{4}$`)

// ideRunMeta 一次运行的元数据（meta.json 持久化 + 轮询返回）
type ideRunMeta struct {
	RunID           string   `json:"run_id"`
	Username        string   `json:"username"`
	Kind            string   `json:"kind"` // script | deps
	Script          string   `json:"script"`
	Packages        []string `json:"packages,omitempty"`
	Argv            []string `json:"argv"`
	Cwd             string   `json:"cwd"`
	Pid             int      `json:"pid"`
	Status          string   `json:"status"` // running | done | error | timeout | killed
	ExitCode        *int     `json:"exit_code"`
	Message         string   `json:"message,omitempty"`
	CreatedAt       int64    `json:"created_at"`
	StartedAt       int64    `json:"started_at,omitempty"`
	FinishedAt      int64    `json:"finished_at,omitempty"`
	DurationMs      *int64   `json:"duration_ms,omitempty"`
	OutputSize      int64    `json:"output_size"`
	OutputTruncated bool     `json:"output_truncated"`
}

// ideActiveRun 活跃运行的内存句柄
type ideActiveRun struct {
	cancel  context.CancelFunc
	meta    *ideRunMeta
	logPath string
}

// ideRunManager 运行管理器（server 进程内单例）
type ideRunManager struct {
	mu          sync.Mutex
	active      map[string]*ideActiveRun // runId -> active
	venvMu      sync.Mutex               // venv 创建/装包全局互斥
	venvCacheMu sync.Mutex
	venvCache   map[string]ideVenvCacheEntry // username -> cached venv status
}

type ideVenvCacheEntry struct {
	status    map[string]interface{}
	expiresAt time.Time
}

func newIdeRunManager() *ideRunManager {
	return &ideRunManager{
		active:    make(map[string]*ideActiveRun),
		venvCache: make(map[string]ideVenvCacheEntry),
	}
}

// ---------------------------------------------------------------------------
// 目录解析（env 覆盖 → cwd 相对路径，与 captureDir/logs 同风格）
// ---------------------------------------------------------------------------

func ideScriptsRoot() string {
	if v := strings.TrimSpace(os.Getenv("AIG_IDE_SCRIPTS_DIR")); v != "" {
		return v
	}
	return filepath.Join("data", "scripts")
}

func ideVenvRoot() string {
	if v := strings.TrimSpace(os.Getenv("AIG_IDE_VENV_DIR")); v != "" {
		return v
	}
	return filepath.Join("data", "venvs")
}

func ideRunsRoot() string {
	if v := strings.TrimSpace(os.Getenv("AIG_IDE_RUNS_DIR")); v != "" {
		return v
	}
	return filepath.Join("logs", "script_runs")
}

func ideUserScriptsDir(username string) string {
	return filepath.Join(ideScriptsRoot(), username)
}

// ideUserVenvDir 用户 venv 目录。绝对路径：子进程（uv -p）与 fork/exec
// 都可能在 cmd.Dir 切换后解析它，相对路径会失效。
func ideUserVenvDir(username string) string {
	p := filepath.Join(ideVenvRoot(), username)
	if abs, err := filepath.Abs(p); err == nil {
		return abs
	}
	return p
}

// ---------------------------------------------------------------------------
// runId / meta 持久化
// ---------------------------------------------------------------------------

func ideNewRunID() string {
	ts := time.Now().Format("20060102_150405")
	suffix := fmt.Sprintf("%04x", time.Now().UnixNano()&0xffff)
	return fmt.Sprintf("run_%s_%s", ts, suffix)
}

func ideRunDir(username, runID string) string {
	return filepath.Join(ideRunsRoot(), username, runID)
}

// ideWriteMetaJSON 原子写 meta.json（临时文件 + rename）
func ideWriteMetaJSON(meta *ideRunMeta) error {
	dir := ideRunDir(meta.Username, meta.RunID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(dir, ".meta.tmp")
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "meta.json"))
}

func ideReadMetaJSON(username, runID string) (*ideRunMeta, error) {
	if !ideRunIDRe.MatchString(runID) {
		return nil, fmt.Errorf("非法 runId")
	}
	data, err := os.ReadFile(filepath.Join(ideRunDir(username, runID), "meta.json"))
	if err != nil {
		return nil, err
	}
	var meta ideRunMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

// ---------------------------------------------------------------------------
// 启动 / kill / 状态机
// ---------------------------------------------------------------------------

// start 运行 argv[0]=可执行文件；cwd 由调用方给。同步置 running 后异步执行。
func (m *ideRunManager) start(username, kind, script string, packages []string, argv []string, cwd string, timeoutSec int) (*ideRunMeta, error) {
	// 并发限制
	m.mu.Lock()
	userCount := 0
	for _, a := range m.active {
		if a.meta.Username == username {
			userCount++
		}
	}
	maxUser := ideEnvInt("AIG_IDE_MAX_RUNS_PER_USER", 2)
	maxGlobal := ideEnvInt("AIG_IDE_MAX_RUNS_GLOBAL", 8)
	if userCount >= maxUser {
		m.mu.Unlock()
		return nil, fmt.Errorf("运行数已达上限（每用户 %d 个），请先停止或等待运行结束", maxUser)
	}
	if len(m.active) >= maxGlobal {
		m.mu.Unlock()
		return nil, fmt.Errorf("服务端运行数已达上限（%d 个），请稍后再试", maxGlobal)
	}

	runID := ideNewRunID()
	meta := &ideRunMeta{
		RunID:     runID,
		Username:  username,
		Kind:      kind,
		Script:    script,
		Packages:  packages,
		Argv:      argv,
		Cwd:       cwd,
		Status:    "running",
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := ideWriteMetaJSON(meta); err != nil {
		m.mu.Unlock()
		return nil, fmt.Errorf("创建运行目录失败: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	logPath := filepath.Join(ideRunDir(username, runID), "output.log")
	m.active[runID] = &ideActiveRun{cancel: cancel, meta: meta, logPath: logPath}
	m.mu.Unlock()

	go m.exec(ctx, meta, logPath, cwd)
	return meta, nil
}

// exec 执行子进程并流式写 output.log，结束时收尾状态。
func (m *ideRunManager) exec(ctx context.Context, meta *ideRunMeta, logPath, cwd string) {
	// 逐行追加写 output.log（行模型与日志中心一致），20MB 截断
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		m.finishRun(meta, "error", nil, "创建输出文件失败: "+err.Error())
		return
	}
	defer f.Close()

	var writeMu sync.Mutex
	truncated := false
	callback := func(line string) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if truncated {
			return
		}
		var size int64
		if st, err := f.Stat(); err == nil {
			size = st.Size()
		}
		if size >= ideMaxOutputBytes {
			truncated = true
			f.WriteString("[output truncated: exceeded 20MB]\n")
			return
		}
		f.WriteString(line + "\n")
	}

	runErr := utils.RunCmdWithContext(ctx, cwd, meta.Argv[0], meta.Argv[1:], callback)

	writeMu.Lock()
	if st, err := f.Stat(); err == nil {
		meta.OutputSize = st.Size()
	}
	if truncated {
		meta.OutputTruncated = true
	}
	writeMu.Unlock()

	// 状态机收尾：ctx 状态为权威（用户 kill=Canceled，超时=DeadlineExceeded）
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		m.finishRun(meta, "timeout", nil, fmt.Sprintf("运行超时（上限 %d 秒）", ideMaxTimeout))
	case ctx.Err() == context.Canceled:
		// cancel 的唯一来源是用户 kill 接口
		m.finishRun(meta, "killed", nil, "用户手动停止")
	case runErr != nil:
		m.finishRun(meta, "error", nil, runErr.Error())
	default:
		code := 0
		m.finishRun(meta, "done", &code, "")
	}
}

// finishRun 写终态 meta 并从活跃表移除
func (m *ideRunManager) finishRun(meta *ideRunMeta, status string, exitCode *int, message string) {
	m.mu.Lock()
	if a, ok := m.active[meta.RunID]; ok {
		a.cancel()
		delete(m.active, meta.RunID)
	}
	m.mu.Unlock()

	now := time.Now().UnixMilli()
	meta.Status = status
	if exitCode != nil {
		meta.ExitCode = exitCode
	} else if status == "done" {
		zero := 0
		meta.ExitCode = &zero
	}
	meta.FinishedAt = now
	dur := now - meta.CreatedAt
	meta.DurationMs = &dur
	if message != "" {
		meta.Message = message
	}
	if err := ideWriteMetaJSON(meta); err != nil {
		log.Errorf("IDE 写运行终态失败: runId=%s, error=%v", meta.RunID, err)
	}
	// 刷新 venv 状态缓存（装依赖后包列表变化）
	if meta.Kind == "deps" {
		m.invalidateVenvCache(meta.Username)
	}
}

// killByRequest 终止运行（幂等）。alive=false 表示进程已不存在（重启孤儿）。
func (m *ideRunManager) killByRequest(username, runID string) (*ideRunMeta, error) {
	meta, err := ideReadMetaJSON(username, runID)
	if err != nil {
		return nil, err
	}
	if meta.Username != username {
		return nil, fmt.Errorf("无权操作该运行")
	}
	m.mu.Lock()
	active, ok := m.active[runID]
	m.mu.Unlock()
	if ok {
		active.cancel() // RunCmdWithContext 进程组 SIGTERM→SIGKILL
		return meta, nil
	}
	// 非活跃：终态直接返回；running 残留 meta（重启孤儿）标记 killed
	if meta.Status == "running" {
		m.finishRun(meta, "killed", nil, "进程已不在运行（服务重启或进程消失），标记为已停止")
		return meta, nil
	}
	return meta, nil
}

// ---------------------------------------------------------------------------
// 轮询输出
// ---------------------------------------------------------------------------

// readOutput 增量读 output.log：从 offset 起最多 512KB；落后太多时只回末尾并自愈 offset。
// UTF-8 尾字节截断时回退至边界。
func (m *ideRunManager) readOutput(username, runID string, offset int64) (*ideRunMeta, string, int64, int64, error) {
	meta, err := ideReadMetaJSON(username, runID)
	if err != nil {
		return nil, "", 0, 0, err
	}
	if meta.Username != username {
		return nil, "", 0, 0, fmt.Errorf("无权读取该运行")
	}
	// 活跃运行的 meta 在内存里更新 OutputSize（meta.json 终态才写盘）
	m.mu.Lock()
	if a, ok := m.active[runID]; ok {
		meta = a.meta
	}
	m.mu.Unlock()

	logPath := filepath.Join(ideRunDir(username, runID), "output.log")
	f, err := os.Open(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return meta, "", offset, offset, nil
		}
		return meta, "", 0, 0, err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return meta, "", 0, 0, err
	}
	size := fi.Size()
	if offset < 0 {
		offset = 0
	}
	readFrom := offset
	if size-offset > ideMaxPollChunk {
		readFrom = size - ideMaxPollChunk // 自愈：落后太多只取末尾
	}
	if readFrom >= size {
		return meta, "", offset, size, nil
	}
	buf := make([]byte, size-readFrom)
	if _, err := f.ReadAt(buf, readFrom); err != nil && err.Error() != "EOF" {
		return meta, "", 0, 0, err
	}
	// UTF-8 边界回退：末尾多字节 rune 被截断时丢掉残缺字节
	trim := 0
	for trim < 3 && len(buf) >= trim+1 {
		b := buf[len(buf)-1-trim]
		if b < 0x80 {
			break
		}
		// 找到该 rune 的起始字节
		start := trim
		for start < 3 && len(buf) >= start+1 {
			c := buf[len(buf)-1-start]
			if c&0xC0 != 0x80 { // 非连续字节 = rune 起始
				break
			}
			start++
		}
		if start >= len(buf) {
			break
		}
		c := buf[len(buf)-1-start]
		need := 0
		switch {
		case c&0xE0 == 0xC0:
			need = 2
		case c&0xF0 == 0xE0:
			need = 3
		case c&0xF8 == 0xF0:
			need = 4
		}
		if need == 0 || start+1 < need {
			trim = start + 1 // rune 不完整，回退丢弃
			continue
		}
		break
	}
	if trim > 0 && trim < len(buf) {
		buf = buf[:len(buf)-trim]
	}
	nextOffset := readFrom + int64(len(buf))
	return meta, string(buf), offset, nextOffset, nil
}

// ---------------------------------------------------------------------------
// 历史列表 / 清理
// ---------------------------------------------------------------------------

func (m *ideRunManager) listRuns(username string, limit int) []*ideRunMeta {
	// 顺手清理
	m.cleanupUser(username)
	userRoot := filepath.Join(ideRunsRoot(), username)
	entries, err := os.ReadDir(userRoot)
	if err != nil {
		return []*ideRunMeta{}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() > entries[j].Name() })
	metas := []*ideRunMeta{}
	for _, e := range entries {
		if len(metas) >= limit {
			break
		}
		if !e.IsDir() || !ideRunIDRe.MatchString(e.Name()) {
			continue
		}
		meta, err := ideReadMetaJSON(username, e.Name())
		if err != nil {
			continue
		}
		// 活跃运行以内存 meta 为准
		m.mu.Lock()
		if a, ok := m.active[meta.RunID]; ok {
			meta = a.meta
		}
		m.mu.Unlock()
		metas = append(metas, meta)
	}
	return metas
}

// cleanupUser 删除超出保留数量且过期的 run 目录（跳过活跃 run）
func (m *ideRunManager) cleanupUser(username string) {
	userRoot := filepath.Join(ideRunsRoot(), username)
	entries, err := os.ReadDir(userRoot)
	if err != nil || len(entries) <= ideRunsKeep {
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() > entries[j].Name() })
	m.mu.Lock()
	defer m.mu.Unlock()
	cutoff := time.Now().Add(-ideRunsMaxAge)
	removed := 0
	for i, e := range entries {
		if !e.IsDir() || !ideRunIDRe.MatchString(e.Name()) {
			continue
		}
		if _, active := m.active[e.Name()]; active {
			continue
		}
		// 保留最新 ideRunsKeep 个
		if i < ideRunsKeep {
			continue
		}
		fi, err := e.Info()
		if err == nil && fi.ModTime().After(cutoff) {
			continue // 未过期
		}
		_ = os.RemoveAll(filepath.Join(userRoot, e.Name()))
		removed++
	}
	if removed > 0 {
		log.Infof("IDE 清理历史运行: username=%s, removed=%d", username, removed)
	}
}

// ---------------------------------------------------------------------------
// 重启孤儿处理
// ---------------------------------------------------------------------------

// sweepOrphans 启动时调用：所有 status==running 的 run —— 尝试 kill 进程组，
// meta 标记 error（服务重启）。meta.Pid 未记录（pid 拿不到），依赖进程消失判定。
func (m *ideRunManager) sweepOrphans() {
	rootEntries, err := os.ReadDir(ideRunsRoot())
	if err != nil {
		return
	}
	for _, ue := range rootEntries {
		if !ue.IsDir() {
			continue
		}
		runEntries, err := os.ReadDir(filepath.Join(ideRunsRoot(), ue.Name()))
		if err != nil {
			continue
		}
		for _, re := range runEntries {
			if !re.IsDir() {
				continue
			}
			meta, err := ideReadMetaJSON(ue.Name(), re.Name())
			if err != nil || meta.Status != "running" {
				continue
			}
			log.Infof("IDE 启动孤儿清理: runId=%s (重启前残留 running)", meta.RunID)
			m.finishRun(meta, "error", nil, "服务重启，运行中断")
		}
	}
}

// ---------------------------------------------------------------------------
// venv 管理
// ---------------------------------------------------------------------------

// ensureVenv 确保用户 venv 存在（存在则跳过），返回 venv 目录。全局互斥。
func (m *ideRunManager) ensureVenv(username string) (string, error) {
	m.venvMu.Lock()
	defer m.venvMu.Unlock()

	venvDir := ideUserVenvDir(username)
	if _, err := os.Stat(filepath.Join(venvDir, "pyvenv.cfg")); err == nil {
		return venvDir, nil
	}
	uvBin, err := utils.ResolveUvBin()
	if err != nil {
		return "", fmt.Errorf("未找到 uv: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(venvDir), 0755); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	// uv venv 会自动下载/解析 Python 3.12
	err = utils.RunCmdWithContext(ctx, "", uvBin, []string{"venv", venvDir, "--python", "3.12"},
		func(line string) { log.Debugf("uv venv: %s", line) })
	if err != nil {
		return "", fmt.Errorf("创建 venv 失败: %w", err)
	}
	m.invalidateVenvCache(username)
	return venvDir, nil
}

// venvPythonBin 返回 venv 的 python 可执行文件路径（unix: bin/python）。
// 必须绝对路径：RunCmdWithContext 会把 cmd.Dir 切到脚本目录，相对路径失效。
func venvPythonBin(venvDir string) string {
	p := filepath.Join(venvDir, "bin", "python")
	if abs, err := filepath.Abs(p); err == nil {
		return abs
	}
	return p
}

// installPackages uv pip install（复用 run 机制跑，输出进 run 的 output.log）
func (m *ideRunManager) installPackages(username string, packages []string) (*ideRunMeta, error) {
	venvDir, err := m.ensureVenv(username)
	if err != nil {
		return nil, err
	}
	uvBin, err := utils.ResolveUvBin()
	if err != nil {
		return nil, fmt.Errorf("未找到 uv: %w", err)
	}
	argv := append([]string{uvBin, "pip", "install", "-p", venvDir, "--"}, packages...)
	return m.start(username, "deps", strings.Join(packages, " "), packages, argv, "", ideDefaultTimeout)
}

// venvStatus 查询 venv 状态（python 版本 + 已装包列表，30s 缓存）
func (m *ideRunManager) venvStatus(username string) (map[string]interface{}, error) {
	m.venvCacheMu.Lock()
	if e, ok := m.venvCache[username]; ok && time.Now().Before(e.expiresAt) {
		m.venvCacheMu.Unlock()
		return e.status, nil
	}
	m.venvCacheMu.Unlock()

	venvDir := ideUserVenvDir(username)
	result := map[string]interface{}{
		"path":   venvDir,
		"exists": false,
	}
	pyvenv := filepath.Join(venvDir, "pyvenv.cfg")
	if _, err := os.Stat(pyvenv); err != nil {
		// 不存在也缓存一小会儿（避免每次请求都 stat）
		m.venvCacheMu.Lock()
		m.venvCache[username] = ideVenvCacheEntry{status: result, expiresAt: time.Now().Add(10 * time.Second)}
		m.venvCacheMu.Unlock()
		return result, nil
	}
	result["exists"] = true

	uvBin, err := utils.ResolveUvBin()
	if err != nil {
		result["error"] = "未找到 uv"
		return result, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// python 版本
	var verLines []string
	_ = utils.RunCmdWithContext(ctx, "", venvPythonBin(venvDir), []string{"-V"}, func(l string) { verLines = append(verLines, l) })
	if len(verLines) > 0 {
		result["python_version"] = strings.TrimSpace(verLines[0])
	}
	// 包列表（uv pip list --format json）。注意 RunCmdWithContext 合并了
	// stderr，uv 会先往 stderr 打一行 "Using Python ... environment at: ..."，
	// 解析前只保留 JSON 数组行。
	var pkgLines []string
	_ = utils.RunCmdWithContext(ctx, "", uvBin, []string{"pip", "list", "-p", venvDir, "--format", "json"}, func(l string) {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "[") {
			pkgLines = append(pkgLines, t)
		}
	})
	pkgs := []map[string]string{}
	if len(pkgLines) > 0 {
		var parsed []struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		}
		if err := json.Unmarshal([]byte(strings.Join(pkgLines, "")), &parsed); err == nil {
			for _, p := range parsed {
				pkgs = append(pkgs, map[string]string{"name": p.Name, "version": p.Version})
			}
		}
	}
	result["packages"] = pkgs

	m.venvCacheMu.Lock()
	m.venvCache[username] = ideVenvCacheEntry{status: result, expiresAt: time.Now().Add(30 * time.Second)}
	m.venvCacheMu.Unlock()
	return result, nil
}

func (m *ideRunManager) invalidateVenvCache(username string) {
	m.venvCacheMu.Lock()
	delete(m.venvCache, username)
	m.venvCacheMu.Unlock()
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

func ideEnvInt(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		n := 0
		for _, ch := range v {
			if ch < '0' || ch > '9' {
				return def
			}
			n = n*10 + int(ch-'0')
			if n > 1000 {
				return def
			}
		}
		if n > 0 {
			return n
		}
	}
	return def
}
