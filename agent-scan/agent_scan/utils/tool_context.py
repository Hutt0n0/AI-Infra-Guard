# Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Requirement: Any integration or derivative work must explicitly attribute
# Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
# documentation or user interface, as detailed in the NOTICE file.

"""
工具执行上下文 - 提供工具运行所需的环境信息
"""
import json
import time
import uuid
from typing import List, Dict, Any, Optional, TYPE_CHECKING

from agent_scan.core.agent_adapter.adapter import AIProviderClient, ProviderOptions
from agent_scan.utils.aig_logger import scanLogger

if TYPE_CHECKING:  # pragma: no cover
    from agent_scan.tools.dispatcher import ToolDispatcher
from agent_scan.utils.llm import LLM


class ToolContext:
    """工具执行上下文，包含历史记录、LLM实例等信息"""

    def __init__(
            self,
            llm: LLM = None,
            history: List[Dict[str, str]] = [],
            agent_name: str = "Agent",
            iteration: int = 0,
            specialized_llms: Optional[Dict[str, LLM]] = None,
            folder: Optional[str] = None,
            agent_provider: Optional[ProviderOptions] = None,
            language: str = "zh",
            step_id: str = None
    ):
        """
        初始化工具上下文
        """
        self.llm = llm
        self.history = history
        self.agent_name = agent_name
        self.iteration = iteration
        self.specialized_llms = specialized_llms or {}
        self.folder = folder
        self.client = AIProviderClient()
        self.agent_provider: ProviderOptions = agent_provider
        self.language = language
        self.step_id = step_id

    def get_llm(self, purpose: str = "default") -> LLM:
        """
        根据用途获取合适的LLM
        
        Args:
            purpose: LLM用途，如 "thinking", "coding", "default"
            
        Returns:
            LLM实例
        """
        if purpose in self.specialized_llms:
            return self.specialized_llms[purpose]
        return self.llm

    def get_recent_history(self, n: int = 5) -> List[Dict[str, str]]:
        """
        获取最近的n条历史记录
        
        Args:
            n: 历史记录条数
            
        Returns:
            历史记录列表
        """
        return self.history[-n:] if len(self.history) > n else self.history

    def call_provider(self, prompt: str):
        """Call the target agent and emit the full request/response as message traces.

        Every dialogue with the target agent flows through here, so this is the
        single instrumentation point for the target-communication trace stream.
        """
        if self.agent_provider is None:
            raise ValueError("Agent provider not set")

        step_id = self.step_id or ""
        endpoint = self.agent_provider.id or ""
        if self.agent_provider.label:
            endpoint = f"{endpoint} ({self.agent_provider.label})"

        trace_id = uuid.uuid4().hex
        scanLogger.message_trace(
            trace_id=trace_id,
            direction="request",
            tool="target_dialogue",
            stepId=step_id,
            endpoint=endpoint,
            payload=prompt,
            phase=self.agent_name,
        )

        start_time = time.time()
        try:
            result = self.client.call_provider(self.agent_provider, prompt)
        except Exception as e:  # noqa: BLE001
            scanLogger.message_trace(
                trace_id=trace_id,
                direction="error",
                tool="target_dialogue",
                stepId=step_id,
                endpoint=endpoint,
                payload=str(e),
                phase=self.agent_name,
                meta=json.dumps({"elapsed_ms": int((time.time() - start_time) * 1000)}, ensure_ascii=False),
            )
            raise

        # Best-effort metadata: HTTP status / elapsed / transport from the response info
        meta = json.dumps({"elapsed_ms": int((time.time() - start_time) * 1000)}, ensure_ascii=False)
        payload = ""
        if result.provider_response is not None:
            pr = result.provider_response
            meta_dict = {
                "elapsed_ms": int((time.time() - start_time) * 1000),
            }
            for key in ("status_code", "transport", "is_sse"):
                value = (pr.metadata or {}).get(key)
                if value is not None:
                    meta_dict[key] = value
            if pr.token_usage:
                meta_dict["token_usage"] = pr.token_usage
            meta = json.dumps(meta_dict, ensure_ascii=False)
            payload = pr.output or ""
            if not result.success:
                payload = pr.error or result.message or payload

        direction = "response" if result.success else "error"
        scanLogger.message_trace(
            trace_id=trace_id,
            direction=direction,
            tool="target_dialogue",
            stepId=step_id,
            endpoint=endpoint,
            payload=payload,
            phase=self.agent_name,
            meta=meta,
        )
        return result

    def call_llm(
            self,
            prompt: str,
            purpose: str = "default",
            system_prompt: Optional[str] = None,
            use_history: bool = False
    ) -> str:
        """
        调用LLM获取响应
        
        Args:
            prompt: 用户提示
            purpose: LLM用途
            system_prompt: 系统提示（可选）
            use_history: 是否使用历史记录
            
        Returns:
            LLM响应内容
        """
        llm = self.get_llm(purpose)

        messages = []

        # 添加系统提示
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # 添加历史记录（如果需要）
        if use_history:
            messages.extend(self.history[1:])

        # 添加当前提示
        messages.append({"role": "user", "content": prompt})

        return llm.chat(messages)

    def call_llm_messages(
            self,
            messages,
            purpose: str = "default",
    ) -> str:
        llm = self.get_llm(purpose)
        return llm.chat(messages)

    async def call_subagent(self, description: str, template: str, prompt: str, stage_id: str,
                            language: str = "zh", repo_dir: str | None = None, context_data: dict | None = None):
        # Lazy imports to avoid circular dependency
        from agent_scan.core.base_agent import run_agent
        from agent_scan.tools.task.task import load_agent_prompt, get_all_agents
        agent_instruction = load_agent_prompt(template)

        if agent_instruction is None:
            available = get_all_agents()
            available_names = [a['name'] for a in available]

            return {
                "success": False,
                "error": f"Unknown agent type: {template}. Available agents: {', '.join(available_names) if available_names else 'none'}"
            }

        instruction = load_agent_prompt(template)["raw"]
        result = await run_agent(description, instruction, self.llm, prompt, stage_id, self.specialized_llms,
                                 self.agent_provider, language,
                                 repo_dir,
                                 context_data)
        return result
