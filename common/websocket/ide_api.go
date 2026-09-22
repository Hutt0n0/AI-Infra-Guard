package websocket

// Python 实验室（/ide）— HTTP API：脚本 CRUD + 运行/依赖/venv 端点。
//
// 路由挂在 appSecurity 组（setupIdentityMiddleware 已设 username）。
// 安全：validateUsername + 文件名白名单正则 + safeJoinPath 三层路径防御；
// 无 shell（纯 argv）；AIG_IDE_DISABLE=1 可整体禁用。

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	ideMaxScriptBytes = 1 << 20 // 脚本内容上限 1MB
)

var ideScriptNameRe = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}\.py$`)

// 依赖包名白名单：不允许以 - 开头（防 uv flag 注入），字符集限制
var idePkgRe = regexp.MustCompile(`^[A-Za-z0-9._~+=!^*][A-Za-z0-9._~+=!<>^*-]{0,127}$`)

// ideDisabled AIG_IDE_DISABLE=1 时整体禁用
func ideDisabled() bool {
	return strings.TrimSpace(os.Getenv("AIG_IDE_DISABLE")) == "1"
}

func ideDisabledResp(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": 1, "message": "Python IDE 功能已在服务端禁用（AIG_IDE_DISABLE=1）", "data": nil})
}

// ideUsername 从上下文取合法用户名（fallback public_user）
func ideUsername(c *gin.Context) string {
	username := c.GetString("username")
	if !validateUsername(username) {
		username = PublicUser
	}
	return username
}

// ---------------------------------------------------------------------------
// 脚本 CRUD
// ---------------------------------------------------------------------------

// ideUserScriptsDirSafe 用户脚本目录（校验用户名 + MkdirAll）
func ideUserScriptsDirSafe(username string) (string, error) {
	base := ideScriptsRoot()
	dir, err := safeJoinPath(base, username)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

// ideStarterScript 首次打开 IDE 时播种的示例脚本
const ideStarterScript = `# Python 实验室示例脚本 — 点击上方「运行」执行
# 依赖安装：工具栏「安装依赖」按钮（如 requests / pandas）
import sys
import platform

print("Python:", sys.version.split()[0], "on", platform.system())
print("中文输出正常")
print("Hello from AIG Python Lab!")
`

// ideSeedStarter 用户脚本目录为空时播种 hello.py
func ideSeedStarter(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) > 0 {
		return
	}
	_ = os.WriteFile(filepath.Join(dir, "hello.py"), []byte(ideStarterScript), 0644)
}

// HandleIdeListScripts GET /app/ide/scripts
func HandleIdeListScripts(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	ideSeedStarter(dir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "读取脚本目录失败: " + err.Error(), "data": nil})
		return
	}
	type scriptMeta struct {
		Name  string `json:"name"`
		Size  int64  `json:"size"`
		Mtime int64  `json:"mtime"`
	}
	scripts := []scriptMeta{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".py") {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		scripts = append(scripts, scriptMeta{Name: e.Name(), Size: fi.Size(), Mtime: fi.ModTime().UnixMilli()})
	}
	sort.Slice(scripts, func(i, j int) bool { return scripts[i].Name < scripts[j].Name })
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"scripts": scripts,
		"dir":     ideUserScriptsDir(username),
	}})
}

// HandleIdeGetScript GET /app/ide/scripts/:name
func HandleIdeGetScript(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	name := c.Param("name")
	if !ideScriptNameRe.MatchString(name) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法脚本名", "data": nil})
		return
	}
	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	path, err := safeJoinPath(dir, name)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	fi, err := os.Stat(path)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "脚本不存在", "data": nil})
		return
	}
	if fi.Size() > ideMaxScriptBytes {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "脚本过大（>1MB）", "data": nil})
		return
	}
	content, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "读取失败: " + err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"name":    name,
		"content": string(content),
		"mtime":   fi.ModTime().UnixMilli(),
	}})
}

// HandleIdeSaveScript POST /app/ide/scripts/:name  body {content, mtime, force}
func HandleIdeSaveScript(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	name := c.Param("name")
	if !ideScriptNameRe.MatchString(name) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法脚本名", "data": nil})
		return
	}
	var body struct {
		Content string `json:"content"`
		Mtime   *int64 `json:"mtime"`
		Force   bool   `json:"force"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "参数错误: " + err.Error(), "data": nil})
		return
	}
	if len(body.Content) > ideMaxScriptBytes {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "脚本过大（>1MB）", "data": nil})
		return
	}
	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	path, err := safeJoinPath(dir, name)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	// 冲突检测：客户端回带加载时的 mtime；磁盘 mtime 更新且非 force → 冲突
	if fi, err := os.Stat(path); err == nil && body.Mtime != nil && !body.Force {
		if fi.ModTime().UnixMilli() != *body.Mtime {
			current, _ := os.ReadFile(path)
			c.JSON(http.StatusOK, gin.H{"status": 1, "message": "脚本已被其他窗口修改", "data": gin.H{
				"code":            "conflict",
				"current_mtime":   fi.ModTime().UnixMilli(),
				"current_content": string(current),
			}})
			return
		}
	}
	// 原子写：临时文件 + rename，避免运行读到半个文件
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(body.Content), 0644); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "写入失败: " + err.Error(), "data": nil})
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "写入失败: " + err.Error(), "data": nil})
		return
	}
	fi, err := os.Stat(path)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "保存后校验失败", "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"name":  name,
		"mtime": fi.ModTime().UnixMilli(),
	}})
}

// HandleIdeDeleteScript DELETE /app/ide/scripts/:name
func HandleIdeDeleteScript(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	name := c.Param("name")
	if !ideScriptNameRe.MatchString(name) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法脚本名", "data": nil})
		return
	}
	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	path, err := safeJoinPath(dir, name)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	if err := os.Remove(path); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "删除失败: " + err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{}})
}

// HandleIdeRenameScript POST /app/ide/scripts/:name/rename  body {new_name}
func HandleIdeRenameScript(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	name := c.Param("name")
	if !ideScriptNameRe.MatchString(name) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法脚本名", "data": nil})
		return
	}
	var body struct {
		NewName string `json:"new_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !ideScriptNameRe.MatchString(body.NewName) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法新脚本名", "data": nil})
		return
	}
	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	oldPath, err := safeJoinPath(dir, name)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	newPath, err := safeJoinPath(dir, body.NewName)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	if _, err := os.Stat(newPath); err == nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "目标文件已存在", "data": nil})
		return
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "重命名失败: " + err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{"name": body.NewName}})
}

// ---------------------------------------------------------------------------
// 运行 / 依赖 / venv
// ---------------------------------------------------------------------------

// HandleIdeStartRun POST /app/ide/runs  body {script, args[], timeout_sec}
func HandleIdeStartRun(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	var body struct {
		Script     string   `json:"script"`
		Args       []string `json:"args"`
		TimeoutSec int      `json:"timeout_sec"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "参数错误: " + err.Error(), "data": nil})
		return
	}
	if !ideScriptNameRe.MatchString(body.Script) {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法脚本名", "data": nil})
		return
	}
	if len(body.Args) > 32 {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "运行参数过多（上限 32 个）", "data": nil})
		return
	}
	for _, a := range body.Args {
		if len(a) > 4096 {
			c.JSON(http.StatusOK, gin.H{"status": 1, "message": "单个参数过长", "data": nil})
			return
		}
	}
	// timeout_sec=-1 表示常驻（无超时，仅手动停止）；上限可经
	// AIG_IDE_MAX_TIMEOUT_SEC 覆盖（设 0 = 允许常驻，供 SSE 代理等
	// 常驻服务经实验室托管运行）。
	maxTimeout := ideMaxTimeout
	if v := strings.TrimSpace(os.Getenv("AIG_IDE_MAX_TIMEOUT_SEC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxTimeout = n
		}
	}
	timeout := body.TimeoutSec
	if timeout == -1 && maxTimeout == 0 {
		timeout = 0 // 常驻
	} else if timeout <= 0 {
		timeout = ideDefaultTimeout
	}
	if maxTimeout > 0 && timeout > maxTimeout {
		timeout = maxTimeout
	}

	dir, err := ideUserScriptsDirSafe(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	scriptPath, err := safeJoinPath(dir, body.Script)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	if _, err := os.Stat(scriptPath); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "脚本不存在，请先保存", "data": nil})
		return
	}

	// venv python（不存在则现场创建，首次可能耗时下载解释器）
	venvDir, err := ideRunMgr.ensureVenv(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}

	argv := append([]string{venvPythonBin(venvDir), "-u", body.Script}, body.Args...)
	meta, err := ideRunMgr.start(username, "script", body.Script, nil, argv, dir, timeout)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"run_id": meta.RunID, "status": meta.Status,
	}})
}

// HandleIdeInstallDeps POST /app/ide/deps  body {packages[]}
func HandleIdeInstallDeps(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	var body struct {
		Packages []string `json:"packages"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "参数错误: " + err.Error(), "data": nil})
		return
	}
	if len(body.Packages) == 0 || len(body.Packages) > 50 {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "包数量须在 1-50 之间", "data": nil})
		return
	}
	total := 0
	for _, p := range body.Packages {
		p = strings.TrimSpace(p)
		total += len(p)
		if !idePkgRe.MatchString(p) {
			c.JSON(http.StatusOK, gin.H{"status": 1, "message": "非法包名: " + p, "data": nil})
			return
		}
	}
	if total > 2048 {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "包规格总长超限", "data": nil})
		return
	}
	meta, err := ideRunMgr.installPackages(username, body.Packages)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"run_id": meta.RunID, "status": meta.Status,
	}})
}

// HandleIdeListRuns GET /app/ide/runs?limit=20
func HandleIdeListRuns(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	limit := 20
	if n, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && n > 0 && n <= 100 {
		limit = n
	}
	runs := ideRunMgr.listRuns(username, limit)
	if runs == nil {
		runs = []*ideRunMeta{}
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{"runs": runs}})
}

// HandleIdeRunOutput GET /app/ide/runs/:runId/output?offset=N
func HandleIdeRunOutput(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	runID := c.Param("runId")
	offset, _ := strconv.ParseInt(c.DefaultQuery("offset", "0"), 10, 64)
	meta, output, _, nextOffset, err := ideRunMgr.readOutput(username, runID, offset)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"run_id": meta.RunID, "kind": meta.Kind, "script": meta.Script,
		"status": meta.Status, "exit_code": meta.ExitCode, "message": meta.Message,
		"created_at": meta.CreatedAt, "finished_at": meta.FinishedAt,
		"duration_ms": meta.DurationMs, "output_truncated": meta.OutputTruncated,
		"offset": offset, "next_offset": nextOffset,
		"size": nextOffset, "output": output,
	}})
}

// HandleIdeKillRun POST /app/ide/runs/:runId/kill
func HandleIdeKillRun(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	runID := c.Param("runId")
	meta, err := ideRunMgr.killByRequest(username, runID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": gin.H{
		"run_id": meta.RunID, "status": meta.Status,
	}})
}

// HandleIdeVenvStatus GET /app/ide/venv
func HandleIdeVenvStatus(c *gin.Context) {
	if ideDisabled() {
		ideDisabledResp(c)
		return
	}
	username := ideUsername(c)
	status, err := ideRunMgr.venvStatus(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "success", "data": status})
}

// RegisterIdeRoutes 注册 /app/ide 路由（appSecurity 组内调用）
func RegisterIdeRoutes(rg *gin.RouterGroup) {
	ide := rg.Group("/ide")
	{
		ide.GET("/scripts", HandleIdeListScripts)
		ide.GET("/scripts/:name", HandleIdeGetScript)
		ide.POST("/scripts/:name", HandleIdeSaveScript)
		ide.DELETE("/scripts/:name", HandleIdeDeleteScript)
		ide.POST("/scripts/:name/rename", HandleIdeRenameScript)

		ide.POST("/runs", HandleIdeStartRun)
		ide.POST("/deps", HandleIdeInstallDeps)
		ide.GET("/runs", HandleIdeListRuns)
		ide.GET("/runs/:runId/output", HandleIdeRunOutput)
		ide.POST("/runs/:runId/kill", HandleIdeKillRun)

		ide.GET("/venv", HandleIdeVenvStatus)
	}
	// 启动时清理重启孤儿（路由注册时执行一次）
	ideRunMgr.sweepOrphans()
}

var ideRunMgr = newIdeRunManager()
