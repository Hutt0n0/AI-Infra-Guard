import { useMemo } from 'react';
import {
  mockKpis, mockTrend, mockSeverity, mockTopRiskyAssets,
  mockScoreDistribution, mockTopComponents, mockRecentFindings,
} from '../mock/dashboard';

export interface DashboardFilters {
  /** 资产域筛选（mock 阶段仅作 UI 反馈） */
  assetDomain: string;
  taskType: string;
  timeRange: '7d' | '30d' | '90d';
}

export interface DashboardData {
  kpis: typeof mockKpis;
  trend: { date: string; infra: number; mcp: number; agent: number }[];
  severity: { level: string; count: number }[];
  topRiskyAssets: { name: string; sub: string; severity: string; score: number }[];
  scoreDistribution: { bucket: string; count: number }[];
  topComponents: { name: string; count: number }[];
  recentFindings: { id: string; title: string; sub: string; severity: string; impact: number }[];
}

/**
 * Dashboard 数据源。
 * USE_MOCK = true 时返回设计稿静态数据；后端 /dashboard/summary 落地后
 * 改此常量并新增 fetchDashboardStats(filters) 即可切换，页面组件零改动。
 * 实时任务流卡片不走本 hook（直接消费 AppContext 的 tasks）。
 */
const USE_MOCK = true;

export function useDashboardData(filters: DashboardFilters): {
  data: DashboardData;
  isLoading: boolean;
  source: 'mock' | 'api';
} {
  return useMemo(() => {
    if (USE_MOCK) {
      return { data: mockDataFor(filters), isLoading: false, source: 'mock' as const };
    }
    // TODO(backend): fetchDashboardStats(filters) — 聚合端点落地后启用
    return { data: mockDataFor(filters), isLoading: false, source: 'mock' as const };
  }, [filters.assetDomain, filters.taskType, filters.timeRange]);
}

/** mock 阶段对筛选做确定性变形，让 chips 切换有可见反馈 */
function mockDataFor(filters: DashboardFilters): DashboardData {
  const factor = timeFactor(filters.timeRange) * domainFactor(filters.assetDomain);
  const scaleTrend = mockTrend.map(p => ({
    date: p.date,
    infra: Math.round(p.infra * factor),
    mcp: Math.round(p.mcp * factor),
    agent: Math.round(p.agent * factor),
  }));
  const sevTotal = mockSeverity.reduce((sum, s) => sum + s.count, 0);
  const severity = mockSeverity.map(s => ({
    level: s.level,
    count: Math.max(1, Math.round(s.count * factor)),
  }));
  const pendingTotal = severity.reduce((sum, s) => sum + s.count, 0);

  return {
    kpis: {
      score: { ...mockKpis.score },
      pendingRisks: {
        ...mockKpis.pendingRisks,
        value: pendingTotal,
        range: `严重 ${severity[0].count} · 高危 ${severity[1].count} · 中危 ${severity[2].count}`,
      },
      coveredAssets: {
        ...mockKpis.coveredAssets,
        value: Math.round(mockKpis.coveredAssets.value * factor),
      },
      jailbreakPassRate: { ...mockKpis.jailbreakPassRate },
    },
    trend: filters.timeRange === '7d' ? scaleTrend.slice(-8) : filters.timeRange === '90d' ? scaleTrend : scaleTrend,
    severity,
    topRiskyAssets: mockTopRiskyAssets,
    scoreDistribution: mockScoreDistribution.map(d => ({ ...d, count: Math.max(1, Math.round(d.count * factor)) })),
    topComponents: mockTopComponents,
    recentFindings: mockRecentFindings,
    ...(void sevTotal, {}),
  } as DashboardData;
}

function timeFactor(range: string): number {
  if (range === '7d') return 0.4;
  if (range === '90d') return 1.6;
  return 1;
}

function domainFactor(domain: string): number {
  switch (domain) {
    case 'prod': return 0.55;
    case 'dev': return 0.35;
    case 'cloud': return 0.4;
    default: return 1;
  }
}
