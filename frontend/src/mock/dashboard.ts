/**
 * Dashboard mock 数据 — 与 aig-pro-platform-redesign.html 设计稿数值一致
 * 后端聚合端点（/dashboard/summary）落地后由 hooks/useDashboardData 切换。
 */

export interface KpiMock {
  value: number;
  unit?: string;
  delta: string;
  deltaTone: 'up-good' | 'down-bad' | 'up-bad' | 'flat';
  range: string;
  spark: number[];
}

export const mockKpis = {
  score: {
    value: 72,
    unit: '/100',
    delta: '▲ 4.2',
    deltaTone: 'up-good',
    range: 'vs 上周期 · SecScore',
    spark: [22, 25, 20, 23, 16, 19, 12, 14, 8],
  } as KpiMock,
  pendingRisks: {
    value: 47,
    unit: '项',
    delta: '▼ 6 新增',
    deltaTone: 'down-bad',
    range: '严重 5 · 高危 16 · 中危 26',
    spark: [18, 22, 15, 20, 14, 18, 11, 16, 12],
  } as KpiMock,
  coveredAssets: {
    value: 128,
    unit: '个',
    delta: '▲ 9 新接入',
    deltaTone: 'up-good',
    range: '28 个组件 · 154 条指纹规则',
    spark: [26, 25, 24, 22, 22, 19, 17, 14, 11],
  } as KpiMock,
  jailbreakPassRate: {
    value: 17.4,
    unit: '%',
    delta: '▲ 2.1 攻破率',
    deltaTone: 'up-bad',
    range: '18 数据集 · 4 种多轮攻击',
    spark: [14, 16, 13, 17, 15, 19, 16, 20, 18],
  } as KpiMock,
};

/** 30 天 3 系列风险趋势（AI 基础设施 / MCP 服务 / Agent 工作流） */
export const mockTrend = (() => {
  const dates = Array.from({ length: 17 }, (_, i) => {
    const d = new Date(2026, 8, 11 + i); // 09-11 起
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const infra = [200, 190, 196, 172, 178, 150, 158, 132, 140, 116, 122, 98, 104, 82, 88, 64, 70];
  const mcp = [224, 216, 220, 206, 212, 196, 202, 186, 192, 174, 180, 162, 168, 150, 156, 138, 144];
  const agent = [230, 226, 228, 220, 224, 214, 218, 208, 212, 200, 204, 192, 196, 184, 188, 176, 180];
  // SVG y 值 → 计数值：设计稿画布 250 高，0 在 y=230，每 50px=10 计数
  const toCount = (y: number) => Math.round((230 - y) / 5);
  return dates.map((date, i) => ({
    date,
    infra: toCount(infra[i]),
    mcp: toCount(mcp[i]),
    agent: toCount(agent[i]),
  }));
})();

export const mockSeverity = [
  { level: 'critical', count: 5 },
  { level: 'high', count: 16 },
  { level: 'medium', count: 26 },
  { level: 'low', count: 13 },
  { level: 'info', count: 6 },
];

export const mockTopRiskyAssets = [
  { name: 'llm-gateway.prod.internal', sub: 'vLLM 0.8.4 · 10.2.11.30', severity: 'CRITICAL', score: 31 },
  { name: 'dify-workspace.corp.cn', sub: 'Dify 1.4.1 · Web', severity: 'HIGH', score: 45 },
  { name: 'mcp-registry.dev', sub: 'MCP Server · 12 插件', severity: 'HIGH', score: 52 },
  { name: 'agent-factory.internal', sub: 'Agent 工作流 · OWASP Agentic', severity: 'MEDIUM', score: 61 },
  { name: 'comfyui-lab.research', sub: 'ComfyUI · GPU 节点', severity: 'MEDIUM', score: 68 },
];

export const mockScoreDistribution = [
  { bucket: '0-39', count: 11 },
  { bucket: '40-59', count: 22 },
  { bucket: '60-79', count: 52 },
  { bucket: '80-99', count: 19 },
  { bucket: '100', count: 4 },
];

export const mockTopComponents = [
  { name: 'Ollama', count: 21 },
  { name: 'vLLM', count: 18 },
  { name: 'Dify', count: 15 },
  { name: 'ComfyUI', count: 12 },
  { name: 'Gradio', count: 10 },
  { name: 'n8n', count: 8 },
  { name: 'Triton', count: 6 },
  { name: 'OneAPI', count: 4 },
];

export const mockRecentFindings = [
  { id: 'CVE-2026-73079', title: 'CVE-2026-73079', sub: 'sub2api · SSRF 未授权访问', severity: 'CRITICAL', impact: -70 },
  { id: 'tool-poisoning', title: 'Tool Poisoning', sub: 'mcp-registry · 描述与实现不一致', severity: 'HIGH', impact: -70 },
  { id: 'ag06', title: 'AG06 · 敏感数据泄露', sub: 'agent-factory · OWASP Agentic Top10', severity: 'MEDIUM', impact: -30 },
  { id: 'goat', title: 'Jailbreak · GOAT 多轮', sub: 'DeepSeek-V3 · JADE-db 攻破', severity: 'HIGH', impact: -70 },
  { id: 'cve-32433', title: 'CVE-2025-32433', sub: 'MCP Server · 路径穿越', severity: 'MEDIUM', impact: -30 },
];
