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

# 评估/翻译进行中标记：simulator_model 与 evaluate_model 常是同一 Python 对象
# （用户未配独立 simulator 时 cli_run.py 直接别名），simulator wrapper 会对
# metric 内部的评估调用、报告阶段的 reason 翻译调用误拦截打标——这些调用各由
# 自己的 wrapper/上下文负责（judge wrapper 打 judge 标，翻译不属攻击生成不打
# 标），置位期间 simulator wrapper 透传不 emit。
suppress_simulator_trace: ContextVar[bool] = ContextVar("suppress_simulator_trace", default=False)

# 传输层附加信息（AgentTargetModel._call_agent 写入，traced wrapper 读出并
# 并入 trace meta）：{"session_id": str, "wire_capture": str}——wire_capture 为
# wire 抓包文件名（完整 HTTP 原始报文经抓包 API 按需读取，避免 trace 膨胀）。
#
# 注意：不用 ContextVar——asyncio.to_thread 的工作线程不继承调用方 context,
# _call_agent 在 to_thread 线程里写入、wrapper 在事件循环线程读取，ContextVar
# 会静默失联。改用模块级单槽（最近一次写入），每次调用前清空、调用后读走，
# 并发错位的影响仅限 meta 标注（并发窗口极小），不影响调用本身。
wire_slot: dict = {}
wire_slot_lock = None  # 惰性创建，避免 import 期建锁


def _wire_lock():
    global wire_slot_lock
    if wire_slot_lock is None:
        import threading
        wire_slot_lock = threading.Lock()
    return wire_slot_lock


def set_wire_context(**kwargs) -> None:
    """Publish transport-level wire info for the next trace emission."""
    with _wire_lock():
        wire_slot.clear()
        wire_slot.update(kwargs)


def pop_wire_context() -> dict:
    """Read-and-clear the wire context (one-shot, per call)."""
    with _wire_lock():
        ctx = dict(wire_slot)
        wire_slot.clear()
    return ctx


def set_trace_context(**kwargs) -> None:
    """Publish the current attack context for the next target calls."""
    trace_context.set(kwargs)


def emit_target_trace(direction: str, endpoint: str, payload: str, meta: dict, trace_id: str = None) -> None:
    """Emit a single target-communication trace event (low-level helper)."""
    _emit(direction, trace_id or uuid.uuid4().hex, endpoint, payload, meta)


def _emit(direction: str, trace_id: str, endpoint: str, payload: str, meta: dict,
          phase_override: str = None, tool_override: str = None) -> None:
    ctx = trace_context.get() or {}
    try:
        logger.message_trace(messageTrace(
            trace_id=trace_id,
            direction=direction,
            tool=tool_override or "target_dialogue",
            stepId=str(ctx.get("step_id", "2")),
            endpoint=endpoint,
            payload=payload or "",
            phase=phase_override if phase_override is not None else str(ctx.get("phase", "")),
            attack_method=str(ctx.get("attack_method", "")),
            vulnerability=str(ctx.get("vulnerability", "")),
            turn=int(ctx.get("turn", 0) or 0),
            meta=json.dumps(meta, ensure_ascii=False) if meta else "",
        ))
    except Exception:  # never break the red-team loop for trace logging
        pass


def traced_model_callback(model_callback, endpoint: str):
    """Wrap a sync ``model_callback(prompt, **kwargs) -> str`` with trace emission.

    kwargs（如 session_id）透传给底层回调并并入 request meta。
    wire_context 里由传输层写入的 request_wire/response_wire（完整 HTTP
    原始报文）并入对应方向的 meta，供前端展示抓包原文。
    """

    def wrapped(prompt: str, **kwargs) -> str:
        trace_id = uuid.uuid4().hex
        req_meta = {k: v for k, v in kwargs.items() if v}
        _emit("request", trace_id, endpoint, prompt, req_meta)
        start = time.time()
        try:
            output = model_callback(prompt, **kwargs)
        except Exception as e:  # noqa: BLE001
            _emit("error", trace_id, endpoint, str(e), {"elapsed_ms": int((time.time() - start) * 1000)})
            raise
        wire = pop_wire_context()
        meta = {"elapsed_ms": int((time.time() - start) * 1000)}
        if not output:
            meta["empty_output"] = True
        if wire.get("session_id"):
            meta["session_id"] = wire["session_id"]
        if wire.get("wire_capture"):
            meta["wire_capture"] = wire["wire_capture"]
        _emit("response" if output else "error", trace_id, endpoint, output or "", meta)
        return output

    return wrapped


def traced_async_model_callback(model_callback, endpoint: str):
    """Wrap an async ``model_callback(prompt, **kwargs) -> str`` with trace emission."""

    async def wrapped(prompt: str, **kwargs) -> str:
        trace_id = uuid.uuid4().hex
        req_meta = {k: v for k, v in kwargs.items() if v}
        _emit("request", trace_id, endpoint, prompt, req_meta)
        start = time.time()
        try:
            output = await model_callback(prompt, **kwargs)
        except Exception as e:  # noqa: BLE001
            _emit("error", trace_id, endpoint, str(e), {"elapsed_ms": int((time.time() - start) * 1000)})
            raise
        wire = pop_wire_context()
        meta = {"elapsed_ms": int((time.time() - start) * 1000)}
        if not output:
            meta["empty_output"] = True
        if wire.get("session_id"):
            meta["session_id"] = wire["session_id"]
        if wire.get("wire_capture"):
            meta["wire_capture"] = wire["wire_capture"]
        _emit("response" if output else "error", trace_id, endpoint, output or "", meta)
        return output

    return wrapped


def traced_metric_a_measure(metric, endpoint: str = None):
    """Wrap a metric's ``a_measure`` so the judge LLM call is emitted as a
    pair of messageTrace events (request = case input, response = score/reason).

    此前评估模型的判定调用完全无留痕，平台无法审计每个 case 的评分依据。
    包装在调用点（red_teamer / campaign runner），metric 子类零改动。
    phase 固定 "judge"；attack_method/vulnerability 继承调用方 trace 上下文。
    """
    resolved_endpoint = endpoint
    if not resolved_endpoint:
        try:
            resolved_endpoint = metric.model.get_model_name() if metric.model is not None else "evaluator"
        except Exception:
            resolved_endpoint = "evaluator"

    original = metric.a_measure

    async def wrapped(test_case, *args, **kwargs):
        trace_id = uuid.uuid4().hex
        req_meta = {"role": "judge", "target_output": (getattr(test_case, "actual_output", "") or "")[:2000]}
        # phase 用 override 传入——不能 set_trace_context(phase=...) 整体覆盖 ctx，
        # 否则调用方设置的 attack_method/vulnerability/turn 全被清掉。
        # in_judge 标记：抑制 simulator wrapper 对同一对象（model 别名）的误拦截
        suppress_token = suppress_simulator_trace.set(True)
        _emit("request", trace_id, resolved_endpoint, getattr(test_case, "input", "") or "", req_meta,
              phase_override="judge")
        start = time.time()
        try:
            score = await original(test_case, *args, **kwargs)
        except Exception as e:  # noqa: BLE001
            suppress_simulator_trace.reset(suppress_token)
            _emit("error", trace_id, resolved_endpoint, str(e), {"elapsed_ms": int((time.time() - start) * 1000)},
                  phase_override="judge")
            raise
        resp_payload = f"score={metric.score}\nreason={metric.reason or ''}"
        suppress_simulator_trace.reset(suppress_token)
        _emit("response", trace_id, resolved_endpoint, resp_payload,
              {"elapsed_ms": int((time.time() - start) * 1000), "score": metric.score},
              phase_override="judge")
        return score

    metric.a_measure = wrapped
    return metric


def _schema_result_payload(res) -> str:
    """Schema 调用结果是 pydantic 模型（如 SyntheticDataList）——序列化后作为
    response payload；普通字符串原样返回。"""
    if isinstance(res, str):
        return res
    try:
        return res.model_dump_json()
    except Exception:
        try:
            return json.dumps(res, default=str, ensure_ascii=False)
        except Exception:
            return str(res)


def traced_simulator_model(model):
    """实例级 patch simulator 模型的 a_generate/generate：每次攻击生成 LLM 调用
    发一对 messageTrace（phase='simulator'，tool='simulator_dialogue'）。

    为何在实例级而非调用点：AttackSimulator 与所有 enhance 内部的攻击实现共享
    同一实例（多轮攻击持有注入的 simulator_model 引用），一处 patch 全覆盖——
    体检 baseline 生成、enhance 调度、campaign 的 a_generate_schema/裸回退。
    TypeError 不发 error trace：本代码库把 a_generate(prompt, schema=...) 的
    TypeError 当控制流信号（调用方捕获后回退裸调用），发 trace 会制造噪音。
    """
    try:
        endpoint = model.get_model_name() if hasattr(model, "get_model_name") else "simulator"
    except Exception:
        endpoint = "simulator"
    orig_async = model.a_generate
    orig_sync = getattr(model, "generate", None)

    def _meta(start, extra=None):
        m = {"elapsed_ms": int((time.time() - start) * 1000), "role": "simulator"}
        if extra:
            m.update(extra)
        return m

    async def a_generate(*args, **kwargs):
        if suppress_simulator_trace.get():
            return await orig_async(*args, **kwargs)  # judge 判定内部调用：已由 judge wrapper 打标
        prompt = args[0] if args else (kwargs.get("prompt") or "")
        trace_id = uuid.uuid4().hex
        _emit("request", trace_id, endpoint, prompt if isinstance(prompt, str) else str(prompt),
              {"role": "simulator"}, phase_override="simulator", tool_override="simulator_dialogue")
        start = time.time()
        try:
            res = await orig_async(*args, **kwargs)
        except TypeError:
            raise  # schema kwarg 控制流：调用方捕获后回退，静默
        except Exception as e:  # noqa: BLE001
            _emit("error", trace_id, endpoint, str(e), _meta(start),
                  phase_override="simulator", tool_override="simulator_dialogue")
            raise
        payload = _schema_result_payload(res)
        _emit("response" if payload else "error", trace_id, endpoint, payload or "",
              _meta(start), phase_override="simulator", tool_override="simulator_dialogue")
        return res

    model.a_generate = a_generate

    if orig_sync is not None:
        def generate(*args, **kwargs):
            if suppress_simulator_trace.get():
                return orig_sync(*args, **kwargs)  # judge 判定内部调用
            prompt = args[0] if args else (kwargs.get("prompt") or "")
            trace_id = uuid.uuid4().hex
            _emit("request", trace_id, endpoint, prompt if isinstance(prompt, str) else str(prompt),
                  {"role": "simulator"}, phase_override="simulator", tool_override="simulator_dialogue")
            start = time.time()
            try:
                res = orig_sync(*args, **kwargs)
            except TypeError:
                raise
            except Exception as e:  # noqa: BLE001
                _emit("error", trace_id, endpoint, str(e), _meta(start),
                      phase_override="simulator", tool_override="simulator_dialogue")
                raise
            payload = _schema_result_payload(res)
            _emit("response" if payload else "error", trace_id, endpoint, payload or "",
                  _meta(start), phase_override="simulator", tool_override="simulator_dialogue")
            return res

        model.generate = generate

    return model
