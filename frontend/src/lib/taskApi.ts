/**
 * 任务域 API 封装 — 从 ChatArea / AppContext / ReportPage 抽取的 HTTP 调用层
 * 事件→dispatch 的翻译逻辑（processQueueItem）不在此层，仍留在 ChatArea。
 */
import { ExecutionStep, Message, TaskType } from '../types';

const API_BASE = '/api/v1/app/tasks';

// ============ 类型 ============

/** 后端 buildTaskSummary 返回的任务列表项（阶段 9 起 enrichTaskSummary 填充扩展字段） */
export interface TaskSummary {
  sessionId: string;
  title: string;
  rawTitle?: string;
  taskType: string;
  status: string; // todo | doing | done | error | terminated
  countryIsoCode?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  source?: string;
  sourceLabel?: string;
  // 阶段 9 扩展（取不到为 null）
  assignedAgent?: string | null;
  riskCount?: number | null;
  score?: number | null;
  progress?: number | null;
}

export interface TaskDetailRaw {
  sessionId: string;
  title: string;
  taskType: string;
  status: string;
  content?: string;
  params?: unknown;
  attachments?: unknown[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  messages: Array<{ type: string; id?: string; timestamp?: number; event?: any }>;
}

/** SSE 事件类型（ChatArea 监听的全集） */
export type SseEventType =
  | 'connected'
  | 'planUpdate'
  | 'newPlanStep'
  | 'statusUpdate'
  | 'toolUsed'
  | 'resultUpdate'
  | 'actionLog'
  | 'messageTrace'
  | 'error'
  | 'task_progress';

// ============ 状态映射（与 AppContext 内部约定一致） ============

export function mapStatusToStepStatus(status: string): 'todo' | 'doing' | 'done' {
  if (status === 'todo') return 'todo';
  if (status === 'doing' || status === 'running' || status === 'pending') return 'doing';
  if (status === 'done' || status === 'completed' || status === 'failed') return 'done';
  return 'todo';
}

/** API taskType → 前端内部 TaskType（ReportPage 同名函数的共享化，注意 Skill-Scan 先于 Mcp-Scan 判断） */
export function getTaskTypeFromString(taskType: string): TaskType {
  if (taskType.includes('Skill-Scan') || taskType.includes('skill')) {
    return 'Skill-Scan' as TaskType;
  } else if (taskType.includes('Mcp-Scan') || taskType.includes('mcp')) {
    return 'Mcp-Scan' as TaskType;
  } else if (taskType.includes('AI-Infra-Scan') || taskType.includes('infra')) {
    return 'AI-Infra-Scan' as TaskType;
  } else if (taskType.includes('Model-Redteam-Report') || taskType.includes('redteam')) {
    return 'Model-Redteam-Report' as TaskType;
  } else if (taskType.includes('Model-Jailbreak') || taskType.includes('jailbreak')) {
    return 'Model-Jailbreak' as TaskType;
  } else if (taskType.includes('Agent-Scan') || taskType.includes('agent')) {
    return 'Agent-Scan' as TaskType;
  }
  return 'Mcp-Scan' as TaskType;
}

/** 后端 status → 前端 TaskStatus（AppContext loadTasks 同款映射） */
export function mapBackendStatus(status: string): 'running' | 'completed' | 'error' | 'terminated' {
  if (status === 'done') return 'completed';
  if (status === 'terminated') return 'terminated';
  if (status === 'error') return 'error';
  return 'running';
}

// ============ HTTP 调用 ============

export async function fetchTaskSummaries(params?: { q?: string; taskType?: string }): Promise<TaskSummary[]> {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.taskType) search.set('taskType', params.taskType);
  const qs = search.toString();
  const response = await fetch(`${API_BASE}${qs ? `?${qs}` : ''}`);
  const responseData = await response.json();
  if (responseData.status !== 0) {
    throw new Error(responseData.message || '获取任务列表失败');
  }
  // 后端 0 命中时返回 data.tasks = null（Go nil slice 序列化），归一为空数组
  return (responseData.data.tasks ?? []) as TaskSummary[];
}

export async function fetchTaskDetailRaw(sessionId: string): Promise<TaskDetailRaw> {
  const response = await fetch(`${API_BASE}/${sessionId}`);
  const responseData = await response.json();
  if (responseData.status !== 0) {
    throw new Error(responseData.message || '获取任务详情失败');
  }
  return responseData.data as TaskDetailRaw;
}

/**
 * 从任务详情 raw 数据组装前端 Task 形状（不含 messages 注入逻辑）。
 * AppContext.loadTask 与 ReportPage 共用 plan/subSteps/result/traces 组装。
 */
export function assembleTaskFromDetail(taskData: TaskDetailRaw) {
  let planSteps: ExecutionStep[] = [];
  const stepIdMap: Record<string, any> = {};
  const stepTitleMap: Record<string, string> = {};
  let result: any = null;
  const parsedMessages: any[] = [];
  const statusMessages: Message[] = [];
  let planUpdate: any = null;

  // 1. 找 planUpdate 与 stepId 标题映射
  for (const msg of (taskData.messages ?? [])) {
    if (msg.type === 'planUpdate' && msg.event?.tasks) {
      planUpdate = msg;
    }
    if (msg.type === 'newPlanStep') {
      stepTitleMap[msg.event.title] = msg.event.stepId;
    }
  }

  // 2. 组装主步骤（优先 planUpdate 携带的 stepId，回退标题查找，最后索引）
  if (planUpdate) {
    planSteps = planUpdate.event.tasks.map((task: any, idx: number) => {
      const step = {
        id: task.stepId || stepTitleMap[task.title] || `step-${idx}`,
        title: task.title,
        status: mapStatusToStepStatus(task.status),
        progress: task.progress || 0,
        startTime: task.startedAt ? new Date(task.startedAt) : undefined,
        endTime: task.completedAt ? new Date(task.completedAt) : undefined,
        details: task.details || '',
        subSteps: [] as any[],
      };
      stepIdMap[step.id] = step;
      return step;
    });
  }

  // 3. 遍历消息，归类到主步骤的 subSteps
  for (const msg of (taskData.messages ?? [])) {
    // toolUsed
    if (msg.type === 'toolUsed' && msg.event?.planStepId && Array.isArray(msg.event.tools)) {
      const step = stepIdMap[msg.event.planStepId];
      if (step) {
        step.subSteps.forEach((subStep: any) => {
          if (subStep.id === msg.event.statusId) {
            // 保留已有 toolUsed 以衔接 actionLog
            const existingToolUsed: any[] = subStep.toolUsed || [];
            const existingToolMap: Record<string, any> = {};
            existingToolUsed.forEach((tool: any) => {
              existingToolMap[tool.toolId] = tool;
            });

            subStep.toolUsed = msg.event.tools.map((tool: any) => {
              const toolId = tool.toolId || tool.brief || Math.random().toString();
              const existingTool = existingToolMap[toolId];

              return {
                id: toolId,
                brief: tool.brief,
                status: mapStatusToStepStatus(tool.status),
                message: tool.message,
                result: tool.result,
                timestamp: msg.event.timestamp ? new Date(msg.event.timestamp * 1000) : undefined,
                tool: tool.tool,
                toolId: tool.toolId,
                actionLog: existingTool ? existingTool.actionLog || '' : '',
              };
            });
          }
        });
      }
    }
    // statusUpdate（带 planStepId → subStep；不带 → 全局 statusMessages）
    if (msg.type === 'statusUpdate') {
      if (msg.event?.planStepId) {
        const step = stepIdMap[msg.event.planStepId];
        if (step) {
          const subStepId = msg.event.id || Math.random().toString();
          const existingSubStepIndex = step.subSteps.findIndex(
            (subStep: any) => subStep.id === subStepId
          );
          const stepStatus = msg.event.agentStaus || msg.event.agentStatus;
          const rawTimestamp = msg.event.timestamp;

          const newSubStep = {
            id: subStepId,
            brief: msg.event.brief,
            description: msg.event.description || '',
            status: mapStatusToStepStatus(stepStatus),
            message: {},
            timestamp: rawTimestamp
              ? new Date(rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000)
              : undefined,
            toolUsed: [] as any[],
          };

          if (existingSubStepIndex !== -1) {
            const existingToolUsed = step.subSteps[existingSubStepIndex].toolUsed;
            step.subSteps[existingSubStepIndex] = {
              ...newSubStep,
              toolUsed: existingToolUsed
                ? existingToolUsed.map((tool: any) => ({
                    ...tool,
                    actionLog: tool.actionLog || '',
                  }))
                : [],
            };
          } else {
            step.subSteps.push(newSubStep);
          }
        }
      } else if (msg.event?.brief || msg.event?.description) {
        const rawTimestamp = msg.event.timestamp;
        statusMessages.push({
          id: msg.event.id || Math.random().toString(),
          type: 'system',
          brief: msg.event.brief,
          content: msg.event.description || msg.event.brief || '',
          timestamp: rawTimestamp
            ? new Date(rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000)
            : (msg.timestamp ? new Date(msg.timestamp) : new Date()),
        } as Message);
      }
    }
    // actionLog（toolId 归属 actionId；ReportPage 用 toolId 归属 statusId+toolId，两处约定不同）
    if (msg.type === 'actionLog' && msg.event?.planStepId) {
      const step = stepIdMap[msg.event.planStepId];
      if (step) {
        step.subSteps.forEach((subStep: any) => {
          if (subStep.toolUsed && Array.isArray(subStep.toolUsed)) {
            subStep.toolUsed.forEach((tool: any) => {
              // 兼容两种归属键：actionId（AppContext 约定）与 statusId（ReportPage 约定）
              const match = msg.event.actionId
                ? tool.toolId === msg.event.actionId
                : msg.event.toolId && subStep.id === msg.event.statusId
                  ? tool.toolId === msg.event.toolId
                  : false;
              if (match) {
                tool.actionLog = (tool.actionLog || '') + (msg.event.actionLog || '');
              }
            });
          }
        });
      }
    }
    // resultUpdate
    if (msg.type === 'resultUpdate' && msg.event?.result) {
      result = {
        result: msg.event.result,
        timestamp: msg.event.timestamp ? new Date(msg.event.timestamp * 1000) : undefined,
      };
    }
  }

  // 4. 回放 target-communication traces
  const traces = taskData.messages
    .filter(msg => msg.type === 'messageTrace' && msg.event)
    .map(msg => ({
      id: msg.event.id || msg.id || Math.random().toString(),
      traceId: msg.event.traceId || '',
      direction: msg.event.direction || 'request',
      tool: msg.event.tool || 'target_dialogue',
      planStepId: msg.event.planStepId || '',
      endpoint: msg.event.endpoint || '',
      phase: msg.event.phase || '',
      attackMethod: msg.event.attackMethod,
      vulnerability: msg.event.vulnerability,
      turn: msg.event.turn,
      payload: msg.event.payload || '',
      meta: msg.event.meta,
      timestamp: msg.event.timestamp || msg.timestamp || 0,
    }));

  // 5. 终态任务的 doing 步骤收尾（历史回放不留转圈）
  let closedPlanSteps = planSteps;
  if (['done', 'terminated', 'error'].includes(taskData.status)) {
    closedPlanSteps = planSteps.map(step =>
      step.status === 'doing'
        ? {
            ...step,
            status: 'done' as const,
            endTime: step.endTime || new Date(taskData.updatedAt || Date.now()),
            details: step.details || (taskData.status === 'terminated' ? '任务已终止' : ''),
            subSteps: step.subSteps?.map((sub: any) =>
              sub.status === 'doing' ? { ...sub, status: 'done' as const } : sub
            ),
          }
        : step
    );
  }

  return {
    planSteps: closedPlanSteps,
    result,
    statusMessages,
    traces,
    parsedMessages,
  };
}

export async function createTaskRequest(body: Record<string, unknown>): Promise<{ status: number; message?: string; data?: { title?: string; sessionId?: string } }> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function renameTaskRequest(sessionId: string, title: string): Promise<{ status: number; message?: string }> {
  const response = await fetch(`${API_BASE}/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return response.json();
}

export async function deleteTaskRequest(sessionId: string): Promise<{ status: number; message?: string }> {
  const response = await fetch(`${API_BASE}/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

export async function terminateTaskRequest(sessionId: string): Promise<{ status: number; message?: string }> {
  const response = await fetch(`${API_BASE}/${sessionId}/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
}

// ============ 文件上传（三段式） ============

export interface UploadedAttachment {
  filename: string;
  fileUrl: string;
}

async function uploadFileChunked(file: File): Promise<UploadedAttachment> {
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const filename = file.name;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('filename', filename);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('chunk', chunk);

    const response = await fetch(`${API_BASE}/uploadChunk`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} upload failed`);
    }

    const result = await response.json();
    if (result.status !== 0) {
      throw new Error(result.message || `Chunk ${chunkIndex + 1}/${totalChunks} upload failed`);
    }
  }

  const mergeResponse = await fetch(`${API_BASE}/mergeChunks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId,
      filename,
      totalChunks,
      fileSize: file.size,
    }),
  });

  if (!mergeResponse.ok) {
    throw new Error('Merge chunks failed');
  }

  const mergeResult = await mergeResponse.json();
  if (mergeResult.status !== 0) {
    throw new Error(mergeResult.message || 'Merge chunks failed');
  }

  return mergeResult.data as UploadedAttachment;
}

/** 上传附件列表：>1MB 走分片，否则单文件直传 */
export async function uploadTaskAttachments(files: File[]): Promise<{
  attachmentUrls: string[];
  attachmentsWithNames: UploadedAttachment[];
}> {
  const attachmentUrls: string[] = [];
  const attachmentsWithNames: UploadedAttachment[] = [];

  for (const file of files) {
    let result: UploadedAttachment;
    if (file.size > 1 * 1024 * 1024) {
      result = await uploadFileChunked(file);
    } else {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${API_BASE}/uploadFile`, {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        if (uploadResult.status === 0) {
          result = uploadResult.data;
        } else {
          throw new Error(uploadResult.message || '上传失败');
        }
      } else {
        throw new Error('上传失败');
      }
    }

    if (result) {
      attachmentUrls.push(result.fileUrl);
      attachmentsWithNames.push(result);
    }
  }
  return { attachmentUrls, attachmentsWithNames };
}

// ============ SSE ============

/**
 * 建立任务 SSE 连接并注册事件监听。返回关闭函数。
 * 事件 → dispatch 的翻译由调用方在 onEvent 中完成（ChatArea 的 messageQueue 逻辑保留在原地）。
 */
export function openTaskSSE(
  sessionId: string,
  handlers: {
    onEvent?: (type: SseEventType, data: any) => void;
    onError?: () => void;
  }
): () => void {
  const eventSource = new EventSource(`${API_BASE}/sse/${sessionId}`);

  const listen = (type: SseEventType, validate?: (data: any) => boolean) => {
    eventSource.addEventListener(type, event => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.type === type && (!validate || validate(data))) {
          handlers.onEvent?.(type, data);
        }
      } catch {
        // JSON 解析失败静默忽略（与原实现一致）
      }
    });
  };

  listen('connected');
  listen('planUpdate', data => Boolean(data.event?.tasks));
  listen('newPlanStep', data => Boolean(data.event));
  listen('statusUpdate', data => Boolean(data.event));
  listen('toolUsed', data => Boolean(data.event?.planStepId) && Array.isArray(data.event?.tools));
  listen('resultUpdate', data => Boolean(data.event?.result));
  listen('actionLog', data => Boolean(data.event?.planStepId));
  listen('messageTrace', data => Boolean(data.event));
  listen('error');
  listen('task_progress');

  eventSource.onerror = () => {
    eventSource.close();
    handlers.onError?.();
  };

  return () => eventSource.close();
}
