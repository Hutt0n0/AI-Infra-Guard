import { useState, useEffect, useCallback } from 'react';
import { fetchTaskDetailRaw, assembleTaskFromDetail, getTaskTypeFromString } from '../lib/taskApi';
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

  const load = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await fetchTaskDetailRaw(id);
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

  // 静默刷新：不打 loading 态——任务运行中 SSE 高频事件触发时页面不闪烁。
  // 与当前内容一致（状态/更新时间/计划步数）时跳过 setTask，保持引用避免无效重渲染。
  const silentRefresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const raw = await fetchTaskDetailRaw(sessionId);
      const next = buildTask(raw);
      setTask(prev => {
        if (
          prev &&
          prev.status === next.status &&
          prev.updatedAt?.getTime() === next.updatedAt?.getTime() &&
          prev.plan?.length === next.plan?.length
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

function mapBackendStatusLocal(status: string): 'running' | 'completed' | 'error' | 'terminated' {
  if (status === 'done') return 'completed';
  if (status === 'terminated') return 'terminated';
  if (status === 'error') return 'error';
  return 'running';
}
