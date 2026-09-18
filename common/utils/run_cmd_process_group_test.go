// Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Requirement: Any integration or derivative work must explicitly attribute
// Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
// documentation or user interface, as detailed in the NOTICE file.

package utils

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// writeGrandchildScript 生成模拟 `uv run python` 两层进程结构的脚本：
// 父进程（模拟 uv）spawn 一个长驻孙进程（模拟 python cli_run.py）后退出前置
// 换（等待），保证孙进程被 reparent 前仍处于同一进程组。孙进程收到 SIGTERM
// 时会转成 SIGKILL 退出（默认行为即终止），脚本通过向 stdout 打印心跳让测试
// 确认其存活。
//
// 关键点：孙进程必须忽略父进程退出（否则两层结构不成立），因此父进程
// 不 wait、直接 sleep 让测试先取消 ctx——真实场景中 uv 被 SIGKILL 后
// python 变孤儿继续跑，正是线上 bug 的复现路径。
func writeGrandchildScript(t *testing.T, dir string) (parent, grandchild string) {
	t.Helper()

	grandchild = filepath.Join(dir, "grandchild.sh")
	// 循环打印心跳；SIGTERM 默认终止，无需 trap
	gcScript := "#!/bin/sh\nwhile true; do echo grandchild-alive; sleep 1; done\n"
	if err := os.WriteFile(grandchild, []byte(gcScript), 0755); err != nil {
		t.Fatalf("write grandchild script: %v", err)
	}

	parent = filepath.Join(dir, "parent.sh")
	// 父进程 spawn 孙进程（不 wait），随后打印标记并长驻——
	// 模拟 uv：子进程持有管道、孙进程持有实际工作负载
	parentScript := "#!/bin/sh\n" +
		grandchild + " &\n" +
		"echo parent-started\n" +
		"while true; do sleep 1; done\n"
	if err := os.WriteFile(parent, []byte(parentScript), 0755); err != nil {
		t.Fatalf("write parent script: %v", err)
	}
	return parent, grandchild
}

// waitForOutput 轮询收集输出直到包含期望字符串或超时
func waitForOutput(t *testing.T, out *strings.Builder, want string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if strings.Contains(out.String(), want) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("output did not contain %q within %v; got: %s", want, timeout, out.String())
}

// isProcessAlive 检查进程是否仍存活
func isProcessAlive(pid int) bool {
	if runtime.GOOS == "windows" {
		return false // windows 分支由单测平台过滤，不实际执行
	}
	// signal 0 只探测存活
	return syscall.Kill(pid, 0) == nil
}

// findGrandchildPids 从输出中无法直接拿到孙进程 pid，
// 通过扫描进程表匹配脚本路径找到存活的孙进程。
func findGrandchildPids(t *testing.T, scriptPath string) []int {
	t.Helper()
	out, err := exec.Command("pgrep", "-f", scriptPath).Output()
	if err != nil {
		// pgrep 退出码 1 = 无匹配进程
		return nil
	}
	var pids []int
	for _, line := range strings.Fields(string(out)) {
		pid, err := strconv.Atoi(line)
		if err == nil {
			pids = append(pids, pid)
		}
	}
	return pids
}

// TestRunCmdWithContext_KillsGrandchild 复现线上 bug 并验证修复：
// 任务取消（ctx cancel）后，子进程 spawn 的孙进程也必须退出，
// 不能成为孤儿继续运行。修复前该测试失败——只有直接子进程被杀。
func TestRunCmdWithContext_KillsGrandchild(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process-group semantics differ on windows")
	}
	dir := t.TempDir()
	parent, grandchild := writeGrandchildScript(t, dir)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var out strings.Builder
	done := make(chan error, 1)
	go func() {
		done <- RunCmdWithContext(ctx, dir, parent, nil, func(line string) {
			out.WriteString(line)
			out.WriteString("\n")
		})
	}()

	// 等父子进程都起来
	waitForOutput(t, &out, "parent-started", 10*time.Second)
	deadline := time.Now().Add(10 * time.Second)
	for len(findGrandchildPids(t, grandchild)) == 0 && time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
	}
	if pids := findGrandchildPids(t, grandchild); len(pids) == 0 {
		t.Fatal("grandchild process did not start")
	}

	// 模拟用户终止任务
	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatalf("expected context error after cancel, got nil (out: %s)", out.String())
		}
	case <-time.After(15 * time.Second):
		t.Fatal("RunCmdWithContext did not return within 15s after cancel")
	}

	// 核心断言：孙进程必须死亡（修复前它会成为孤儿进程存活）
	deadline = time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if len(findGrandchildPids(t, grandchild)) == 0 {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	if pids := findGrandchildPids(t, grandchild); len(pids) > 0 {
		t.Fatalf("grandchild processes leaked after cancel: %v", pids)
	}
}

// TestRunCmdWithContext_CompletesNormally 保证修复未破坏正常完成路径：
// 命令自然退出时应正常返回 nil，输出回调完整。
func TestRunCmdWithContext_CompletesNormally(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "echo.sh")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho hello-from-script\n"), 0755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	var out strings.Builder
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := RunCmdWithContext(ctx, dir, script, nil, func(line string) {
		out.WriteString(line)
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if !strings.Contains(out.String(), "hello-from-script") {
		t.Fatalf("callback did not capture output, got: %s", out.String())
	}
}
