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

"""Agent target model: run jailbreak/redteam evaluations against an AI agent.

Wraps agent-scan's ``AIProviderClient`` so the red-team engine (deepteam) can
treat any configured agent — custom HTTP protocol, SSE streaming, two-step
chains, etc. — as a scan target, exactly like Agent-Scan does.

The provider YAML is the same format used by Agent-Scan ("管理Agent" configs),
so a single agent definition can serve both modules.
"""

import asyncio
import os
import sys

from cli.model_utils.base import BaseLLM


class AgentTargetModel(BaseLLM):
    """Red-team target backed by an agent provider config (agent-scan SDK)."""

    max_trial = 3
    base_wait_seconds = 0.5

    def __init__(
        self,
        agent_provider_file: str,
        agent_scan_dir: str,
        label: str = "",
        max_concurrent: int = 4,
        timeout: int = 300,
        *args,
        **kwargs,
    ):
        self.agent_provider_file = agent_provider_file
        self.agent_scan_dir = agent_scan_dir
        self.label = label or os.path.splitext(os.path.basename(agent_provider_file))[0]
        # Keep a generous per-call timeout: agents can be slow (SSE streams,
        # internal tool calls), far slower than a bare LLM completion.
        self.provider_timeout = timeout
        super().__init__(
            model_name=self.label,
            base_url="",
            api_key="",
            max_concurrent=max_concurrent,
        )
        self.load_model()

    def _get_client_and_provider(self):
        """Import agent-scan lazily and return (client, provider).

        Imported on first use (and cached) so cli_run.py does not pay the
        import cost unless an agent target is actually requested, and so the
        agent-scan package only needs to be importable, not preinstalled.
        """
        if getattr(self, "_provider", None) is None:
            if self.agent_scan_dir not in sys.path:
                sys.path.insert(0, self.agent_scan_dir)
            from agent_scan.core.agent_adapter.adapter import AIProviderClient

            client = AIProviderClient(timeout=self.provider_timeout)
            providers = client.load_config_from_file(self.agent_provider_file)
            if not providers:
                raise ValueError(f"No agent provider found in {self.agent_provider_file}")
            self._client = client
            self._provider = providers[0]
        return self._client, self._provider

    def load_model(self):
        """Preload the provider config eagerly so failures surface at startup."""
        self._get_client_and_provider()
        return None

    def test_model_connection(self):
        """Probe the agent with the standard connectivity prompt."""
        try:
            client, provider = self._get_client_and_provider()
            result = client.call_provider(provider, "Only return 1")
            if result.success:
                output = (result.provider_response.output or "") if result.provider_response else ""
                return True, output[:200] or "agent responded successfully"
            return False, result.message or "agent call failed"
        except Exception as e:  # noqa: BLE001
            return False, str(e)

    def _call_agent(self, prompt: str) -> str:
        """One synchronous provider call with bounded retries."""
        last_error = ""
        for attempt in range(self.max_trial):
            try:
                client, provider = self._get_client_and_provider()
                result = client.call_provider(provider, prompt)
                if result.success and result.provider_response:
                    output = result.provider_response.output
                    if isinstance(output, str) and output:
                        return output
                    # HTTP 200 但正文为空：多数情况是上游内容风控（如京东
                    # lps 返回 code=-32603 时空 textContent）。把上游原始
                    # 状态带进错误信息，方便区分"agent 拒答"与"调用失败"。
                    raw = result.provider_response.raw
                    upstream_code = None
                    if isinstance(raw, dict):
                        upstream_code = raw.get("code") or (raw.get("error") or {}).get("code")
                    if upstream_code is not None and str(upstream_code) not in ("0", "None"):
                        last_error = f"agent returned empty output (upstream code: {upstream_code})"
                    else:
                        last_error = result.provider_response.error or "empty agent response"
                else:
                    last_error = result.message or "agent call failed"
            except Exception as e:  # noqa: BLE001
                last_error = str(e)
            # Brief backoff before the next attempt (skip after the final one)
            if attempt < self.max_trial - 1:
                time_sleep = self.base_wait_seconds * (2 ** attempt)
                import time

                time.sleep(time_sleep)
        return ""

    def generate(self, prompt: str = None, messages: list = None, *args, **kwargs) -> str:
        """Synchronous generation: send the last user message to the agent.

        The red-team engine exchanges flat attack prompts, so multi-turn
        ``messages`` payloads are collapsed to their final user turn.
        """
        text = self._extract_prompt(prompt, messages)
        if text is None:
            raise ValueError("prompt and messages cannot both be empty")
        return self._call_agent(text)

    async def a_generate(self, prompt: str = None, messages: list = None, *args, **kwargs) -> str:
        """Async generation: run the blocking provider call in a worker thread.

        The agent-scan SDK is synchronous (requests-based); concurrency is
        bounded by the inherited semaphore, mirroring Agent-Scan's own
        dialogue concurrency cap.
        """
        text = self._extract_prompt(prompt, messages)
        if text is None:
            raise ValueError("prompt and messages cannot both be empty")
        async with self.semaphore:
            return await asyncio.to_thread(self._call_agent, text)

    @staticmethod
    def _extract_prompt(prompt: str, messages) -> "str | None":
        if prompt:
            return prompt
        if messages:
            for msg in reversed(messages):
                role = (msg.get("role") or "").lower() if isinstance(msg, dict) else ""
                if role in ("user", "human"):
                    return msg.get("content") or None
            # Fallback: last dict message regardless of role
            if isinstance(messages[-1], dict):
                return messages[-1].get("content") or None
        return None

    def get_model_name(self):
        return self.model_name
