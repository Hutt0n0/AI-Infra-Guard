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

"""SessionScope — 把 per-case 会话绑定进多轮攻击的 model_callback。

多轮攻击（Crescendo/PAIR/Linear 等）的 CallbackType 契约是 (str) -> str：
每轮发一条文本、收一条回复。目标侧会话状态无法经该签名传递，因此由
SessionScope 在 enhance 边界把回调闭包绑定到本 case 的会话上：

    scope = SessionScope(session_id=..., vulnerability=..., attack_method=...)
    wrapped = scope.bind(target_model, original_callback)
    # multi_turn 攻击拿到的 wrapped 回调每轮自动携带同一 session_id

- 会话 id 经 model.a_generate/generate 的 session_id kwarg 下发
  （AgentTargetModel 据此路由到同一上游会话；不支持会话的模型忽略该
  kwarg，退化为逐轮独立调用，即 deepteam 原行为）。
- transcript 逐轮记录 attack/response，供报告展示与评估阶段直接取用
  末轮响应（避免冷启动重发末轮导致误判）。
"""

from typing import Callable, List, Optional
import inspect

from cli.trace_utils import set_trace_context


class SessionScope:
    """一个 case 的多轮会话范围：会话键 + 轮次记录。"""

    def __init__(
        self,
        session_id: str,
        vulnerability: str = "",
        attack_method: str = "",
        endpoint: str = "",
    ):
        self.session_id = session_id
        self.vulnerability = vulnerability
        self.attack_method = attack_method
        self.endpoint = endpoint
        self.transcript: List[dict] = []

    # ------------------------------------------------------------------
    def _supports_session(self, fn: Callable) -> bool:
        """回调是否接受 session_id kwarg（traced wrapper 不透传 kwargs，
        所以探测的是被包一层后的签名——统一宽松：仅当原始 model 的
        a_generate/generate 接受 session_id 时才走会话路径）。"""
        try:
            sig = inspect.signature(fn)
            return "session_id" in sig.parameters or any(
                p.kind == inspect.Parameter.VAR_KEYWORD
                for p in sig.parameters.values()
            )
        except (TypeError, ValueError):
            return False

    def bind(self, model, model_callback: Callable) -> Callable:
        """返回带会话的回调。model 为目标模型对象（BaseLLM 子类），
        model_callback 为 runner 组装好的 traced 回调——trace 发射保持
        在外层，SessionScope 只补 trace 的 turn 上下文与会话路由。"""

        # 会话路由直接打到 model 对象；若 model 不可用（理论上不发生）
        # 则退化为原回调，行为与现状一致。
        use_session = model is not None and self._supports_session_call(model)
        if not use_session:
            return model_callback

        if inspect.iscoroutinefunction(model_callback) or self._is_async(model_callback):
            return self._bind_async(model, model_callback)
        return self._bind_sync(model, model_callback)

    # ------------------------------------------------------------------
    def _is_async(self, fn) -> bool:
        # traced_async_model_callback 返回的是普通函数包装的协程函数
        return inspect.iscoroutinefunction(fn)

    def _supports_session_call(self, model) -> bool:
        for name in ("a_generate", "generate"):
            fn = getattr(model, name, None)
            if fn is None:
                continue
            try:
                sig = inspect.signature(fn)
            except (TypeError, ValueError):
                continue
            for p in sig.parameters.values():
                if p.kind == inspect.Parameter.VAR_KEYWORD:
                    return True
        return False

    # ------------------------------------------------------------------
    def _record(self, attack: str, response: str):
        self.transcript.append(
            {"turn": len(self.transcript) + 1, "attack": attack, "response": response}
        )

    def _trace_turn(self, turn: int):
        try:
            set_trace_context(
                phase="attack",
                attack_method=self.attack_method,
                vulnerability=self.vulnerability,
                turn=turn,
                step_id="2",
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    def _bind_sync(self, model, model_callback: Callable) -> Callable:
        def wrapped(prompt: str) -> str:
            turn = len(self.transcript) + 1
            self._trace_turn(turn)
            resp = model.generate(prompt, session_id=self.session_id)
            self._record(prompt, resp)
            return resp

        return wrapped

    def _bind_async(self, model, model_callback: Callable) -> Callable:
        async def wrapped(prompt: str) -> str:
            turn = len(self.transcript) + 1
            self._trace_turn(turn)
            resp = await model.a_generate(prompt, session_id=self.session_id)
            self._record(prompt, resp)
            return resp

        return wrapped
