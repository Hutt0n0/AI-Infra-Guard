/**
 * 任务创建参数构造 — ChatArea 与 NewScanPage 共享的同一链路
 * （「表单化配置与 AI 助手触发等价，参数映射同一后端 API」）
 */
import { shouldShowModelButton } from '../utils/taskUtils';

export interface ModelLike {
  model_id: string;
  name?: string;
}

/** 表单/对话的选中集合抽象（ChatArea 的 state 与 NewScanPage 的 form 都能填充此结构） */
export interface ScanSelections {
  /** 主分析模型（单选模式） */
  selectedModel?: ModelLike;
  /** 多选模式（Model-Redteam-Report 等 model==='multi' 的服务） */
  selectedModels?: ModelLike[];
  /** 评分模型（evalModel==='yes' 的服务） */
  selectedEvalModel?: ModelLike;
  /** HTTP 请求头（AI-Infra-Scan / Mcp-Scan） */
  httpHeaders: { key: string; value: string }[];
  /** 评测数据集（Redteam/Jailbreak） */
  selectedEvaluations: Array<{ name: string; isCustom?: boolean; promptColumn?: string }>;
  /** 评测条数上限（-1 = 不限） */
  maxEvaluationCount: number;
  /** 攻击方法（Model-Redteam-Report） */
  selectedAttackMethods: string[];
  /** Agent 配置名（Agent-Scan / 体检 Agent 目标） */
  selectedAgent?: string;
  /** 技能子集（Agent-Scan 可选） */
  selectedSkills: string[];
  /** Agent 被测目标（Model-Redteam-Report 可选，与 selectedModel 互斥使用） */
  selectedTargetAgent?: string;
  /** SSE 大模型 API 直连被测目标（表单直接填，server 端生成临时 sse target YAML） */
  targetSse?: { url: string; model?: string; api_key?: string; label?: string };
}

/** MCP 服务配置的形状（取自 useMcpServices() 返回项的子集） */
export interface ServiceConfigLike {
  id: string;
  model?: string; // 'yes' | 'no' | 'multi'
  evalModel?: string; // 'yes'
}

/**
 * 主模型 ID：单选返回 string，多选返回 string[]，不适用返回 undefined
 * （ChatArea.getModelId 的纯函数化）
 */
export function getModelIdForTask(
  taskType: string,
  s: Pick<ScanSelections, 'selectedModel' | 'selectedModels'>,
  services: ServiceConfigLike[]
): string | string[] | undefined {
  const service = services.find(sv => sv.id === taskType);

  if (service && service.model === 'no') {
    return undefined;
  }
  if (service && service.model === 'multi') {
    if (s.selectedModels && s.selectedModels.length > 0) {
      return s.selectedModels.map(m => m.model_id);
    }
    return undefined;
  }
  if (shouldShowModelButton(taskType) && s.selectedModel) {
    return s.selectedModel.model_id;
  }
  return undefined;
}

/** 评分模型 ID（ChatArea.getEvalModelId 的纯函数化） */
export function getEvalModelIdForTask(
  taskType: string,
  s: Pick<ScanSelections, 'selectedEvalModel'>,
  services: ServiceConfigLike[]
): string | undefined {
  const service = services.find(sv => sv.id === taskType);
  if (service && service.evalModel === 'yes' && s.selectedEvalModel) {
    return s.selectedEvalModel.model_id;
  }
  return undefined;
}

/**
 * 构造 POST /api/v1/app/tasks 的 params 字段。
 * 与 ChatArea.sendMessageToServer 的组装分支一一对应（行为零变化）。
 */
export function buildTaskParams(
  taskType: string,
  s: ScanSelections,
  services: ServiceConfigLike[],
  content: string
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model_id:
      taskType === 'Agent-Scan'
        ? undefined
        : getModelIdForTask(taskType, s, services),
    eval_model_id:
      taskType === 'Agent-Scan'
        ? getModelIdForTask(taskType, s, services)
        : getEvalModelIdForTask(taskType, s, services),
  };

  // AI-Infra-Scan / Mcp-Scan 允许配置 HTTP Headers（Skill-Scan 不允许）
  if ((taskType === 'AI-Infra-Scan' || taskType === 'Mcp-Scan') && s.httpHeaders.length > 0) {
    const headersObj: Record<string, string> = {};
    s.httpHeaders.forEach(header => {
      if (header.key.trim() && header.value.trim()) {
        headersObj[header.key.trim()] = header.value.trim();
      }
    });
    if (Object.keys(headersObj).length > 0) {
      params.headers = headersObj;
    }
  }

  // 有 content 时 dataset 置空；否则应用选中的评测数据集
  if (content) {
    params.dataset = undefined;
  } else if (s.selectedEvaluations.length > 0) {
    params.dataset = {
      dataFile: s.selectedEvaluations.filter(ev => !ev.isCustom).map(ev => ev.name),
    };
    const customEvaluation = s.selectedEvaluations.find(ev => ev.isCustom);
    if (customEvaluation && customEvaluation.promptColumn) {
      (params.dataset as any).promptColumn = customEvaluation.promptColumn;
    }
    if (s.maxEvaluationCount !== -1) {
      (params.dataset as any).numPrompts = s.maxEvaluationCount;
    }
  }

  // 攻击方法（Model-Redteam-Report）
  if (taskType === 'Model-Redteam-Report' && s.selectedAttackMethods.length > 0) {
    params.techniques = s.selectedAttackMethods;
  }

  // Agent-Scan：agent 配置 + 可选技能子集
  if (taskType === 'Agent-Scan' && s.selectedAgent) {
    params.agent_id = s.selectedAgent;
    if (s.selectedSkills.length > 0) {
      params.skills = s.selectedSkills;
    }
  }

  // 体检 Agent 目标（Model-Redteam-Report；server 端解析 YAML，model 保持为空）
  if (taskType === 'Model-Redteam-Report' && s.selectedTargetAgent) {
    params.target_agent_id = s.selectedTargetAgent;
  }

  // 体检 SSE 大模型 API 直连（server 端生成临时 sse target YAML，复用 target_agent 链路）
  if (taskType === 'Model-Redteam-Report' && s.targetSse?.url) {
    params.target_sse = s.targetSse;
  }

  return params;
}

/** 构造 POST /api/v1/app/tasks 的完整请求体 */
export function buildTaskCreateBody(args: {
  sessionId: string;
  taskType: string;
  content: string;
  attachments: string[];
  params: Record<string, unknown>;
  language: string;
}): Record<string, unknown> {
  return {
    id: args.sessionId,
    sessionId: args.sessionId,
    taskType: args.taskType,
    timestamp: Date.now(),
    content: args.content,
    params: args.params,
    attachments: args.attachments,
    countryIsoCode: args.language,
  };
}

/** 生成 sessionId（与 ChatArea 现行规则一致：${Date.now()}_${rand9}） */
export function generateSessionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
