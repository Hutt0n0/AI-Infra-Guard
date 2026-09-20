package websocket

// 平台日志中心 API — GET /api/v1/system/logs
//
// 展示 server / agent 两端日志，用于在平台上直接排查任务失败等原因
// （例如 agent 未启动导致 "SSE连接建立超时"）。
//
// 日志文件定位：webserver / agent 均由启动脚本重定向 stdout 到
// {进程 cwd}/logs/{server|agent}.log，因此按 server 进程 cwd 解析即可。
// 文件可能很大，仅回传末尾 N 行（默认 500，上限 5000）。

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

const (
	logMaxLines = 5000
	logMaxBytes = 2 << 20 // 单次最多读取 2MB，防止一次拉爆内存
)

// tailLines 读取文件末尾 count 行（超出 maxBytes 时只取尾部块）
func tailLines(path string, count int, maxBytes int64) ([]string, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return nil, "", err
	}
	size := fi.Size()
	if size == 0 {
		return []string{}, "", nil
	}

	readSize := size
	if readSize > maxBytes {
		readSize = maxBytes
	}
	offset := size - readSize
	buf := make([]byte, readSize)
	if _, err := f.ReadAt(buf, offset); err != nil {
		return nil, "", err
	}

	// 首块可能截断一行中间，丢掉第一行残片
	lines := strings.Split(string(buf), "\n")
	if offset > 0 && len(lines) > 0 {
		lines = lines[1:]
	}
	// 去掉末尾空行
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	if count > 0 && len(lines) > count {
		lines = lines[len(lines)-count:]
	}
	truncated := size > maxBytes && len(lines) > 0
	if truncated {
		return lines, "(仅显示文件末尾部分，完整日志请查看服务器文件)", nil
	}
	return lines, "", nil
}

// HandleGetLogs GET /api/v1/system/logs?source=server|agent&lines=500
func HandleGetLogs(c *gin.Context) {
	source := strings.ToLower(c.DefaultQuery("source", "server"))
	linesParam := c.DefaultQuery("lines", "500")

	// 只允许两个已知来源，防止任意路径读取
	var filename string
	switch source {
	case "server":
		filename = "server.log"
	case "agent":
		filename = "agent.log"
	default:
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "无效的日志来源: " + source, "data": nil})
		return
	}

	count := 500
	if n := parseIntSafe(linesParam); n > 0 {
		count = n
	}
	if count > logMaxLines {
		count = logMaxLines
	}

	// 日志目录解析：优先 AIG_LOG_DIR 环境变量（nohup 重定向目标目录），
	// 否则回退到 server 进程 cwd 下的 logs/
	logDir := os.Getenv("AIG_LOG_DIR")
	if logDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"status": 1, "message": "获取工作目录失败: " + err.Error(), "data": nil})
			return
		}
		logDir = filepath.Join(cwd, "logs")
	}
	logPath := filepath.Join(logDir, filename)

	lines, notice, err := tailLines(logPath, count, logMaxBytes)
	if err != nil {
		if os.IsNotExist(err) {
			// 文件不存在（如 agent 从未启动）：返回空而非错误，前端展示空态
			log.Infof("日志文件不存在: %s", logPath)
			c.JSON(http.StatusOK, gin.H{
				"status": 0,
				"message": "success",
				"data": gin.H{
					"source":  source,
					"path":    logPath,
					"exists":  false,
					"lines":   []string{},
					"notice":  "日志文件尚未生成（" + filename + "）——对应进程可能从未启动",
					"missing": true,
				},
			})
			return
		}
		log.Errorf("读取日志失败: %s, error=%v", logPath, err)
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "读取日志失败: " + err.Error(), "data": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  0,
		"message": "success",
		"data": gin.H{
			"source": source,
			"path":   logPath,
			"exists": true,
			"lines":  lines,
			"notice": notice,
		},
	})
}

func parseIntSafe(s string) int {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0
		}
		n = n*10 + int(ch-'0')
		if n > 100000 {
			return 0
		}
	}
	return n
}
