import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, Boxes, Zap } from 'lucide-react';
import { PageHeader, FilterChips, FilterRow, FilterSeparator, KpiCard } from '../components/platform/primitives';
import {
  TrendChartCard, SeverityDistCard, TopRiskyAssetsCard,
  ScoreDistCard, LiveTasksCard, TopComponentsCard, RecentFindingsCard,
} from '../components/platform/dashboard';
import { useDashboardData } from '../hooks/useDashboardData';

const ASSET_DOMAINS = [
  { key: 'all', labelKey: 'platform.dashboard.domainAll', fallback: '全部资产域' },
  { key: 'prod', labelKey: 'platform.dashboard.domainProd', fallback: '生产网' },
  { key: 'dev', labelKey: 'platform.dashboard.domainDev', fallback: '研发网' },
  { key: 'cloud', labelKey: 'platform.dashboard.domainCloud', fallback: '云上' },
];

const TASK_TYPES = [
  { key: 'all', labelKey: 'platform.dashboard.typeAll', fallback: '全部任务' },
  { key: 'AI-Infra-Scan', labelKey: 'platform.dashboard.typeInfra', fallback: 'AI-Infra-Scan' },
  { key: 'Mcp-Scan', labelKey: 'platform.dashboard.typeMcp', fallback: 'Mcp-Scan' },
  { key: 'Agent-Scan', labelKey: 'platform.dashboard.typeAgent', fallback: 'Agent-Scan' },
];

const TIME_RANGES = [
  { key: '7d', labelKey: 'platform.dashboard.time7d', fallback: '近 7 天' },
  { key: '30d', labelKey: 'platform.dashboard.time30d', fallback: '近 30 天' },
  { key: '90d', labelKey: 'platform.dashboard.time90d', fallback: '近 90 天' },
] as const;

/** 安全总览 Dashboard — mock 数据 + 真实任务流（LiveTasksCard） */
export default function DashboardPage() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [assetDomain, setAssetDomain] = React.useState('all');
  const [taskType, setTaskType] = React.useState('all');
  const [timeRange, setTimeRange] = React.useState<'7d' | '30d' | '90d'>('30d');

  const { data, source } = useDashboardData({ assetDomain, taskType, timeRange });
  const isMock = source === 'mock';

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  return (
    <div>
      <PageHeader
        title={label('platform.nav.dashboard', '安全总览')}
        titleLight="Security Posture"
        subtitle={label('platform.dashboard.pageSub', 'AI 红队安全态势 · 扫描任务产出聚合')}
        actions={
          isMock ? (
            <span
              className="text-[11px] font-semibold rounded-full px-2.5 py-1"
              style={{ background: 'var(--st-warn-bg)', color: 'var(--st-warn-t)' }}
            >
              {label('platform.dashboard.mockHint', '演示数据')}
            </span>
          ) : undefined
        }
      />

      {/* 筛选行 */}
      <FilterRow>
        <FilterChips
          items={ASSET_DOMAINS.map(d => ({ key: d.key, label: label(d.labelKey, d.fallback) }))}
          activeKey={assetDomain}
          onChange={setAssetDomain}
        />
        <FilterSeparator />
        <FilterChips
          items={TASK_TYPES.map(d => ({ key: d.key, label: label(d.labelKey, d.fallback) }))}
          activeKey={taskType}
          onChange={setTaskType}
        />
        <FilterSeparator />
        <FilterChips
          items={TIME_RANGES.map(d => ({ key: d.key, label: label(d.labelKey, d.fallback) }))}
          activeKey={timeRange}
          onChange={key => setTimeRange(key as '7d' | '30d' | '90d')}
        />
      </FilterRow>

      {/* KPI 行 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
        <KpiCard
          icon={<ShieldCheck />}
          label={label('platform.dashboard.kpiScore', '综合安全评分')}
          value={data.kpis.score.value}
          unit={data.kpis.score.unit}
          delta={data.kpis.score.delta}
          deltaTone={data.kpis.score.deltaTone}
          range={data.kpis.score.range}
          spark={data.kpis.score.spark}
        />
        <KpiCard
          icon={<ShieldAlert />}
          label={label('platform.dashboard.kpiRisks', '待处置风险')}
          value={data.kpis.pendingRisks.value}
          unit={data.kpis.pendingRisks.unit}
          delta={data.kpis.pendingRisks.delta}
          deltaTone={data.kpis.pendingRisks.deltaTone}
          range={data.kpis.pendingRisks.range}
          spark={data.kpis.pendingRisks.spark}
          sparkColor="var(--series-2)"
        />
        <KpiCard
          icon={<Boxes />}
          label={label('platform.dashboard.kpiAssets', '覆盖 AI 资产')}
          value={data.kpis.coveredAssets.value}
          unit={data.kpis.coveredAssets.unit}
          delta={data.kpis.coveredAssets.delta}
          deltaTone={data.kpis.coveredAssets.deltaTone}
          range={data.kpis.coveredAssets.range}
          spark={data.kpis.coveredAssets.spark}
          sparkColor="var(--series-3)"
        />
        <KpiCard
          icon={<Zap />}
          label={label('platform.dashboard.kpiJailbreak', '越狱攻防通过率')}
          value={data.kpis.jailbreakPassRate.value}
          unit={data.kpis.jailbreakPassRate.unit}
          delta={data.kpis.jailbreakPassRate.delta}
          deltaTone={data.kpis.jailbreakPassRate.deltaTone}
          range={data.kpis.jailbreakPassRate.range}
          spark={data.kpis.jailbreakPassRate.spark}
        />
      </div>

      {/* 趋势 + 严重度 */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-3.5 mb-3.5">
        <TrendChartCard data={data.trend} />
        <SeverityDistCard data={data.severity} />
      </div>

      {/* 资产 + 评分 + 任务流 */}
      <div className="grid lg:grid-cols-3 gap-3.5 mb-3.5">
        <TopRiskyAssetsCard data={data.topRiskyAssets} onViewAll={() => navigate('/tasks')} />
        <ScoreDistCard data={data.scoreDistribution} />
        <LiveTasksCard onOpenTaskCenter={() => navigate('/tasks')} />
      </div>

      {/* 组件 + 最新发现 */}
      <div className="grid lg:grid-cols-[1fr_1.55fr] gap-3.5">
        <TopComponentsCard data={data.topComponents} />
        <RecentFindingsCard data={data.recentFindings} onViewAll={() => navigate('/tasks?status=completed')} />
      </div>
    </div>
  );
}
