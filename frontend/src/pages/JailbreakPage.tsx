import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, Target, FlaskConical, Swords, RefreshCw, FileBarChart2 } from 'lucide-react';
import { PageHeader, KpiCard, SectionCard, DataTable } from '../components/platform/primitives';
import type { DataTableColumn } from '../components/platform/primitives';
import { fetchJailbreakStats, type JailbreakStats, type RedteamRun, type AttackMethodResult } from '../lib/jailbreakApi';

/** 越狱评测 — Model-Redteam-Report 任务聚合（真实数据：/app/tasks + 详情 resultUpdate） */
export default function JailbreakPage() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = React.useState<JailbreakStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchJailbreakStats()
      .then(s => { setStats(s); setIsLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : '加载失败'); setIsLoading(false); });
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const runColumns: DataTableColumn<RedteamRun>[] = [
    {
      key: 'task',
      header: label('platform.jailbreak.colRun', '评测任务'),
      width: '34%',
      cell: r => (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-plat-ink truncate">{r.title || r.sessionId}</div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate">{r.sessionId.slice(0, 18)}… · {r.techniques.join(' / ') || '—'}</div>
        </div>
      ),
    },
    {
      key: 'target',
      header: label('platform.jailbreak.colTarget', '目标'),
      cell: r => <span className="font-mono text-[12px] text-plat-ink-2 truncate block max-w-[180px]">{r.targetRef || '—'}</span>,
    },
    {
      key: 'dataset',
      header: label('platform.jailbreak.colDataset', '数据集'),
      cell: r => <span className="text-[12px] text-plat-ink-2">{r.datasets.length ? r.datasets.join(' / ') : '—'}</span>,
    },
    {
      key: 'result',
      header: label('platform.jailbreak.colResult', '攻破 / 总数'),
      numeric: true,
      cell: r => (
        <span className="font-semibold">
          <span style={{ color: r.jailbreak > 0 ? 'var(--st-crit-t)' : 'var(--st-good-t)' }}>{r.jailbreak}</span>
          <span className="text-plat-muted"> / {r.total || '—'}</span>
        </span>
      ),
    },
    {
      key: 'pass',
      header: label('platform.jailbreak.colPass', '通过率'),
      numeric: true,
      cell: r => r.passRate != null
        ? <span className="font-bold" style={{ color: r.passRate >= 80 ? 'var(--st-good-t)' : r.passRate >= 50 ? 'var(--st-warn-t)' : 'var(--st-crit-t)' }}>{r.passRate}%</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: r => (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); navigate(`/report/${r.sessionId}`); }}
          className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
          style={{ color: 'var(--brand-deep)' }}
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          {label('platform.jailbreak.viewReport', '查看报告')}
        </button>
      ),
    },
  ];

  const amColumns: DataTableColumn<AttackMethodResult>[] = [
    {
      key: 'method',
      header: label('platform.jailbreak.colMethod', '攻击方法'),
      cell: r => <span className="font-semibold text-plat-ink">{r.attackMethod}</span>,
    },
    { key: 'total', header: label('platform.jailbreak.colTotal', '测试数'), numeric: true, cell: r => r.total },
    {
      key: 'jb',
      header: label('platform.jailbreak.colJailbreak', '攻破'),
      numeric: true,
      cell: r => <span style={{ color: r.jailbreak > 0 ? 'var(--st-crit-t)' : 'var(--st-good-t)' }} className="font-semibold">{r.jailbreak}</span>,
    },
    {
      key: 'asr',
      header: label('platform.jailbreak.colAsr', '攻击成功率'),
      numeric: true,
      cell: r => <span>{r.asr}%</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={label('platform.nav.jailbreak', '越狱评测')}
        titleLight="Jailbreak Evaluation"
        subtitle={label('platform.jailbreak.pageSub', '大模型安全体检任务聚合 · 攻击方法对抗统计')}
        actions={
          <>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
              style={{ borderColor: 'var(--outline)' }}
            >
              {isLoading ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              {label('platform.jailbreak.refresh', '刷新')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/scan?type=Model-Redteam-Report')}
              className="inline-flex items-center gap-[7px] rounded-[11px] px-[15px] py-2 text-[13px] font-semibold text-white cursor-pointer hover:opacity-90"
              style={{ background: 'var(--brand)', boxShadow: '0 6px 16px rgba(93,95,239,.32)' }}
            >
              <Swords className="w-[15px] h-[15px]" />
              {label('platform.jailbreak.newEval', '发起新评测')}
            </button>
          </>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-plat-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          {label('platform.jailbreak.loading', '加载评测数据…')}
        </div>
      )}
      {!isLoading && error && (
        <div className="py-20 text-center text-sm" style={{ color: 'var(--st-crit-t)' }}>{error}</div>
      )}

      {!isLoading && !error && stats && (
        <>
          {/* KPI 行 */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
            <KpiCard
              icon={<ShieldCheck />}
              label={label('platform.dashboard.kpiJailbreak', '越狱攻防通过率')}
              value={stats.passRate ?? '—'}
              unit="%"
              delta={undefined}
              deltaTone={stats.passRate != null && stats.passRate >= 80 ? 'up-good' : stats.passRate != null ? 'down-bad' : 'flat'}
              range={label('platform.jailbreak.kpiPassHint', '1 - 攻破率（全部体检任务聚合）')}
            />
            <KpiCard
              icon={<FlaskConical />}
              label={label('platform.jailbreak.kpiTests', '累计测试条数')}
              value={stats.totalTests}
              unit={label('platform.jailbreak.unitCases', '条')}
              delta={undefined}
              deltaTone="flat"
              range={label('platform.jailbreak.kpiTestsHint', '全部已完成体检任务的提示词总数')}
              sparkColor="var(--series-3)"
            />
            <KpiCard
              icon={<Target />}
              label={label('platform.jailbreak.kpiJailbreak', '攻破次数')}
              value={stats.totalJailbreak}
              unit={label('platform.jailbreak.unitTimes', '次')}
              delta={undefined}
              deltaTone={stats.totalJailbreak > 0 ? 'down-bad' : 'up-good'}
              range={label('platform.jailbreak.kpiJbHint', '提示词被成功攻破的次数')}
              sparkColor="var(--series-2)"
            />
            <KpiCard
              icon={<Swords />}
              label={label('platform.jailbreak.kpiRuns', '评测任务数')}
              value={stats.runs.length}
              unit={label('platform.jailbreak.unitRuns', '次')}
              delta={undefined}
              deltaTone="flat"
              range={label('platform.jailbreak.kpiRunsHint', '含进行中与已完成')}
            />
          </div>

          {/* 攻击方法统计 */}
          <div className="mb-3.5">
            <SectionCard padded={false} className="overflow-hidden">
              <div className="p-[18px_20px]">
                <div className="font-head font-semibold text-[15px] text-plat-ink mb-3">
                  {label('platform.jailbreak.byMethodTitle', '攻击方法对抗统计')}
                </div>
                <DataTable
                  columns={amColumns}
                  rows={stats.byAttackMethod}
                  rowKey={r => r.attackMethod}
                  empty={label('platform.jailbreak.emptyMethods', '暂无攻击方法数据')}
                />
              </div>
            </SectionCard>
          </div>

          {/* 历史任务对比 */}
          <SectionCard padded={false} className="overflow-hidden">
            <div className="p-[18px_20px]">
              <div className="font-head font-semibold text-[15px] text-plat-ink mb-3">
                {label('platform.jailbreak.historyTitle', '历史评测对比')}
              </div>
              <DataTable
                columns={runColumns}
                rows={[...stats.runs].sort((a, b) => b.updatedAt - a.updatedAt)}
                rowKey={r => r.sessionId}
                onRowClick={r => navigate(`/report/${r.sessionId}`)}
                empty={label('platform.jailbreak.emptyRuns', '暂无评测任务 — 通过「发起新评测」或 AI 助手创建')}
              />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
