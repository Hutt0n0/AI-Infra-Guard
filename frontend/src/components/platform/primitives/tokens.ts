/**
 * A.I.G Pro 平台设计 token 的 TypeScript 映射 — 全站唯一实现
 * 与 index.css 的 :root 平台 token 段、aig-pro-platform-redesign.html 对齐
 */

/** 严重度等级（后端 result JSON 中出现的各种写法归一化到这 5 档） */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 严重度 → 有序色带变量（单色相变深，低→高） */
export const SEVERITY_VAR: Record<SeverityLevel, string> = {
  critical: 'var(--sev-5)',
  high: 'var(--sev-4)',
  medium: 'var(--sev-3)',
  low: 'var(--sev-2)',
  info: 'var(--sev-1)',
};

/** 严重度 → 状态色组（badge 用：底色 + 文本色） */
export const SEVERITY_STYLES: Record<SeverityLevel, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'var(--st-crit-bg)', text: 'var(--st-crit-t)', dot: 'var(--st-crit)' },
  high: { bg: 'var(--st-ser-bg)', text: 'var(--st-ser-t)', dot: 'var(--st-ser)' },
  medium: { bg: 'var(--st-warn-bg)', text: 'var(--st-warn-t)', dot: 'var(--st-warn)' },
  low: { bg: '#E8F1FD', text: '#1F5CB0', dot: 'var(--sev-2)' },
  info: { bg: 'var(--st-info-bg)', text: 'var(--st-info-t)', dot: 'var(--st-info)' },
};

/** 任务状态 → badge 样式 */
export type TaskStatus = 'todo' | 'doing' | 'done' | 'error' | 'terminated' | string;

export const TASK_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  doing: { bg: 'var(--st-info-bg)', text: 'var(--st-info-t)' },
  done: { bg: 'var(--st-good-bg)', text: 'var(--st-good-t)' },
  error: { bg: 'var(--st-crit-bg)', text: 'var(--st-crit-t)' },
  terminated: { bg: '#EFF1F6', text: 'var(--ink-2)' },
  todo: { bg: '#EFF1F6', text: 'var(--ink-2)' },
};

/** 任务类型 → 图表系列色（趋势图等按任务类型分系列） */
export const TASK_TYPE_SERIES: Record<string, string> = {
  'AI-Infra-Scan': 'var(--series-1)',
  'Mcp-Scan': 'var(--series-2)',
  'Skill-Scan': 'var(--series-4)',
  'Model-Redteam-Report': 'var(--series-5)',
  'Model-Jailbreak': 'var(--series-5)',
  'Agent-Scan': 'var(--series-3)',
};

/** 图表调色板（recharts 直连用） */
export const SERIES_PALETTE = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];

/** 评分计量带（单蓝有序，分值越低越深）— 资产评分分布柱状图 */
export const SCORE_MET_BAND = [
  'var(--met-5)',
  'var(--met-4)',
  'var(--met-3)',
  'var(--met-2)',
  'var(--met-1)',
];

/**
 * 后端严重度字符串归一化。兼容：
 * 大写/中文/unknown 等写法（后端 vuln YAML 里存在 CRITICAL/HIGH/严重/高危/UNKNOWN 等值）
 */
export function normalizeSeverity(raw: string | undefined | null): SeverityLevel {
  const s = (raw ?? '').toString().trim().toUpperCase();
  if (['CRITICAL', '严重', '危机'].includes(s)) return 'critical';
  if (['HIGH', '高危', '高'].includes(s)) return 'high';
  if (['MEDIUM', 'MODERATE', '中危', '中'].includes(s)) return 'medium';
  if (['LOW', '低危', '低'].includes(s)) return 'low';
  return 'info';
}

/** SecScore 扣分规则（对齐 common/runner/runner.go CalcSecScore：crit/high -70、med -30、low -10） */
export function severityScoreImpact(level: SeverityLevel): number {
  switch (level) {
    case 'critical':
    case 'high':
      return 70;
    case 'medium':
      return 30;
    case 'low':
      return 10;
    default:
      return 0;
  }
}
