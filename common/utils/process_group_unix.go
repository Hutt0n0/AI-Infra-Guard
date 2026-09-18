//go:build !windows

package utils

import (
	"syscall"
	"time"
)

// sysProcAttrForProcessGroup 返回让子进程运行在独立进程组的 SysProcAttr。
// Setpgid 使子进程成为新进程组的组长（pgid == 子进程 pid），
// 这样 kill(-pid) 可以覆盖 uv 以及它再 spawn 的 python 等所有后代。
func sysProcAttrForProcessGroup() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

// killProcessGroup 终止整个进程组（-pid 表示发给组内所有成员）。
// 先 SIGTERM 给 python 等子进程一个优雅退出窗口，超时后 SIGKILL 兜底，
// 避免 uv/python 忽略 SIGTERM 导致泄漏。
func killProcessGroup(pid int) {
	if pid <= 0 {
		return
	}
	// pgid == 子进程 pid（Setpgid 创建新组）
	syscall.Kill(-pid, syscall.SIGTERM)
	killWithEscalation(pid)
}

// killWithEscalation 等待优雅退出，超时后 SIGKILL 整个进程组。
func killWithEscalation(pid int) {
	const escalateAfter = 5 * time.Second
	deadline := time.Now().Add(escalateAfter)
	for time.Now().Before(deadline) {
		// errno == ESRCH 表示整组已退出
		if err := syscall.Kill(-pid, 0); err == syscall.ESRCH {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = syscall.Kill(-pid, syscall.SIGKILL)
}
