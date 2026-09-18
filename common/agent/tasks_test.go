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

package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

const (
	TestModelName = "Qwen/Qwen3-32B"
	TestToken     = "empty"
	TestBaseUrl   = "http://127.0.0.1:8080/v1"
)

// 创建一个mock回调结构来验证agent执行流程
type MockCallbacks struct {
	ResultCallbackFunc           func(result map[string]interface{})
	ToolUseLogCallbackFunc       func(actionId, tool, planStepId, actionLog string)
	ToolUsedCallbackFunc         func(planStepId, statusId, description string, tools []Tool)
	NewPlanStepCallbackFunc      func(stepId, title string)
	StepStatusUpdateCallbackFunc func(planStepId, statusId, agentStatus, brief, description string)
	PlanUpdateCallbackFunc       func(tasks []SubTask)
	MessageTraceCallbackFunc     func(trace MessageTraceEvent)
	ErrorCallbackFunc            func(errMsg string)
}

func NewMockCallbacks() *MockCallbacks {
	mc := &MockCallbacks{}

	// 设置回调函数来收集调用信息
	mc.ResultCallbackFunc = func(result map[string]interface{}) {
		fmt.Println("ResultCallbackFunc", result)
	}

	mc.ToolUseLogCallbackFunc = func(actionId, tool, planStepId, actionLog string) {
		fmt.Println("ToolUseLogCallbackFunc", actionId, tool, planStepId, actionLog)
	}

	mc.ToolUsedCallbackFunc = func(planStepId, statusId, description string, tools []Tool) {
		// 记录工具使用
		fmt.Println("ToolUsedCallbackFunc", planStepId, statusId, description, tools)
	}

	mc.NewPlanStepCallbackFunc = func(stepId, title string) {
		fmt.Println("NewPlanStepCallbackFunc", stepId, title)
	}

	mc.StepStatusUpdateCallbackFunc = func(planStepId, statusId, agentStatus, brief, description string) {
		fmt.Println("StepStatusUpdateCallbackFunc", planStepId, statusId, agentStatus, brief, description)
	}

	mc.PlanUpdateCallbackFunc = func(tasks []SubTask) {
		fmt.Println("PlanUpdateCallbackFunc", tasks)
	}

	mc.MessageTraceCallbackFunc = func(trace MessageTraceEvent) {
		fmt.Println("MessageTraceCallbackFunc", trace.Direction, trace.Endpoint)
	}

	mc.ErrorCallbackFunc = func(errMsg string) {
		fmt.Println("ErrorCallbackFunc", errMsg)
	}
	return mc
}
func (mc *MockCallbacks) GetCallbacks() TaskCallbacks {
	return TaskCallbacks{
		ResultCallback:           mc.ResultCallbackFunc,
		ToolUseLogCallback:       mc.ToolUseLogCallbackFunc,
		ToolUsedCallback:         mc.ToolUsedCallbackFunc,
		NewPlanStepCallback:      mc.NewPlanStepCallbackFunc,
		StepStatusUpdateCallback: mc.StepStatusUpdateCallbackFunc,
		PlanUpdateCallback:       mc.PlanUpdateCallbackFunc,
		MessageTraceCallback:     mc.MessageTraceCallbackFunc,
		ErrorCallback:            mc.ErrorCallbackFunc,
	}
}

// ParseStdoutLine 解析 messageTrace 消息测试用例
func TestParseStdoutLineMessageTrace(t *testing.T) {
	traces := make([]MessageTraceEvent, 0)
	callbacks := TaskCallbacks{
		MessageTraceCallback: func(trace MessageTraceEvent) {
			traces = append(traces, trace)
		},
	}
	config := CmdConfig{}
	tasks := []SubTask{}

	// 模拟 Python 子进程输出的 messageTrace 事件（请求 + 响应 + 错误）
	lines := []string{
		`{"type":"messageTrace","content":{"trace_id":"t-1","direction":"request","tool":"target_dialogue","stepId":"2a","endpoint":"dify:my-agent","phase":"attack","attack_method":"Base64","vulnerability":"PII Leakage","turn":1,"payload":"...","meta":"{}"}}`,
		`{"type":"messageTrace","content":{"trace_id":"t-1","direction":"response","tool":"target_dialogue","stepId":"2a","endpoint":"dify:my-agent","payload":"hello"}}`,
		`{"type":"messageTrace","content":{"trace_id":"t-2","direction":"error","tool":"target_dialogue","stepId":"2a","endpoint":"dify:my-agent","payload":"timeout"}}`,
	}
	for _, line := range lines {
		ParseStdoutLine("", "", tasks, line, callbacks, &config, false)
	}

	assert.Len(t, traces, 3)
	assert.Equal(t, "request", traces[0].Direction)
	assert.Equal(t, "t-1", traces[0].TraceId)
	assert.Equal(t, "2a", traces[0].PlanStepId)
	assert.Equal(t, "dify:my-agent", traces[0].Endpoint)
	assert.Equal(t, "Base64", traces[0].AttackMethod)
	assert.Equal(t, 1, traces[0].Turn)
	assert.Equal(t, "response", traces[1].Direction)
	assert.Equal(t, "error", traces[2].Direction)
}

// AIInfraScanAgent测试用例
func TestAIInfraScanAgentExecution(t *testing.T) {
	agent := &AIInfraScanAgent{}
	// 创建扫描请求参数
	scanParams := ScanRequest{
		Headers: map[string]string{
			"User-Agent": "AI-Infra-Guard/1.0",
		},
		Timeout: 60,
	}
	paramsJSON, _ := json.Marshal(scanParams)

	request := TaskRequest{
		SessionId:   "scan-session-456",
		TaskType:    TaskTypeAIInfraScan,
		Params:      paramsJSON,
		Timeout:     60,
		Content:     "https://www.qq.com\nhttps://www.baidu.com",
		Language:    "zh",
		Attachments: []string{},
	}

	// 创建mock回调
	mockCallbacks := NewMockCallbacks()
	callbacks := mockCallbacks.GetCallbacks()

	// 执行agent
	ctx := context.Background()
	err := agent.Execute(ctx, request, callbacks)

	// 这个测试需要可用的 WebServer 加载远程指纹库
	if err != nil {
		t.Logf("AI基础设施扫描执行失败（预期的，因为需要WebServer环境）: %v", err)
	}
}

// McpTask测试用例 - URL扫描
func TestMcpTaskExecutionWithURL(t *testing.T) {
	agent := &McpTask{}

	// 创建MCP扫描请求参数 - URL扫描
	mcpParams := map[string]interface{}{
		"model": map[string]string{
			"model":    TestModelName,
			"token":    TestToken,
			"base_url": TestBaseUrl,
		},
	}
	paramsJSON, _ := json.Marshal(mcpParams)

	request := TaskRequest{
		SessionId:   "mcp-session-789",
		TaskType:    TaskTypeMcpScan,
		Params:      paramsJSON,
		Timeout:     120,
		Content:     "",
		Language:    "zh",
		Attachments: []string{},
	}

	// 创建mock回调
	mockCallbacks := NewMockCallbacks()
	callbacks := mockCallbacks.GetCallbacks()

	// 执行agent
	ctx := context.Background()
	err := agent.Execute(ctx, request, callbacks)

	// 这个测试需要Python环境和CLI工具
	if err != nil {
		t.Logf("MCP扫描执行失败（预期的，因为需要Python CLI环境）: %v", err)
	}

	assert.Equal(t, TaskTypeMcpScan, agent.GetName())
}

// ModelRedteamReport测试用例
func TestModelRedteamReportExecution(t *testing.T) {
	agent := &ModelRedteamReport{}

	// 创建红队报告请求参数
	type redteamParams struct {
		Model []struct {
			BaseUrl string `json:"base_url"`
			Token   string `json:"token"`
			Model   string `json:"model"`
		} `json:"model"`
		Datasets struct {
			NumPrompts int `json:"numPrompts"`
			RandomSeed int `json:"randomSeed"`
		} `json:"datasets"`
	}
	params := redteamParams{
		Model: []struct {
			BaseUrl string `json:"base_url"`
			Token   string `json:"token"`
			Model   string `json:"model"`
		}{
			{
				BaseUrl: TestBaseUrl,
				Token:   TestToken,
				Model:   TestModelName,
			},
		},
		Datasets: struct {
			NumPrompts int `json:"numPrompts"`
			RandomSeed int `json:"randomSeed"`
		}{
			NumPrompts: 10,
			RandomSeed: 42,
		},
	}

	paramsJSON, _ := json.Marshal(params)

	request := TaskRequest{
		SessionId:   "redteam-session-202",
		TaskType:    TaskTypeModelRedteamReport,
		Params:      paramsJSON,
		Timeout:     300,
		Content:     "红队测试内容",
		Language:    "zh",
		Attachments: []string{},
	}

	// 创建mock回调
	mockCallbacks := NewMockCallbacks()
	callbacks := mockCallbacks.GetCallbacks()

	// 执行agent
	ctx := context.Background()
	err := agent.Execute(ctx, request, callbacks)

	// 这个测试需要Python环境和CLI工具
	if err != nil {
		t.Logf("红队测试执行失败（预期的，因为需要Python CLI环境）: %v", err)
	}

	assert.Equal(t, TaskTypeModelRedteamReport, agent.GetName())
}
