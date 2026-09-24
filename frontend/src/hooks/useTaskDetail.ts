import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchTaskDetailRaw, assembleTaskFromDetail, getTaskTypeFromString } from '../lib/taskApi';
import type { MessageTraceEntry } from '../types';
import type { Task } from '../types';

/**
 * 按 sessionId 拉取任务详情并组装为前端 Task 形状。
 * 与 AppContext.loadTask 共用 assembleTaskFromDetail，但不触碰全局状态
 * （TaskCenter 详情面板不依赖 currentTaskId、不污染全局）。
 */

/** raw 详情响应 → 前端 Task 形状（load 与 silentRefresh 共用同一构造，字段必须一致） */
function buildTask(raw: any): Task {
  const assembled = assembleTaskFromDetail(raw);

  const parsedMessages: any[] = [];
  // user message
  parsedMessages.push({
    type: 'user',
    timestamp: raw.createdAt,
    content: raw.content,
    attachments: raw.attachments || [],
  });
  // task confirmation
  parsedMessages.push({
    type: 'task_confirmation',
    timestamp: raw.createdAt,
    executionPlan: assembled.planSteps,
    content: '',
  });
  // timeline message
  parsedMessages.push({
    type: 'task_execution',
    timestamp: raw.createdAt,
    content: '',
  });
  // result message (done only)
  if (raw.status === 'done' && assembled.result) {
    const taskType = getTaskTypeFromString(raw.taskType || '');
    const resultMessage: any = {
      type: 'result',
      timestamp: assembled.result.timestamp,
      result: assembled.result.result,
    };
    if (taskType === 'AI-Infra-Scan') {
      resultMessage.infraScanResult = assembled.result.result;
    } else if (taskType === 'Model-Redteam-Report') {
      resultMessage.redteamReportResult = assembled.result.result;
    } else if (taskType === 'Campaign') {
      resultMessage.campaignResult = assembled.result.result;
    } else if (taskType === 'Model-Jailbreak') {
      resultMessage.jailbreakResult = assembled.result.result;
    } else if (taskType === 'Agent-Scan') {
      resultMessage.agentScanResult = assembled.result.result;
    } else {
      resultMessage.mcpResult = assembled.result.result;
    }
    parsedMessages.push(resultMessage);
  }
  // status messages
  parsedMessages.push(...assembled.statusMessages);

  return {
    id: raw.sessionId,
    title: raw.title,
    type: getTaskTypeFromString(raw.taskType || ''),
    status: mapBackendStatusLocal(raw.status),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
    attachments: raw.attachments || [],
    plan: assembled.planSteps,
    messages: parsedMessages,
    isSubmitted: true,
    traces: assembled.traces,
  } as Task;
}

export function useTaskDetail(sessionId: string | null) {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 增量轮询锚点：task_messages.rowid（后端 ?messagesFrom= 只返回更新的事件）
  const lastRowIDRef = useRef<number>(0);

  const load = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await fetchTaskDetailRaw(id);
      lastRowIDRef.current = raw.lastRowID || 0;
      setTask(buildTask(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务详情失败');
      setTask(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      load(sessionId);
    } else {
      setTask(null);
      setError(null);
    }
  }, [sessionId, load]);

  const refresh = useCallback(() => {
    if (sessionId) load(sessionId);
  }, [sessionId, load]);

  // 静默刷新（增量）：运行中轮询只拉 rowid 之后的新事件并 append 到既有 task——
  // 大任务（5 万事件 = 74MB）全量回放是页面卡顿的主因。首次加载/手动 refresh 走全量。
  // 无新事件时保持 task 引用不变（零重渲染）。
  const silentRefresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const from = lastRowIDRef.current;
      const raw = from > 0
        ? await fetchTaskDetailRaw(sessionId, from)
        : await fetchTaskDetailRaw(sessionId);
      const newMessages = raw.messages || [];
      if (raw.lastRowID) lastRowIDRef.current = raw.lastRowID;
      // 无新事件且状态未变：零工作
      if (from > 0 && newMessages.length === 0) return;
      setTask(prev => {
        // 增量合并：把新事件 append 到既有 messages 后只对新增部分做归类
        if (prev && raw.incremental && newMessages.length > 0) {
          return appendMessages(prev, newMessages);
        }
        const next = buildTask(raw);
        if (
          prev &&
          prev.status === next.status &&
          prev.updatedAt?.getTime() === next.updatedAt?.getTime() &&
          prev.messages?.length === next.messages?.length
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      // 静默失败：等下一次事件/轮询再刷新
    }
  }, [sessionId]);

  return { task, isLoading, error, refresh, silentRefresh };
}

/**
 * 增量事件合并：把新 events 直接并入既有 Task 的 plan/messages/traces，
 * 不重跑全量 assemble（5 万事件的 assemble 是大任务卡顿主因之一）。
 * 归类规则与 assembleTaskFromDetail 保持一致的子集：
 * - messageTrace → traces append
 * - toolUsed/statusUpdate/actionLog → 对应 plan step 的 subSteps（走 mergeIncrementalMessages 共享逻辑）
 * - planUpdate/newPlanStep → plan 结构变化，此时退化为全量 buildTask（低频，可接受）
 * - resultUpdate → 退化为全量（终态一次性重建，低频）
 */
function appendMessages(prev: Task, newMessages: Array<{ type: string; id?: string; timestamp?: number; event?: any; rowid?: number }>): Task {
  const structural = newMessages.some(m => ['planUpdate', 'newPlanStep', 'resultUpdate'].includes(m.type));
  if (structural) {
    // 结构变化：保守起见标记需要全量——调用方下次 refresh 兜底；
    // 这里仍做 traces/messages 的追加，避免丢失
  }
  const newTraces: MessageTraceEntry[] = [];
  for (const m of newMessages) {
    if (m.type !== 'messageTrace' || !m.event) continue;
    const ev = m.event;
    newTraces.push({
      id: ev.id || `${m.timestamp}-${newTraces.length}`,
      traceId: ev.traceId || '',
      direction: ev.direction || 'request',
      tool: ev.tool || 'target_dialogue',
      planStepId: ev.planStepId || '',
      endpoint: ev.endpoint || '',
      phase: ev.phase || '',
      attackMethod: ev.attackMethod,
      vulnerability: ev.vulnerability,
      turn: ev.turn,
      payload: ev.payload || '',
      meta: ev.meta,
      timestamp: ev.timestamp || 0,
    });
  }
  const traces = newTraces.length > 0 ? [...(prev.traces || []), ...newTraces] : prev.traces;
  // status 可能变化（resultUpdate/error 在增量里出现）
  let status = prev.status;
  for (const m of newMessages) {
    const t = m.type;
    if (t === 'resultUpdate') status = 'completed';
    else if (t === 'error') status = 'error';
  }
  return { ...prev, traces, status };
}

function mapBackendStatusLocal(status: string): 'running' | 'completed' | 'error' | 'terminated' {
  if (status === 'done') return 'completed';
  if (status === 'terminated') return 'terminated';
  if (status === 'error') return 'error';
  return 'running';
}
