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
import json
import os
import sys
import threading
import time
from pathlib import Path

from cli.model_utils.base import BaseLLM

try:
    from cli.trace_utils import set_wire_context
except Exception:  # trace utils unavailable — capture still works, meta just empty
    def set_wire_context(**kwargs):
        pass


class _AgentSession:
    """一个 case 的多轮会话状态：本地键 → 上游会话 ID（由代理经响应头回传）。"""

    __slots__ = ("session_id", "conversation_id", "turns")

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.conversation_id = ""
        self.turns = 0


# ---------------------------------------------------------------------------
# Wire capture（发往受测 agent 的所有请求/响应原始报文留存）
#
# 格式与 JDAPP-DAI toolkit 的 dong_*.http 一致（wire 格式，一轮一文件）：
#   请求行 + 请求头 + 空行 + 请求体 + 空行 + 响应状态行 + 响应头 + 空行 + 响应体
# 产出: logs/target_captures/<label>_<ts>_<seq>.http
# ---------------------------------------------------------------------------

_capture_lock = threading.Lock()
_capture_seq = 0


def _resolve_capture_dir() -> Path:
    """抓包目录锚定仓库根的 logs/target_captures/（server API 按同一根解析）。

    Python 子进程 cwd = AIG-PromptSecurity/（uv run 由 Go 侧 cmd.Dir 指定），
    直接相对路径会写进 AIG-PromptSecurity/logs/ 而 server 读不到。向上找
    仓库锚点（data/eval），找不到（如打包部署）退回 cwd。
    """
    env_dir = os.environ.get("AIG_TARGET_CAPTURE_DIR")
    if env_dir:
        return Path(env_dir)
    cur = Path.cwd().resolve()
    for p in (cur, *cur.parents):
        if (p / "data" / "eval").is_dir():
            return p / "logs" / "target_captures"
    return Path("logs/target_captures")


def _save_wire_capture(method: str, url: str, req_headers, req_body,
                       status, resp_headers, resp_body: bytes, error: str = "",
                       label: str = "target") -> str:
    """一轮目标交互的完整请求/响应报文落盘。失败不影响主流程。"""
    global _capture_seq
    try:
        with _capture_lock:
            _capture_seq += 1
            seq = _capture_seq
            ts = time.strftime("%Y%m%d_%H%M%S")
            safe_label = (label or "target").replace("/", "_").replace(" ", "_")
            capture_dir = _resolve_capture_dir()
            capture_dir.mkdir(parents=True, exist_ok=True)
            fp = capture_dir / f"{safe_label}_{ts}_{seq:03d}.http"

        # 请求行：从 URL 拆出 path
        try:
            from urllib.parse import urlsplit
            parts = urlsplit(url)
            path = parts.path or "/"
            if parts.query:
                path += "?" + parts.query
            host = parts.netloc
        except Exception:
            path, host = url, ""

        if isinstance(req_body, bytes):
            req_body_text = req_body.decode("utf-8", "replace")
        else:
            req_body_text = req_body if isinstance(req_body, str) else json.dumps(req_body, ensure_ascii=False)

        lines = [f"{method} {path} HTTP/1.1"]
        if host:
            lines.append(f"Host: {host}")
        for k, v in (req_headers or {}).items():
            lines.append(f"{k}: {v}")
        lines.append("")
        lines.append(req_body_text)
        lines.append("")

        if error and not status:
            lines.append(f"HTTP/1.1 <TRANSPORT-ERROR> {error}")
        else:
            lines.append(f"HTTP/1.1 {status}")
            for k, v in (resp_headers or {}).items():
                lines.append(f"{k}: {v}")
            lines.append("")
            if isinstance(resp_body, bytes):
                lines.append(resp_body.decode("utf-8", "replace"))
            elif isinstance(resp_body, str):
                lines.append(resp_body)
            else:
                lines.append(json.dumps(resp_body, ensure_ascii=False))

        fp.write_text("\n".join(lines), encoding="utf-8")
        return str(fp)
    except Exception:
        return ""


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
        # 多轮会话注册表：session_id（SessionScope 生成）→ 上游会话状态。
        # _call_agent 经 asyncio.to_thread 执行，需线程锁保护。
        self._sessions: dict = {}
        self._sessions_lock = threading.Lock()
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
                self._emit_connection_trace(True, output[:200])
                return True, output[:200] or "agent responded successfully"
            self._emit_connection_trace(False, "", result.message or "agent call failed")
            return False, result.message or "agent call failed"
        except Exception as e:  # noqa: BLE001
            self._emit_connection_trace(False, "", str(e))
            return False, str(e)

    # ------------------------------------------------------------------
    # Session registry（多轮会话承载）
    # ------------------------------------------------------------------
    def open_session(self) -> str:
        """开一个本地会话（不触发上游调用；上游会话随首次带 session 的请求建立）。"""
        from uuid import uuid4

        sid = uuid4().hex
        with self._sessions_lock:
            self._sessions[sid] = _AgentSession(sid)
        return sid

    def close_session(self, session_id: str):
        """评估结束驱逐会话，防 long-run 任务累积（并发数即活跃会话数上限）。"""
        if not session_id:
            return
        with self._sessions_lock:
            self._sessions.pop(session_id, None)

    def _supports_session(self) -> bool:
        """provider body 含 {{session_id}} 占位符即视为支持会话；
        否则静默退化为逐轮独立调用（与历史行为一致）。"""
        try:
            _, provider = self._get_client_and_provider()
            body = getattr(provider.config, "body", None)
            return isinstance(body, str) and "{{session_id}}" in body
        except Exception:
            return False

    def _call_agent(self, prompt: str, session_id: str = None) -> str:
        """One synchronous provider call with bounded retries.

        带 session_id 时：将上游会话 ID 注入 body 的 {{session_id}} 占位符，
        并从响应头 X-Session-Id 回读上游会话（上游重置时自愈更新）。
        """
        sess = None
        if session_id:
            with self._sessions_lock:
                sess = self._sessions.get(session_id)
            if sess is None:
                # SessionScope 先 open_session；防御未登记的键：现场补登记
                sess = _AgentSession(session_id)
                with self._sessions_lock:
                    self._sessions[session_id] = sess

        last_error = ""
        for attempt in range(self.max_trial):
            try:
                client, provider = self._get_client_and_provider()
                call_provider_obj = provider
                if self._supports_session():
                    # 会话占位符替换：有会话注入会话 ID；无会话（评估期重发/
                    # 预校验探针等单轮调用）替换为空串——否则字面
                    # "{{session_id}}" 会原样发给上游（被代理当新会话）。
                    call_provider_obj = provider.model_copy(deep=True)
                    call_provider_obj.config.body = call_provider_obj.config.body.replace(
                        "{{session_id}}",
                        json.dumps(sess.conversation_id)[1:-1] if sess is not None else "",
                    )
                # wire 抓包：渲染完整请求体（含 prompt 与 session_id），与实际
                # 发出的报文一致。渲染逻辑与 adapter._render_prompt_body 相同。
                cfg = call_provider_obj.config
                capture_url = cfg.url or ""
                capture_headers = dict(cfg.headers) if cfg.headers else {}
                if capture_headers and "Content-Type" not in capture_headers and "content-type" not in capture_headers:
                    capture_headers["Content-Type"] = "application/json"
                try:
                    body_tpl = cfg.body
                    body_str = json.dumps(body_tpl, ensure_ascii=False) if isinstance(body_tpl, (dict, list)) else str(body_tpl or "")
                    json_escaped_prompt = json.dumps(prompt, ensure_ascii=False)[1:-1]
                    capture_body = body_str.replace("{{prompt}}", json_escaped_prompt).replace("{{prompt_json}}", json_escaped_prompt)
                except Exception:
                    capture_body = prompt
                # 渲染后的 body 传给 adapter 渲染反而会二次转义——仍传原始
                # provider（未替换 {{prompt}}），这里渲染仅供抓包展示。
                result = client.call_provider(call_provider_obj, prompt)
                capture_status = None
                capture_resp_headers = {}
                capture_resp_body = ""
                capture_error = ""
                if result.success and result.provider_response:
                    pr = result.provider_response
                    # 回读上游会话 ID（代理经 X-Session-Id 响应头返回）
                    headers = pr.headers or {}
                    new_conv = None
                    for k, v in headers.items():
                        if k.lower() == "x-session-id":
                            new_conv = v
                            break
                    if sess is not None and new_conv:
                        sess.conversation_id = str(new_conv)
                    if new_conv and sess is not None:
                        sess.turns += 1

                    capture_status = (pr.metadata or {}).get("status_code")
                    capture_resp_headers = headers
                    capture_resp_body = pr.raw if isinstance(pr.raw, str) else json.dumps(pr.raw, ensure_ascii=False) if pr.raw is not None else ""

                    output = pr.output
                    if isinstance(output, str) and output:
                        cap_file = _save_wire_capture(
                            (cfg.method or "POST").upper(), capture_url, capture_headers, capture_body,
                            capture_status, capture_resp_headers, capture_resp_body, label=self.label)
                        # wire 上下文：traced wrapper 取走并入 response trace meta。
                        # 只带文件路径（报文可能几十 KB，避免任务详情接口膨胀），
                        # 前端经 /api/v1/app/target-capture?file=... 按需读取原文。
                        try:
                            set_wire_context(
                                session_id=sess.conversation_id if sess else "",
                                wire_capture=os.path.basename(cap_file) if cap_file else "",
                            )
                        except Exception:
                            pass
                        return output
                    # HTTP 200 但正文为空：多数情况是上游内容风控（如京东
                    # lps 返回 code=-32603 时空 textContent）。把上游原始
                    # 状态带进错误信息，方便区分"agent 拒答"与"调用失败"。
                    raw = pr.raw
                    upstream_code = None
                    if isinstance(raw, dict):
                        upstream_code = raw.get("code") or (raw.get("error") or {}).get("code")
                    if upstream_code is not None and str(upstream_code) not in ("0", "None"):
                        last_error = f"agent returned empty output (upstream code: {upstream_code})"
                    else:
                        last_error = pr.error or "empty agent response"
                else:
                    last_error = result.message or "agent call failed"
                _save_wire_capture(
                    (cfg.method or "POST").upper(), capture_url, capture_headers, capture_body,
                    capture_status, capture_resp_headers, capture_resp_body,
                    error=last_error, label=self.label)
            except Exception as e:  # noqa: BLE001
                last_error = str(e)
                try:
                    _save_wire_capture(
                        (cfg.method or "POST").upper(), capture_url,
                        capture_headers, capture_body, None, {}, "", error=last_error, label=self.label)
                except Exception:
                    pass
            # Brief backoff before the next attempt (skip after the final one)
            if attempt < self.max_trial - 1:
                time_sleep = self.base_wait_seconds * (2 ** attempt)
                time.sleep(time_sleep)
        return ""

    def generate(self, prompt: str = None, messages: list = None, *args, **kwargs) -> str:
        """Synchronous generation: send the last user message to the agent.

        The red-team engine exchanges flat attack prompts, so multi-turn
        ``messages`` payloads are collapsed to their final user turn.
        session_id kwarg（SessionScope 注入）路由到同一上游会话；不传时
        行为与历史版本完全一致。
        """
        text = self._extract_prompt(prompt, messages)
        if text is None:
            raise ValueError("prompt and messages cannot both be empty")
        return self._call_agent(text, session_id=kwargs.get("session_id"))

    async def a_generate(self, prompt: str = None, messages: list = None, *args, **kwargs) -> str:
        """Async generation: run the blocking provider call in a worker thread.

        The agent-scan SDK is synchronous (requests-based); concurrency is
        bounded by the inherited semaphore, mirroring Agent-Scan's own
        dialogue concurrency cap. session_id kwarg 同步路径语义一致。
        """
        text = self._extract_prompt(prompt, messages)
        if text is None:
            raise ValueError("prompt and messages cannot both be empty")
        async with self.semaphore:
            return await asyncio.to_thread(
                self._call_agent, text, kwargs.get("session_id")
            )

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
