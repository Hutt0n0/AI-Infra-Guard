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
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/Tencent/AI-Infra-Guard/common/utils"
)

// CampaignTask 对抗战役：课题驱动的长时自主攻击循环。
// Python 侧为 AIG-PromptSecurity/campaign_run.py（独立入口，体检链路不受影响）。
type CampaignTask struct {
	Server string
}

func (m *CampaignTask) GetName() string {
	return TaskTypeCampaign
}

func (m *CampaignTask) Execute(ctx context.Context, request TaskRequest, callbacks TaskCallbacks) error {
	type params struct {
		Model           []ModelParams `json:"model"`
		EvalModel       ModelParams   `json:"eval_model"`
		TargetAgent     string        `json:"target_agent"` // agent YAML content
		Techniques      []string      `json:"techniques"`
		RoundsPerMethod int           `json:"roundsPerMethod"`
	}
	var param params
	if err := json.Unmarshal(request.Params, &param); err != nil {
		// 与体检同款双形状兼容：dispatchTask 对单 model_id 注入对象、数组注入列表
		var compat struct {
			Model           json.RawMessage `json:"model"`
			EvalModel       ModelParams     `json:"eval_model"`
			TargetAgent     string          `json:"target_agent"`
			Techniques      []string        `json:"techniques"`
			RoundsPerMethod int             `json:"roundsPerMethod"`
		}
		if err2 := json.Unmarshal(request.Params, &compat); err2 != nil {
			return err2
		}
		param.EvalModel = compat.EvalModel
		param.TargetAgent = compat.TargetAgent
		param.Techniques = compat.Techniques
		param.RoundsPerMethod = compat.RoundsPerMethod
		if len(compat.Model) > 0 {
			trimmed := bytes.TrimLeft(compat.Model, " \t\n\r")
			if len(trimmed) > 0 && trimmed[0] == '{' {
				var one ModelParams
				if err2 := json.Unmarshal(compat.Model, &one); err2 != nil {
					return err2
				}
				param.Model = []ModelParams{one}
			} else if err2 := json.Unmarshal(compat.Model, &param.Model); err2 != nil {
				return err2
			}
		}
	}

	// 课题 = 任务 content（与体检 Custom:prompt 同通道）
	topic := strings.TrimSpace(request.Content)
	if topic == "" {
		return fmt.Errorf("campaign topic is required (task content)")
	}
	if param.RoundsPerMethod <= 0 {
		param.RoundsPerMethod = 3
	}
	if param.RoundsPerMethod > 10 {
		param.RoundsPerMethod = 10
	}
	if len(param.Model) == 0 {
		return fmt.Errorf("campaign requires a driving model (params.model)")
	}
	if request.Language == "" {
		request.Language = "zh"
	}

	var argv []string = make([]string, 0)
	argv = append(argv, "run", "--no-project", "campaign_run.py")
	argv = append(argv, "--async_mode")
	argv = append(argv, "--topic", topic)
	argv = append(argv, "--rounds_per_method", strconv.Itoa(param.RoundsPerMethod))
	argv = append(argv, "--session_id", request.SessionId)

	// Agent target（与体检同构：临时 YAML + agent-scan SDK 目录）
	if strings.TrimSpace(param.TargetAgent) != "" {
		argv = append(argv, "--target_type", "agent")
		argv = append(argv, "--agent_max_concurrent", "4")

		agentScanDir, err := utils.ResolveAgentScanDir()
		if err != nil {
			return fmt.Errorf("resolve agent-scan directory: %v", err)
		}
		argv = append(argv, "--agent_scan_dir", agentScanDir)

		tmpFile, err := os.CreateTemp("", "campaign_agent_target_*.yaml")
		if err != nil {
			return fmt.Errorf("create temp agent config: %v", err)
		}
		defer os.Remove(tmpFile.Name())
		if _, err := tmpFile.WriteString(param.TargetAgent); err != nil {
			tmpFile.Close()
			return fmt.Errorf("write temp agent config: %v", err)
		}
		tmpFile.Close()
		argv = append(argv, "--agent_provider", tmpFile.Name())
	}

	for _, model := range param.Model {
		if model.Limit == 0 {
			model.Limit = 1000
		}
		argv = append(argv, "--model", model.Model)
		argv = append(argv, "--base_url", model.BaseUrl)
		argv = append(argv, "--api_key", model.Token)
		argv = append(argv, "--max_concurrent", fmt.Sprintf("%d", model.Limit))
	}

	// 评估模型（环境变量兜底，优先级与体检一致）
	evalParams, err := getDefaultEvalModel()
	if err == nil {
		argv = append(argv, "--evaluate_model", evalParams.Model)
		argv = append(argv, "--eval_base_url", evalParams.BaseUrl)
		argv = append(argv, "--eval_api_key", evalParams.Token)
	} else {
		if param.EvalModel.Model == "" {
			return fmt.Errorf("campaign requires an evaluation model (params.eval_model)")
		}
		argv = append(argv, "--evaluate_model", param.EvalModel.Model)
		argv = append(argv, "--eval_base_url", param.EvalModel.BaseUrl)
		argv = append(argv, "--eval_api_key", param.EvalModel.Token)
	}

	// 攻击方法：不传则 Python 侧默认 strategy_map 全量
	if len(param.Techniques) > 0 {
		argv = append(argv, "--techniques")
		argv = append(argv, param.Techniques...)
	}

	argv = append(argv, "--lang", request.Language)

	planTitles := []string{"初始化战役参数", "执行对抗轮次", "生成战役报告"}
	planTitlesEn := []string{"Campaign initialization", "Adversarial rounds", "Generating campaign report"}
	if !(strings.ToLower(request.Language) == "zh" || strings.ToLower(request.Language) == "zh_cn") {
		planTitles = planTitlesEn
	}
	var tasks []SubTask
	for i, title := range planTitles {
		tasks = append(tasks, CreateSubTask(SubTaskStatusTodo, title, 0, strconv.Itoa(i+1)))
	}
	callbacks.PlanUpdateCallback(tasks)
	config := CmdConfig{StatusId: ""}
	promptSecurityDir, err := utils.ResolvePromptSecurityDir()
	if err != nil {
		return fmt.Errorf("resolve AIG-PromptSecurity directory: %v", err)
	}
	uvBin, err := utils.ResolveUvBin()
	if err != nil {
		return fmt.Errorf("resolve uv binary: %v", err)
	}
	// upload=true：战报 CSV 附件自动上传并改写为服务端 URL（体检同款链路）
	err = utils.RunCmdWithContext(ctx, promptSecurityDir, uvBin, argv, func(line string) {
		ParseStdoutLine(m.Server, promptSecurityDir, tasks, line, callbacks, &config, true)
	})
	return err
}
