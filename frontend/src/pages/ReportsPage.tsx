import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, FileBarChart2, RefreshCw, Search, ShieldCheck, ChevronRight } from 'lucide-react';
import { PageHeader, FilterChips, FilterRow, DataTable, TaskTypeBadge, TaskStatusBadge } from '../components/platform/primitives';
import type { DataTableColumn } from '../components/platform/primitives';
import { fetchTaskSummaries } from '../lib/taskApi';
import type { TaskSummary } from '../lib/taskApi';

/**
 * 报告中心 — 已完成任务列表 + 报告查看入口。
 * 数据源：GET /app/tasks（服务端 status 过滤，阶段 9）；报告查看跳转 /report/:sessionId
 * （既有分享报告路由，无需重复实现渲染）。
 */
type ReportTypeFilter = 'all' | 'AI-Infra-Scan' | 'Mcp-Scan' | 'Skill-Scan' | 'Model-Redteam-Report' | 'Agent-Scan';

const TYPE_FILTERS: { key: ReportTypeFilter; labelKey?: string; fallback: string }[] = [
  { key: 'all', fallback: '全部类型' },
  { key: 'AI-Infra-Scan', fallback: 'AI-Infra-Scan' },
  { key: 'Mcp-Scan', fallback: 'Mcp-Scan' },
  { key: 'Skill-Scan', fallback: 'Skill-Scan' },
  { key: 'Model-Redteam-Report', fallback: 'Model-Redteam' },
  { key: 'Agent-Scan', fallback: 'Agent-Scan' },
];

export default function ReportsPage() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [summaries, setSummaries] = React.useState<TaskSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeDraft, setTypeDraft] = React.useState<ReportTypeFilter>('all');
  const [searchDraft, setSearchDraft] = React.useState('');

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    // 服务端 status 过滤（阶段 9 HandleGetTaskList：有 status 即走分页搜索分支）
    fetch('/api/v1/app/tasks?status=done&pageSize=999')
      .then(res => res.json())
      .then(data => {
        if (data.status === 0) {
          setSummaries((data.data.tasks ?? []) as TaskSummary[]);
          setIsLoading(false);
        } else {
          setError(data.message || '获取报告列表失败');
          setIsLoading(false);
        }
      })
      .catch(() => { setError('获取报告列表失败'); setIsLoading(false); });
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const rows = React.useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    return summaries
      .filter(s => {
        if (typeDraft !== 'all' && s.taskType !== typeDraft) return false;
        if (q && !(`${s.title}`.toLowerCase().includes(q) || s.sessionId.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [summaries, typeDraft, searchDraft]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const columns: DataTableColumn<TaskSummary>[] = [
    {
      key: 'task',
      header: label('platform.reports.colTask', '任务'),
      width: '34%',
      cell: r => (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-plat-ink truncate">{r.title || r.sessionId}</div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate">{r.sessionId.slice(0, 18)}… · {fmtTime(r.completedAt ?? r.updatedAt)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: label('platform.reports.colType', '类型'),
      cell: r => <TaskTypeBadge type={r.taskType} />,
    },
    {
      key: 'risk',
      header: label('platform.reports.colRisks', '风险'),
      numeric: true,
      cell: r => r.riskCount != null
        ? <span className="font-semibold" style={{ color: r.riskCount > 0 ? 'var(--st-crit-t)' : 'var(--st-good-t)' }}>{r.riskCount}</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'score',
      header: label('platform.reports.colScore', '评分'),
      numeric: true,
      cell: r => r.score != null
        ? <span className="font-semibold" style={{ color: r.score < 60 ? 'var(--st-crit-t)' : r.score < 80 ? 'var(--st-warn-t)' : 'var(--st-good-t)' }}>{r.score}</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'status',
      header: label('platform.reports.colStatus', '状态'),
      cell: r => <TaskStatusBadge status={r.status === 'done' ? 'done' : r.status} />,
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

  return (
    <div>
      <PageHeader
        title={label('platform.nav.reports', '报告中心')}
        titleLight="Reports"
        subtitle={label('platform.reports.pageSub', '已完成任务的评估报告汇总 · 支持按类型检索')}
        actions={
          <>
            {/* 越狱评测分析 — 大模型安全体检任务的评测视图（/jailbreak） */}
            <button
              type="button"
              onClick={() => navigate('/jailbreak')}
              className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
              style={{ borderColor: 'var(--outline)' }}
            >
              <ShieldCheck className="w-[15px] h-[15px]" />
              {label('platform.reports.jailbreakAnalysis', '越狱评测分析')}
              <ChevronRight className="w-3.5 h-3.5 text-plat-muted" />
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
              style={{ borderColor: 'var(--outline)' }}
            >
              {isLoading ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              {label('platform.reports.refresh', '刷新')}
            </button>
          </>
        }
      />

      <FilterRow>
        <FilterChips
          items={TYPE_FILTERS.map(f => ({ key: f.key, label: f.key === 'all' ? label('platform.taskCenter.typeAll', f.fallback) : f.fallback }))}
          activeKey={typeDraft}
          onChange={key => setTypeDraft(key as ReportTypeFilter)}
        />
        <div className="ml-auto flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5" style={{ borderColor: 'var(--outline)' }}>
          <Search className="w-3.5 h-3.5 text-plat-muted" />
          <input
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            placeholder={label('platform.reports.searchPlaceholder', '搜索任务名 / sessionId…')}
            className="bg-transparent outline-none text-[12.5px] text-plat-ink w-56 placeholder:text-plat-muted"
          />
        </div>
      </FilterRow>

      <div
        className="bg-card border rounded-plat shadow-plat-card overflow-hidden"
        style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-plat-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            {label('platform.reports.loading', '加载报告列表…')}
          </div>
        ) : error ? (
          <div className="py-14 text-center text-sm" style={{ color: 'var(--st-crit-t)' }}>{error}</div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.sessionId}
            onRowClick={r => navigate(`/report/${r.sessionId}`)}
            empty={label('platform.reports.empty', '暂无已完成任务的报告')}
          />
        )}
        {!isLoading && !error && (
          <div className="flex items-center px-5 py-3 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
            <span className="text-[11.5px] text-plat-muted">
              {label('platform.reports.total', '共 {{count}} 份报告').replace('{{count}}', String(rows.length))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
