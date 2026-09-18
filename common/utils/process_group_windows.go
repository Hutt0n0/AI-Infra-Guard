//go:build windows

package utils

import (
	"os/exec"
	"strconv"
	"syscall"
)

const (
	createNewProcessGroup = 0x00000200
)

// sysProcAttrForProcessGroup 返回让子进程运行在独立进程组的 SysProcAttr。
// Windows 上使用 CREATE_NEW_PROCESS_GROUP 标志。
func sysProcAttrForProcessGroup() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: createNewProcessGroup}
}

// killProcessGroup 终止子进程及其子树。Windows 没有进程组信号语义，
// 退化为终止根进程；孙进程经由 taskkill /T 兜底。
func killProcessGroup(pid int) {
	if pid <= 0 {
		return
	}
	// cmd /c taskkill /PID <pid> /T /F：终止指定进程及其整棵子树
	exec.Command("cmd", "/C", "taskkill", "/PID", itoa(pid), "/T", "/F").Start()
}

// killWithEscalation Windows 上 taskkill /F 即强制终止，无需二次升级。
func killWithEscalation(pid int) {}

func itoa(i int) string {
	return strconv.Itoa(i)
}
