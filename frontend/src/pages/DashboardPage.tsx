import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldAlert, Boxes, Zap, Info } from 'lucide-react';
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
  { key: 'Model-Redteam-Report', labelKey: 'platform.dashboard.typeRedteam', fallback: 'Model-Redteam' },
];

const TIME_RANGES = [
  { key: '7d', labelKey: 'platform.dashboard.time7d', fallback: '近 7 天' },
  { key: '30d', labelKey: 'platform.dashboard.time30d', fallback: '近 30 天' },
  { key: '90d', labelKey: 'platform.dashboard.time90d', fallback: '近 90 天' },
] as const;

/** 安全总览 Dashboard — 真实聚合数据（/dashboard/summary）+ 真实任务流（LiveTasksCard） */
export default function DashboardPage() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [assetDomain, setAssetDomain] = React.useState('all');
  const [taskType, setTaskType] = React.useState('all');
  const [timeRange, setTimeRange] = React.useState<'7d' | '30d' | '90d'>('30d');

  const { data, isLoading, error } = useDashboardData({ assetDomain, taskType, timeRange });

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  return (
    <div>
      <PageHeader
        title={label('platform.nav.dashboard', '安全总览')}
        titleLight="Security Posture"
        subtitle={label('platform.dashboard.pageSub', 'AI 红队安全态势 · 扫描任务产出聚合')}
        actions={
          data.unsupported.assetDomain ? (
            <span
              className="text-[11px] font-semibold rounded-full px-2.5 py-1 inline-flex items-center gap-1"
              style={{ background: 'var(--st-warn-bg)', color: 'var(--st-warn-t)' }}
              title={label(
                'platform.dashboard.domainUnsupported',
                '资产域维度需 AI-Infra-Scan 目标资产入库后启用'
              )}
            >
              <Info className="w-3 h-3" />
              {label('platform.dashboard.domainUnsupportedShort', '资产域维度待接入')}
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

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-plat-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          {label('platform.dashboard.loading', '加载态势数据…')}
        </div>
      )}
      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm" style={{ color: 'var(--st-crit-t)' }}>
          {error}
          <button
            type="button"
            onClick={() => setTimeRange(r => r)}
            className="text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--brand-deep)' }}
          >
            {label('common.retry', '重试')}
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* KPI 行 */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
            <KpiCard
              icon={<ShieldCheck />}
              label={label('platform.dashboard.kpiScore', '综合安全评分')}
              value={data.kpis.score.value ?? '—'}
              unit={data.kpis.score.unit}
              delta={data.kpis.score.sampleSize != null ? label('platform.dashboard.kpiSample', '{{count}} 个任务样本', { count: data.kpis.score.sampleSize }) : undefined}
              deltaTone="flat"
              range={data.kpis.score.coverage}
            />
            <KpiCard
              icon={<ShieldAlert />}
              label={label('platform.dashboard.kpiRisks', '待处置风险')}
              value={data.kpis.pendingRisks.value}
              unit={data.kpis.pendingRisks.unit}
              delta={data.severity.length ? label('platform.dashboard.kpiSevRange', '严重 {{c}} · 高危 {{h}} · 中危 {{m}}', { c: data.severity[0]?.count ?? 0, h: data.severity[1]?.count ?? 0, m: data.severity[2]?.count ?? 0 }) : undefined}
              deltaTone={data.kpis.pendingRisks.value > 0 ? 'down-bad' : 'flat'}
              range={data.kpis.pendingRisks.coverage}
              sparkColor="var(--series-2)"
            />
            <KpiCard
              icon={<Boxes />}
              label={label('platform.dashboard.kpiAssets', '覆盖目标')}
              value={data.kpis.coveredAssets.value}
              unit={data.kpis.coveredAssets.unit}
              delta={undefined}
              deltaTone="flat"
              range={data.kpis.coveredAssets.coverage}
              sparkColor="var(--series-3)"
            />
            <KpiCard
              icon={<Zap />}
              label={label('platform.dashboard.kpiJailbreak', '越狱攻防通过率')}
              value={data.kpis.jailbreakPassRate.value ?? '—'}
              unit={data.kpis.jailbreakPassRate.unit}
              delta={data.kpis.jailbreakPassRate.baseTotal != null ? label('platform.dashboard.kpiBaseTotal', '{{count}} 条测试', { count: data.kpis.jailbreakPassRate.baseTotal }) : undefined}
              deltaTone="flat"
              range={data.kpis.jailbreakPassRate.coverage}
            />
          </div>

          {/* 趋势 + 严重度 */}
          <div className="grid lg:grid-cols-[2fr_1fr] gap-3.5 mb-3.5">
            <TrendChartCard data={data.trend} />
            <SeverityDistCard data={data.severity} />
          </div>

          {/* 资产 + 评分 + 任务流 */}
          <div className="grid lg:grid-cols-3 gap-3.5 mb-3.5">
            <TopTargetsCard data={data.topTargets} onViewAll={() => navigate('/tasks')} />
            <ScoreDistEmptyCard />
            <LiveTasksCard onOpenTaskCenter={() => navigate('/tasks')} />
          </div>

          {/* 最新发现 */}
          <div className="grid lg:grid-cols-[1fr_1.55fr] gap-3.5">
            <ComponentsEmptyCard />
            <RecentFindingsCard data={data.recentFindings} onViewAll={() => navigate('/tasks?status=done')} />
          </div>
        </>
      )}
    </div>
  );
}

/** 最高风险目标 — 真实数据（riskCount 排序）；无数据时空态 */
function TopTargetsCard({ data, onViewAll }: { data: { name: string; riskCount: number }[]; onViewAll?: () => void }) {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);
  const max = Math.max(...data.map(d => d.riskCount), 1);
  return (
    <div
      className="bg-card border rounded-plat shadow-plat-card p-[18px_20px]"
      style={{ borderRadius: 'var(--plat-radius)', borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-baseline gap-2.5 mb-1">
        <div>
          <div className="font-head font-semibold text-[15px] text-plat-ink">{label('platform.dashboard.topTargetsTitle', '最高风险目标')}</div>
          <div className="text-[11.5px] text-plat-muted mt-0.5">{label('platform.dashboard.topTargetsSub', '按风险发现数排序')}</div>
        </div>
        <button type="button" onClick={onViewAll} className="ml-auto text-xs font-semibold cursor-pointer" style={{ color: 'var(--brand-deep)' }}>
          {label('platform.dashboard.viewAll', '全部 →')}
        </button>
      </div>
      {data.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-plat-muted">{label('platform.dashboard.emptyTargets', '暂无目标风险数据')}</div>
      ) : (
        <div className="mt-3 flex flex-col gap-[9px]">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2.5">
              <span className="w-32 shrink-0 text-right text-[11px] text-plat-muted truncate font-mono">{d.name}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 flex justify-end">
                  <div className="h-[14px] rounded-r-[4px]" style={{ width: `${(d.riskCount / max) * 82}%`, minWidth: 8, background: 'var(--series-1)' }} />
                </div>
                <span className="text-[11px] font-semibold text-plat-ink w-6">{d.riskCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 资产评分分布 — 后端暂无此聚合（coverage.scoreDist=false），空态说明卡 */
function ScoreDistEmptyCard() {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);
  return (
    <div
      className="bg-card border rounded-plat shadow-plat-card p-[18px_20px] flex flex-col"
      style={{ borderRadius: 'var(--plat-radius)', borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="font-head font-semibold text-[15px] text-plat-ink">{label('platform.dashboard.scoreDistTitle', '资产评分分布')}</div>
      <div className="text-[11.5px] text-plat-muted mt-0.5">{label('platform.dashboard.scoreDistSub', 'SecScore 区间')}</div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="text-[13px] text-plat-muted max-w-[240px] leading-relaxed">
          {label('platform.dashboard.scoreDistUnsupported', '该指标需要 AI-Infra-Scan 资产指纹数据，当前任务类型暂未产出')}
        </div>
      </div>
    </div>
  );
}

/** 组件识别 — 后端暂无指纹命中聚合（coverage.topComponents=false），空态说明卡 */
function ComponentsEmptyCard() {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);
  return (
    <div
      className="bg-card border rounded-plat shadow-plat-card p-[18px_20px] flex flex-col"
      style={{ borderRadius: 'var(--plat-radius)', borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="font-head font-semibold text-[15px] text-plat-ink">{label('platform.dashboard.componentsTitle', '组件识别 Top 8')}</div>
      <div className="text-[11.5px] text-plat-muted mt-0.5">{label('platform.dashboard.componentsSub', '指纹命中统计')}</div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="text-[13px] text-plat-muted max-w-[240px] leading-relaxed">
          {label('platform.dashboard.componentsUnsupported', '该指标需要 AI-Infra-Scan 指纹扫描数据，当前任务类型暂未产出')}
        </div>
      </div>
    </div>
  );
}
