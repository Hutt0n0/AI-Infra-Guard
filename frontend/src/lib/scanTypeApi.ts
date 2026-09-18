/**
 * 扫描类型页数据层 — 按任务类型取历史任务 + 结果指标聚合。
 * 数据源：GET /app/tasks?taskType=<type>（服务端类型过滤，阶段 9）。
 * 类型指标（评分/风险）来自阶段 9 enrichTaskSummary 扩展字段。
 */

import { fetchTaskSummaries, type TaskSummary } from './taskApi';

export interface ScanTypeStats {
  tasks: TaskSummary[];
  total: number;
  /** 状态分布 */
  done: number;
  running: number;
  error: number;
  terminated: number;
  /** 已完成任务评分均值（取不到为 null） */
  avgScore: number | null;
  /** 风险总数（已完成任务的 riskCount 求和） */
  riskTotal: number;
  /** 最近一次任务的评分 */
  latestScore: number | null;
  /** 最近 14 天任务量（按日） */
  trend: { date: string; count: number }[];
}

const TYPE_ALIASES: Record<string, string[]> = {
  'Agent-Scan': ['Agent-Scan'],
  'Skill-Scan': ['Skill-Scan'],
  'Mcp-Scan': ['Mcp-Scan'],
  'Model-Redteam-Report': ['Model-Redteam-Report', 'Model-Jailbreak'],
  'AI-Infra-Scan': ['AI-Infra-Scan'],
};

export async function fetchScanTypeStats(taskType: string): Promise<ScanTypeStats> {
  // 服务端按 taskType 过滤（HandleGetTaskList 透传给 GetUserTasksByType）
  const tasks = await fetchTaskSummaries({ taskType });
  // 体检类任务把 Model-Jailbreak 别名也纳入（同一能力族）
  const aliases = TYPE_ALIASES[taskType] ?? [taskType];
  const filtered = tasks.filter(t => aliases.some(a => t.taskType.includes(a.replace('Model-Jailbreak', 'Jailbreak')) || t.taskType === a));

  const done = filtered.filter(t => t.status === 'done');
  const running = filtered.filter(t => t.status === 'doing' || t.status === 'todo');
  const error = filtered.filter(t => t.status === 'error');
  const terminated = filtered.filter(t => t.status === 'terminated');

  const scores = done.map(t => t.score).filter((s): s is number => s != null);
  const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const riskTotal = done.reduce((s, t) => s + (t.riskCount ?? 0), 0);
  const latestScore = scores.length ? scores[0] : null;

  // 最近 14 天任务量趋势（按 updatedAt 落日）
  const days: string[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const dayCount = new Map<string, number>(days.map(d => [d, 0]));
  for (const t of filtered) {
    const d = new Date(t.updatedAt);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dayCount.has(key)) dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
  }

  return {
    tasks: filtered,
    total: filtered.length,
    done: done.length,
    running: running.length,
    error: error.length,
    terminated: terminated.length,
    avgScore,
    riskTotal,
    latestScore,
    trend: days.map(d => ({ date: d, count: dayCount.get(d) ?? 0 })),
  };
}
