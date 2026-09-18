import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, FileBarChart2, Bot, FileSearch, ShieldCheck, AlertTriangle, Bug, Plus } from 'lucide-react';
import { PageHeader, KpiCard, FilterChips, FilterRow, DataTable, TaskTypeBadge, TaskStatusBadge, Sparkline } from '../components/platform/primitives';
import type { DataTableColumn } from '../components/platform/primitives';
import { fetchScanTypeStats, type ScanTypeStats } from '../lib/scanTypeApi';
import type { TaskSummary } from '../lib/taskApi';

/** 5 类扫描能力路由参数 → 任务类型映射 */
const SCAN_TYPES: Record<string, { taskType: string; navKey: string; fallback: string; light: string; icon: React.ComponentType<{ className?: string }> }> = {
  agent: { taskType: 'Agent-Scan', navKey: 'agentScan', fallback: 'Agent扫描', light: 'Agent Scan', icon: Bot },
  skill: { taskType: 'Skill-Scan', navKey: 'skillScan', fallback: 'Skill扫描', light: 'Skill Scan', icon: FileSearch },
  mcp: { taskType: 'Mcp-Scan', navKey: 'mcpScan', fallback: 'MCP扫描', light: 'MCP Scan', icon: ShieldCheck },
  redteam: { taskType: 'Model-Redteam-Report', navKey: 'modelRedteamReport', fallback: '大模型安全体检', light: 'LLM Security Check', icon: AlertTriangle },
  infra: { taskType: 'AI-Infra-Scan', navKey: 'aiInfraScan', fallback: 'AI基础设施扫描', light: 'AI Infra Scan', icon: Bug },
};

const STATUS_FILTERS = [
  { key: 'all', fallback: '全部' },
  { key: 'doing', fallback: '运行中' },
  { key: 'done', fallback: '已完成' },
  { key: 'error', fallback: '失败' },
  { key: 'terminated', fallback: '已终止' },
] as const;

/** 扫描类型任务视图 — SideNav 检测能力菜单的落地页（历史任务列表 + 结果指标） */
export default function ScanTypePage() {
  const { scanType } = useParams<{ scanType: string }>();
  const navigate = useNavigate();
  const { t, ready } = useTranslation();
  const meta = SCAN_TYPES[scanType ?? ''] ?? SCAN_TYPES.agent;

  const [stats, setStats] = React.useState<ScanTypeStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusDraft, setStatusDraft] = React.useState<string>('all');
  const [searchDraft, setSearchDraft] = React.useState('');

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);
  const navLabel = (key: string, fallback: string) => (ready ? t(`platform.nav.${key}`, fallback) : fallback);

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchScanTypeStats(meta.taskType)
      .then(s => { setStats(s); setIsLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : '加载失败'); setIsLoading(false); });
  }, [meta.taskType]);

  React.useEffect(() => {
    setStats(null);
    setStatusDraft('all');
    setSearchDraft('');
    load();
  }, [load]);

  const rows = React.useMemo(() => {
    if (!stats) return [];
    const q = searchDraft.trim().toLowerCase();
    return stats.tasks
      .filter(task => {
        if (statusDraft === 'doing' && !(task.status === 'doing' || task.status === 'todo')) return false;
        if (statusDraft !== 'all' && statusDraft !== 'doing' && task.status !== statusDraft) return false;
        if (q && !(`${task.title}`.toLowerCase().includes(q) || task.sessionId.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [stats, statusDraft, searchDraft]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const columns: DataTableColumn<TaskSummary>[] = [
    {
      key: 'task',
      header: label('platform.scanType.colTask', '任务'),
      width: '32%',
      cell: r => (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-plat-ink truncate">{r.title || r.sessionId}</div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate">{r.sessionId.slice(0, 18)}… · {fmtTime(r.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: label('platform.scanType.colType', '类型'),
      cell: r => <TaskTypeBadge type={r.taskType} />,
    },
    {
      key: 'agent',
      header: label('platform.taskCenter.colAgent', 'Agent 节点'),
      cell: r => <span className="font-mono text-[12px] text-plat-ink-2 truncate block max-w-[140px]">{(r as any).assignedAgent || '—'}</span>,
    },
    {
      key: 'status',
      header: label('platform.scanType.colStatus', '状态'),
      cell: r => (
        <TaskStatusBadge
          status={r.status === 'done' ? 'done' : r.status === 'doing' || r.status === 'todo' ? 'doing' : r.status}
          progress={r.status === 'doing' && (r as any).progress != null ? (r as any).progress : undefined}
        />
      ),
    },
    {
      key: 'risk',
      header: label('platform.scanType.colRisks', '风险'),
      numeric: true,
      cell: r => r.riskCount != null
        ? <span className="font-semibold" style={{ color: r.riskCount > 0 ? 'var(--st-crit-t)' : 'var(--st-good-t)' }}>{r.riskCount}</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'score',
      header: label('platform.scanType.colScore', '评分'),
      numeric: true,
      cell: r => r.score != null
        ? <span className="font-semibold" style={{ color: r.score < 60 ? 'var(--st-crit-t)' : r.score < 80 ? 'var(--st-warn-t)' : 'var(--st-good-t)' }}>{r.score}</span>
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
          {label('platform.reports.viewReport', '查看报告')}
        </button>
      ),
    },
  ];

  const Icon = meta.icon;
  const statusCounts = {
    all: stats?.total ?? 0,
    doing: stats?.running ?? 0,
    done: stats?.done ?? 0,
    error: stats?.error ?? 0,
    terminated: stats?.terminated ?? 0,
  };

  return (
    <div>
      <PageHeader
        title={navLabel(meta.navKey, meta.fallback)}
        titleLight={meta.light}
        subtitle={label('platform.scanType.pageSub', '该能力的历史任务与结果指标 · 点击右上角「新建扫描」发起新任务')}
        actions={
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
            style={{ borderColor: 'var(--outline)' }}
          >
            {isLoading ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
            {label('platform.reports.refresh', '刷新')}
          </button>
        }
      />

      {isLoading && !stats && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-plat-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          {label('platform.scanType.loading', '加载任务数据…')}
        </div>
      )}
      {!isLoading && error && (
        <div className="py-20 text-center text-sm" style={{ color: 'var(--st-crit-t)' }}>{error}</div>
      )}

      {stats && (
        <>
          {/* 指标行 */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
            <KpiCard
              icon={<Icon />}
              label={label('platform.scanType.kpiTotal', '累计任务')}
              value={stats.total}
              unit={label('platform.scanType.unitRuns', '次')}
              delta={label('platform.scanType.kpiRunning', '{{count}} 个运行中', { count: stats.running })}
              deltaTone={stats.running > 0 ? 'up-good' : 'flat'}
              spark={stats.trend.map(p => p.count)}
            />
            <KpiCard
              icon={<AlertTriangle />}
              label={label('platform.scanType.kpiAvgScore', '平均评分')}
              value={stats.avgScore ?? '—'}
              unit={stats.avgScore != null ? '/100' : ''}
              delta={stats.latestScore != null ? label('platform.scanType.kpiLatest', '最近 {{score}} 分', { score: stats.latestScore }) : undefined}
              deltaTone="flat"
              range={label('platform.scanType.kpiScoreHint', '已完成任务的评分均值')}
              sparkColor="var(--series-2)"
            />
            <KpiCard
              icon={<FileBarChart2 />}
              label={label('platform.scanType.kpiRisks', '风险发现')}
              value={stats.riskTotal}
              unit={label('platform.scanType.unitFindings', '项')}
              delta={undefined}
              deltaTone={stats.riskTotal > 0 ? 'down-bad' : 'up-good'}
              range={label('platform.scanType.kpiRiskHint', '已完成任务的风险发现总数')}
              sparkColor="var(--series-5)"
            />
            <KpiCard
              icon={<ShieldCheck />}
              label={label('platform.scanType.kpiDone', '已完成')}
              value={stats.done}
              unit={label('platform.scanType.unitRuns', '次')}
              delta={stats.error > 0 ? label('platform.scanType.kpiErrors', '{{count}} 次失败', { count: stats.error }) : undefined}
              deltaTone={stats.error > 0 ? 'down-bad' : 'flat'}
              range={label('platform.scanType.kpiDoneHint', '含历史累计')}
              sparkColor="var(--series-3)"
            />
          </div>

          {/* 状态筛选 + 搜索 */}
          <FilterRow>
            <FilterChips
              items={STATUS_FILTERS.map(f => ({ key: f.key, label: label(`platform.taskCenter.f${f.key.charAt(0).toUpperCase() + f.key.slice(1)}`, f.fallback) + (f.key !== 'all' ? ` ${statusCounts[f.key as keyof typeof statusCounts]}` : ''), }))}
              activeKey={statusDraft}
              onChange={key => setStatusDraft(key)}
            />
            <div className="ml-auto flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5" style={{ borderColor: 'var(--outline)' }}>
              <input
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                placeholder={label('platform.reports.searchPlaceholder', '搜索任务名 / sessionId…')}
                className="bg-transparent outline-none text-[12.5px] text-plat-ink w-52 placeholder:text-plat-muted"
              />
            </div>
          </FilterRow>

          {/* 任务列表 */}
          <div
            className="bg-card border rounded-plat shadow-plat-card overflow-hidden"
            style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
          >
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={r => r.sessionId}
              onRowClick={r => navigate(`/report/${r.sessionId}`)}
              empty={label('platform.scanType.empty', '该能力暂无任务 — 点击右上角「新建扫描」发起')}
            />
            <div className="flex items-center px-5 py-3 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
              <span className="text-[11.5px] text-plat-muted">
                {label('platform.scanType.total', '共 {{count}} 个任务').replace('{{count}}', String(rows.length))}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/scan?type=${meta.taskType}`)}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
                style={{ color: 'var(--brand-deep)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {label('platform.scanType.newScan', '新建此类扫描')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
