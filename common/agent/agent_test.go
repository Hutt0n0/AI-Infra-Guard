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
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	"testing"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newAgentTestServer 起一个本地 WebSocket 服务器供 agent 回环连接。
// 返回 server 与一个 channel：每收到一条 agent 消息投递一条原始 payload。
func newAgentTestServer(t *testing.T) (*httptest.Server, <-chan []byte) {
	t.Helper()
	received := make(chan []byte, 16)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			received <- msg
		}
	}))
	t.Cleanup(srv.Close)
	return srv, received
}

// wsURL 把 httptest server URL 转成 ws:// 地址
func wsURL(srv *httptest.Server) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

// TestLargeDataSend 测试发送大字节数据（本地回环 WebSocket 服务器，真实走 sendChan → conn 链路）
func TestLargeDataSend(t *testing.T) {
	srv, received := newAgentTestServer(t)

	agent := NewAgent(AgentConfig{
		ServerURL: wsURL(srv) + "/api/v1/agents/ws",
		Info: AgentInfo{
			ID:       "test-large-data",
			HostName: "test-host",
			IP:       "127.0.0.1",
			Version:  "0.1",
			Metadata: "",
		},
	})
	require.NoError(t, agent.connect())
	go agent.handleSend()
	go agent.handleReceive()

	// 注册消息应先到达
	regMsg := <-received
	var regEnvelope map[string]interface{}
	require.NoError(t, json.Unmarshal(regMsg, &regEnvelope))
	assert.Equal(t, "register", regEnvelope["type"])

	// 创建大数据内容 - 生成约1MB的数据
	largeContent := generateLargeContent(1024 * 1024) // 1MB

	// 创建包含大数据的任务结果
	largeResult := map[string]interface{}{
		"type":        "large_data_test",
		"timestamp":   time.Now().Unix(),
		"data_size":   len(largeContent),
		"content":     largeContent,
		"description": "测试发送大字节数据的能力",
		"metadata": map[string]interface{}{
			"compression": false,
			"encoding":    "utf-8",
			"chunks":      1,
		},
	}

	// 测试通过 sendChan → conn 真实发送大数据
	sessionId := "test-session-large-data"
	require.NoError(t, agent.SendTaskResult(sessionId, largeResult))

	// 等待结果消息到达并校验完整性
	resultMsg := <-received
	var envelope struct {
		Type    string          `json:"type"`
		Content json.RawMessage `json:"content"`
	}
	require.NoError(t, json.Unmarshal(resultMsg, &envelope))
	assert.Equal(t, "resultUpdate", envelope.Type)

	var update struct {
		SessionId string                 `json:"sessionId"`
		Event     map[string]interface{} `json:"event"`
	}
	require.NoError(t, json.Unmarshal(envelope.Content, &update))
	assert.Equal(t, sessionId, update.SessionId)
	assert.Equal(t, float64(len(largeContent)), update.Event["result"].(map[string]interface{})["data_size"])

	t.Log("大字节数据发送测试完成（1MB 经真实 WebSocket 回环往返）")
}

// generateLargeContent 生成指定大小的大内容
func generateLargeContent(size int) string {
	// 创建基础模板
	template := "这是一段测试数据，用于验证大字节数据的传输能力。包含中文字符以测试编码处理。Data chunk %d. "

	var builder strings.Builder
	builder.Grow(size) // 预分配容量

	chunkCount := 0
	for builder.Len() < size {
		chunk := fmt.Sprintf(template, chunkCount)
		if builder.Len()+len(chunk) > size {
			// 添加剩余字符直到达到目标大小
			remaining := size - builder.Len()
			builder.WriteString(chunk[:remaining])
			break
		}
		builder.WriteString(chunk)
		chunkCount++
	}

	return builder.String()
}
