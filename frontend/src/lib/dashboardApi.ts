/**
 * Dashboard 聚合数据层 — 对接 GET /api/v1/dashboard/summary（阶段 9 新增端点）。
 * 后端返回的 coverage 字段说明各指标口径；assetDomain/scoreDist/topComponents
 * 暂无数据支撑（coverage 为 false），前端对应卡片显示空态而非 mock。
 */

const API_BASE = '/api/v1/dashboard';

export interface DashboardKpiScore {
  value: number;
  sampleSize: number;
}

export interface DashboardKpiJailbreak {
  value: number;
  baseTotal: number;
  jailbreak: number;
}

export interface DashboardSummary {
  kpis: {
    score: DashboardKpiScore | null;
    pendingRisks: number;
    coveredAssets: number;
    jailbreakPassRate: DashboardKpiJailbreak | null;
    taskCount: number;
  };
  trend: { date: string; 'AI-Infra-Scan': number; 'Mcp-Scan': number; 'Agent-Scan': number; 'Model-Redteam-Report': number }[];
  severity: { critical: number; high: number; medium: number; low: number };
  topTargets: { name: string; riskCount: number }[];
  recentFindings: {
    sessionId: string;
    title: string;
    taskType: string;
    riskCount: number;
    severity: string;
    updatedAt: number;
  }[];
  coverage: {
    score: string;
    pendingRisks: string;
    coveredAssets: string;
    jailbreakPassRate: string;
    assetDomain: boolean;
    scoreDist: boolean;
    topComponents: boolean;
  };
}

export async function fetchDashboardSummary(params?: { taskType?: string; timeRange?: string }): Promise<DashboardSummary> {
  const search = new URLSearchParams();
  if (params?.taskType && params.taskType !== 'all') search.set('taskType', params.taskType);
  if (params?.timeRange) search.set('timeRange', params.timeRange);
  const qs = search.toString();
  const response = await fetch(`${API_BASE}/summary${qs ? `?${qs}` : ''}`);
  const responseData = await response.json();
  if (responseData.status !== 0) {
    throw new Error(responseData.message || '获取 Dashboard 数据失败');
  }
  return responseData.data as DashboardSummary;
}
