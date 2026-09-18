/**
 * 越狱评测数据层 — 从 Model-Redteam-Report 任务的 resultUpdate JSON 提取评测统计。
 * 数据源均为真实后端数据（/app/tasks + /app/tasks/:id），无 mock。
 *
 * result 形状（实测）：{ content: [{ score, total, baseTotal, jailbreak, errored, useless,
 *   modelName, attachment, extraBody: { attackMethodResults, vulnerabilityResults } }] }
 */

import { fetchTaskSummaries, fetchTaskDetailRaw, type TaskSummary } from './taskApi';

export interface AttackMethodResult {
  attackMethod: string;
  total: number;
  jailbreak: number;
  errored: number;
  useless: number;
  asr: number;
  score: number;
}

export interface VulnerabilityResult {
  vulnerability: string;
  total: number;
  jailbreak: number;
  errored: number;
  asr: number;
  score: number;
}

export interface RedteamRun {
  sessionId: string;
  title: string;
  /** 目标引用（params.target_agent_id / model_id） */
  targetRef: string | null;
  /** 评测数据集（params.dataset.dataFile） */
  datasets: string[];
  /** 攻击方法（params.techniques） */
  techniques: string[];
  score: number | null;
  total: number;
  jailbreak: number;
  errored: number;
  baseTotal: number;
  /** 通过率 = 1 - asr（0-100） */
  passRate: number | null;
  attackMethods: AttackMethodResult[];
  vulnerabilities: VulnerabilityResult[];
  updatedAt: number;
}

export interface JailbreakStats {
  runs: RedteamRun[];
  /** 聚合通过率 = 1 - Σjailbreak/Σtotal（0-100），无数据为 null */
  passRate: number | null;
  totalTests: number;
  totalJailbreak: number;
  totalErrored: number;
  /** 攻击方法聚合（同名合并） */
  byAttackMethod: AttackMethodResult[];
}

/** 从 params 提取数据集名列表 */
function parseDatasets(params: unknown): string[] {
  const p = (params ?? {}) as Record<string, any>;
  const ds = p.dataset;
  if (Array.isArray(ds?.dataFile)) return ds.dataFile.filter(Boolean);
  return [];
}

/** 从 resultUpdate JSON（任意形状）提取 content[0] */
function extractContentItem(eventData: unknown): any | null {
  const ev = eventData as any;
  const result = ev?.result ?? ev?.event?.result;
  if (!result || typeof result !== 'object') return null;
  if (Array.isArray(result.content) && result.content.length > 0) return result.content[0];
  return null;
}

/** 拉取全部体检任务摘要（仅 Model-Redteam-Report） */
export async function fetchRedteamSummaries(): Promise<TaskSummary[]> {
  const all = await fetchTaskSummaries();
  return all.filter(t => t.taskType === 'Model-Redteam-Report');
}

/** 拉取单个体检任务的评测统计（详情接口，解析失败返回 null 项） */
export async function fetchRedteamRun(summary: TaskSummary): Promise<RedteamRun> {
  const base: RedteamRun = {
    sessionId: summary.sessionId,
    title: summary.title,
    targetRef: null,
    datasets: [],
    techniques: [],
    score: null,
    total: 0,
    jailbreak: 0,
    errored: 0,
    baseTotal: 0,
    passRate: null,
    attackMethods: [],
    vulnerabilities: [],
    updatedAt: summary.updatedAt,
  };
  try {
    const raw = await fetchTaskDetailRaw(summary.sessionId);
    const p = (raw.params ?? {}) as Record<string, any>;
    base.targetRef = (typeof p.target_agent_id === 'string' && p.target_agent_id) || null;
    if (!base.targetRef && Array.isArray(p.model_id) && p.model_id.length) {
      base.targetRef = p.model_id[0];
    } else if (!base.targetRef && typeof p.model_id === 'string' && p.model_id) {
      base.targetRef = p.model_id;
    }
    base.datasets = parseDatasets(raw.params);
    base.techniques = Array.isArray(p.techniques) ? p.techniques : [];

    const item = extractContentItem(raw.messages.find(m => m.type === 'resultUpdate')?.event);
    if (item) {
      base.score = typeof item.score === 'number' ? item.score : null;
      base.total = item.total ?? 0;
      base.jailbreak = item.jailbreak ?? 0;
      base.errored = item.errored ?? 0;
      base.baseTotal = item.baseTotal ?? 0;
      const eb = item.extraBody ?? {};
      base.attackMethods = Array.isArray(eb.attackMethodResults) ? eb.attackMethodResults : [];
      base.vulnerabilities = Array.isArray(eb.vulnerabilityResults) ? eb.vulnerabilityResults : [];
      if (base.total > 0) {
        base.passRate = Math.round((1 - base.jailbreak / base.total) * 1000) / 10;
      }
    }
    if (raw.updatedAt) base.updatedAt = raw.updatedAt;
  } catch {
    // 详情拉取失败 → 返回摘要级数据（统计字段为空）
  }
  return base;
}

/** 聚合全部体检任务（页面主数据源） */
export async function fetchJailbreakStats(): Promise<JailbreakStats> {
  const summaries = await fetchRedteamSummaries();
  const runs = await Promise.all(summaries.map(fetchRedteamRun));

  const totalTests = runs.reduce((s, r) => s + r.total, 0);
  const totalJailbreak = runs.reduce((s, r) => s + r.jailbreak, 0);
  const totalErrored = runs.reduce((s, r) => s + r.errored, 0);
  const passRate = totalTests > 0 ? Math.round((1 - totalJailbreak / totalTests) * 1000) / 10 : null;

  // 攻击方法同名合并
  const amMap = new Map<string, AttackMethodResult>();
  for (const r of runs) {
    for (const am of r.attackMethods) {
      const key = am.attackMethod || 'unknown';
      const prev = amMap.get(key) ?? { attackMethod: key, total: 0, jailbreak: 0, errored: 0, useless: 0, asr: 0, score: 0 };
      prev.total += am.total ?? 0;
      prev.jailbreak += am.jailbreak ?? 0;
      prev.errored += am.errored ?? 0;
      prev.useless += am.useless ?? 0;
      amMap.set(key, prev);
    }
  }
  const byAttackMethod = [...amMap.values()].map(am => ({
    ...am,
    asr: am.total > 0 ? Math.round((am.jailbreak / am.total) * 1000) / 10 : 0,
    score: am.total > 0 ? Math.round((1 - am.jailbreak / am.total) * 100) : 100,
  }));

  return { runs, passRate, totalTests, totalJailbreak, totalErrored, byAttackMethod };
}
