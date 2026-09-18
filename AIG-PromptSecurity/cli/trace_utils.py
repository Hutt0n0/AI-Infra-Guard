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

"""Target-communication trace: record every message exchanged with the
red-team target (LLM API or AI agent) and stream it to the AIG console.

The red-team engine exchanges flat attack prompts through a ``model_callback``.
All traffic to the target flows through that single callable — including
multi-turn attacks that call it in a loop — so wrapping the callback captures
every request/response pair without touching each attack implementation.

Attack context (method / vulnerability / turn) varies per call site. It is
published through the :data:`trace_context` ContextVar by the call sites that
know it (red_teamer per-attack loop, attack_simulator baseline/enhance stages),
and falls back to ``{}`` when unknown (e.g. an attack object calling the
callback internally).
"""

import json
import time
import uuid
from contextvars import ContextVar

from cli.aig_logger import logger, messageTrace

# Per-call attack context: {"attack_method": str, "vulnerability": str, "turn": int, "phase": str}
trace_context: ContextVar[dict] = ContextVar("trace_context", default={})


def set_trace_context(**kwargs) -> None:
    """Publish the current attack context for the next target calls."""
    trace_context.set(kwargs)


def emit_target_trace(direction: str, endpoint: str, payload: str, meta: dict, trace_id: str = None) -> None:
    """Emit a single target-communication trace event (low-level helper)."""
    _emit(direction, trace_id or uuid.uuid4().hex, endpoint, payload, meta)


def _emit(direction: str, trace_id: str, endpoint: str, payload: str, meta: dict) -> None:
    ctx = trace_context.get() or {}
    try:
        logger.message_trace(messageTrace(
            trace_id=trace_id,
            direction=direction,
            tool="target_dialogue",
            stepId=str(ctx.get("step_id", "2")),
            endpoint=endpoint,
            payload=payload or "",
            phase=str(ctx.get("phase", "")),
            attack_method=str(ctx.get("attack_method", "")),
            vulnerability=str(ctx.get("vulnerability", "")),
            turn=int(ctx.get("turn", 0) or 0),
            meta=json.dumps(meta, ensure_ascii=False) if meta else "",
        ))
    except Exception:  # never break the red-team loop for trace logging
        pass


def traced_model_callback(model_callback, endpoint: str):
    """Wrap a sync ``model_callback(prompt) -> str`` with trace emission."""

    def wrapped(prompt: str) -> str:
        trace_id = uuid.uuid4().hex
        _emit("request", trace_id, endpoint, prompt, {})
        start = time.time()
        try:
            output = model_callback(prompt)
        except Exception as e:  # noqa: BLE001
            _emit("error", trace_id, endpoint, str(e), {"elapsed_ms": int((time.time() - start) * 1000)})
            raise
        meta = {"elapsed_ms": int((time.time() - start) * 1000)}
        if not output:
            meta["empty_output"] = True
        _emit("response" if output else "error", trace_id, endpoint, output or "", meta)
        return output

    return wrapped


def traced_async_model_callback(model_callback, endpoint: str):
    """Wrap an async ``model_callback(prompt) -> str`` with trace emission."""

    async def wrapped(prompt: str) -> str:
        trace_id = uuid.uuid4().hex
        _emit("request", trace_id, endpoint, prompt, {})
        start = time.time()
        try:
            output = await model_callback(prompt)
        except Exception as e:  # noqa: BLE001
            _emit("error", trace_id, endpoint, str(e), {"elapsed_ms": int((time.time() - start) * 1000)})
            raise
        meta = {"elapsed_ms": int((time.time() - start) * 1000)}
        if not output:
            meta["empty_output"] = True
        _emit("response" if output else "error", trace_id, endpoint, output or "", meta)
        return output

    return wrapped
