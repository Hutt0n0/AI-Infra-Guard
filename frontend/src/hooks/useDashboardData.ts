import { useEffect, useState } from 'react';
import { fetchDashboardSummary, type DashboardSummary } from '../lib/dashboardApi';

export interface DashboardFilters {
  /** 资产域筛选 — 后端暂无资产域概念（coverage.assetDomain=false），参数保留仅作 UI 反馈 */
  assetDomain: string;
  taskType: string;
  timeRange: '7d' | '30d' | '90d';
}

/** 前端卡片消费的视图数据（与后端 summary 一一映射） */
export interface DashboardData {
  kpis: {
    score: { value: number | null; unit: string; sampleSize?: number; coverage?: string };
    pendingRisks: { value: number; unit: string; coverage?: string };
    coveredAssets: { value: number; unit: string; coverage?: string };
    jailbreakPassRate: { value: number | null; unit: string; baseTotal?: number; coverage?: string };
  };
  /** 趋势：后端按任务类型分系列，映射到设计稿 3 系列（infra/mcp/agent）+ redteam */
  trend: { date: string; infra: number; mcp: number; agent: number }[];
  severity: { level: string; count: number }[];
  /** 后端暂无 sub/score 明细 → 只传 name + riskCount（卡片空态降级显示） */
  topTargets: { name: string; riskCount: number }[];
  recentFindings: { id: string; title: string; sub: string; severity: string }[];
  /** 后端暂无数据支撑的卡片标记（前端显示空态说明，不 mock） */
  unsupported: { assetDomain: boolean; scoreDist: boolean; topComponents: boolean };
  coverage?: DashboardSummary['coverage'];
}

/**
 * Dashboard 数据源 — 对接真实聚合端点 /api/v1/dashboard/summary（阶段 9）。
 * 后端无数据支撑的指标（scoreDist/topComponents/assetDomain）返回
 * unsupported 标记，卡片自行降级为空态。
 */
export function useDashboardData(filters: DashboardFilters): {
  data: DashboardData;
  isLoading: boolean;
  error: string | null;
  source: 'api';
} {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchDashboardSummary({ taskType: filters.taskType, timeRange: filters.timeRange })
      .then(summary => {
        if (cancelled) return;
        setData(summaryToView(summary));
        setIsLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载 Dashboard 数据失败');
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters.taskType, filters.timeRange]);
  // assetDomain 后端不支持，不触发请求（防 lint 依赖告警）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { /* assetDomain 仅 UI 反馈 */ }, [filters.assetDomain]);

  return { data, isLoading, error, source: 'api' };
}

const EMPTY_DATA: DashboardData = {
  kpis: {
    score: { value: null, unit: '/100' },
    pendingRisks: { value: 0, unit: '项' },
    coveredAssets: { value: 0, unit: '个' },
    jailbreakPassRate: { value: null, unit: '%' },
  },
  trend: [],
  severity: [],
  topTargets: [],
  recentFindings: [],
  unsupported: { assetDomain: true, scoreDist: true, topComponents: true },
};

/** 后端 summary → 前端视图模型映射 */
function summaryToView(s: DashboardSummary): DashboardData {
  const sev = s.severity ?? { critical: 0, high: 0, medium: 0, low: 0 };
  return {
    kpis: {
      score: {
        value: s.kpis.score ? s.kpis.score.value : null,
        unit: '/100',
        sampleSize: s.kpis.score?.sampleSize,
        coverage: s.coverage?.score,
      },
      pendingRisks: { value: s.kpis.pendingRisks ?? 0, unit: '项', coverage: s.coverage?.pendingRisks },
      coveredAssets: { value: s.kpis.coveredAssets ?? 0, unit: '个', coverage: s.coverage?.coveredAssets },
      jailbreakPassRate: {
        value: s.kpis.jailbreakPassRate ? s.kpis.jailbreakPassRate.value : null,
        unit: '%',
        baseTotal: s.kpis.jailbreakPassRate?.baseTotal,
        coverage: s.coverage?.jailbreakPassRate,
      },
    },
    // 设计稿 3 系列映射：infra/mcp/agent（redteam 计入 agent 桶或独立，此处合并到 agent 展示）
    trend: (s.trend ?? []).map(t => ({
      date: t.date,
      infra: t['AI-Infra-Scan'] ?? 0,
      mcp: (t['Mcp-Scan'] ?? 0),
      agent: (t['Agent-Scan'] ?? 0) + (t['Model-Redteam-Report'] ?? 0),
    })),
    severity: [
      { level: 'critical', count: sev.critical ?? 0 },
      { level: 'high', count: sev.high ?? 0 },
      { level: 'medium', count: sev.medium ?? 0 },
      { level: 'low', count: sev.low ?? 0 },
    ],
    topTargets: s.topTargets ?? [],
    recentFindings: (s.recentFindings ?? []).map(f => ({
      id: f.sessionId,
      title: f.title,
      sub: `${f.taskType} · ${f.riskCount} 项风险`,
      severity: f.severity.toUpperCase(),
    })),
    unsupported: {
      assetDomain: s.coverage?.assetDomain !== true,
      scoreDist: s.coverage?.scoreDist !== true,
      topComponents: s.coverage?.topComponents !== true,
    },
    coverage: s.coverage,
  };
}
