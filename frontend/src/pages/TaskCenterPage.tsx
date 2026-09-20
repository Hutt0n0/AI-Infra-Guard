import * as React from 'react';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Trash2, Download } from 'lucide-react';
import { PageHeader, FilterChips, FilterRow, FilterSeparator } from '../components/platform/primitives';
import { TaskTable } from '../components/platform/task/TaskTable';
import type { TaskTableRow, TaskStatusFilter } from '../components/platform/task/TaskTable';
import { useApp } from '../context/AppContext';
import { deleteTaskRequest, fetchTaskSummaries } from '../lib/taskApi';
import type { TaskSummary } from '../lib/taskApi';
import { tasksToCsv, downloadCsv } from '../lib/taskCsv';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';

const STATUS_FILTERS: { key: TaskStatusFilter; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'platform.taskCenter.fAll', fallback: '全部' },
  { key: 'doing', labelKey: 'platform.taskCenter.fDoing', fallback: '运行中' },
  { key: 'done', labelKey: 'platform.taskCenter.fDone', fallback: '已完成' },
  { key: 'error', labelKey: 'platform.taskCenter.fError', fallback: '失败' },
  { key: 'terminated', labelKey: 'platform.taskCenter.fTerminated', fallback: '已终止' },
];

const TYPE_FILTERS = [
  'AI-Infra-Scan', 'Mcp-Scan', 'Skill-Scan', 'Model-Redteam-Report', 'Agent-Scan',
];

const PAGE_SIZE = 20;

/** 任务中心 — 状态/类型筛选 + 客户端分页 + ?sessionId= 直达详情 */
export default function TaskCenterPage() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = (searchParams.get('status') as TaskStatusFilter) || 'all';
  const typeFilter = searchParams.get('type') || 'all';
  const selectedSessionId = searchParams.get('sessionId');

  // 旧深链兼容：/tasks?sessionId=xxx（通知铃/命令面板/助手等入口与历史链接）
  // 直接重定向到统一详情页 /task/:sessionId —— 详情只在统一详情页呈现，
  // 不在任务中心内再维护第二套详情视图。
  if (selectedSessionId) {
    return <Navigate to={`/task/${selectedSessionId}`} replace />;
  }

  const [statusDraft, setStatusDraft] = React.useState<TaskStatusFilter>(statusFilter);
  const [typeDraft, setTypeDraft] = React.useState<string>(typeFilter);
  const [searchDraft, setSearchDraft] = React.useState('');
  const [searchApplied, setSearchApplied] = React.useState(''); // 300ms debounce 后生效的服务端搜索词
  const [searchHits, setSearchHits] = React.useState<TaskSummary[] | null>(null); // 服务端 q 搜索结果
  const [serverSummaries, setServerSummaries] = React.useState<TaskSummary[]>([]); // 全量列表（含阶段 9 扩展字段）
  const [page, setPage] = React.useState(0);
  const [deleteTarget, setDeleteTarget] = React.useState<TaskTableRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setStatusDraft(statusFilter);
    setTypeDraft(typeFilter);
  }, [statusFilter, typeFilter]);

  // 搜索防抖 → 服务端 q 参数（后端 HandleGetTaskList 支持 ?q= 检索 title/content/taskType）
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchApplied(searchDraft.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  React.useEffect(() => {
    let cancelled = false;
    if (!searchApplied) {
      setSearchHits(null);
      return;
    }
    fetchTaskSummaries({ q: searchApplied })
      .then(summaries => { if (!cancelled) setSearchHits(summaries); })
      .catch(() => { if (!cancelled) setSearchHits(null); });
    return () => { cancelled = true; };
  }, [searchApplied]);

  const label = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    (ready ? t(key, fallback, opts) : fallback);

  // 后端扩展字段（阶段 9 buildTaskSummary/enrichTaskSummary）：riskCount/score/assignedAgent/progress
  // AppContext.tasks 由旧映射构建不含这些字段，直接消费 fetchTaskSummaries 的原始返回。
  const summariesById = React.useMemo(() => {
    const map = new Map<string, TaskSummary>();
    for (const s of serverSummaries) map.set(s.sessionId, s);
    return map;
  }, [serverSummaries]);

  // 全量 summaries 轮询（10s 独立于 AppContext 5s 轮询；轻量、带新字段）
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = () => fetchTaskSummaries()
      .then(summaries => { if (!cancelled) setServerSummaries(summaries); })
      .catch(() => { /* 静默——AppContext 列表仍是底座 */ });
    load();
    timer = setInterval(load, 10000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, []);

  // 数据源：AppContext.tasks（5 秒轮询驱动）。状态/类型前端 filter（后端无对应参数）；
  // 搜索走服务端 ?q=（fetchTaskSummaries 透传），结果按 sessionId 并入全量列表保证字段一致。
  const rows: TaskTableRow[] = React.useMemo(() => {
    const hitIds = searchHits ? new Set(searchHits.map(s => s.sessionId)) : null;
    return state.tasks
      .filter(task => {
        if (statusDraft !== 'all' && mapAppStatus(task.status) !== statusDraft) return false;
        if (typeDraft !== 'all' && task.type !== typeDraft) return false;
        if (hitIds && !hitIds.has(task.id)) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(task => {
        // 行内进度：优先后端 enrichTaskSummary 的 progress（plan 完成比）；
        // 后端未重编/无数据时回退 AppContext plan 推导（助手活跃会话由 SSE 实时更新）
        const summary = summariesById.get(task.id);
        let progress: number | undefined = (summary?.progress as number | null | undefined) ?? undefined;
        if (progress == null && task.plan?.length) {
          progress = Math.round((task.plan.filter(s => s.status === 'done').length / task.plan.length) * 100);
        }
        return {
          sessionId: task.id,
          title: task.title,
          taskType: task.type,
          status: mapAppStatus(task.status),
          createdAt: task.createdAt.getTime(),
          updatedAt: task.updatedAt.getTime(),
          progress,
          riskCount: (summary?.riskCount as number | null | undefined) ?? undefined,
          score: (summary?.score as number | null | undefined) ?? undefined,
          agentNode: (summary?.assignedAgent as string | null | undefined) ?? undefined,
        };
      });
  }, [state.tasks, statusDraft, typeDraft, searchHits, summariesById]);

  const pagedRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // 筛选变化时回到第一页
  React.useEffect(() => { setPage(0); }, [statusDraft, typeDraft, searchApplied]);

  const applyFilters = (status: TaskStatusFilter, type: string) => {
    const next = new URLSearchParams(searchParams);
    if (status === 'all') next.delete('status'); else next.set('status', status);
    if (type === 'all') next.delete('type'); else next.set('type', type);
    next.delete('sessionId');
    setSearchParams(next);
  };

  const selectSession = (sessionId: string | null) => {
    // 点击任务 → 直接跳转统一详情页（/task/:sessionId 四 Tab 视图），
    // 不再使用本页右侧栏详情（此前与统一详情页功能重复，已移除）。
    if (sessionId) navigate(`/task/${sessionId}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteTaskRequest(deleteTarget.sessionId);
      if (result.status === 0) {
        actions.deleteTask(deleteTarget.sessionId);
        toast.success(label('platform.taskCenter.deleteSuccess', '任务已删除'));
        setDeleteTarget(null);
      } else {
        toast.error(result.message || label('platform.taskCenter.deleteFailed', '删除失败'));
      }
    } catch {
      toast.error(label('platform.taskCenter.deleteFailed', '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  // 导出 CSV — 当前筛选结果（rows），Blob 下载
  const handleExportCsv = () => {
    if (rows.length === 0) {
      toast.info(label('platform.taskCenter.exportEmpty', '当前筛选无任务可导出'));
      return;
    }
    const stamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    downloadCsv(
      `aig-tasks-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.csv`,
      tasksToCsv(rows),
    );
    toast.success(label('platform.taskCenter.exportSuccess', '已导出 {{count}} 条任务', { count: rows.length }));
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader
          title={label('platform.nav.tasks', '任务中心')}
          subtitle={label('platform.taskCenter.pageSub', '统一管理五类检测任务 · 实时进度')}
          actions={
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
                style={{ borderColor: 'var(--outline)' }}
              >
                <Download className="w-[15px] h-[15px]" />
                {label('platform.taskCenter.exportCsv', '导出 CSV')}
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('platform:openAssistant'))}
                className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
                style={{ borderColor: 'var(--outline)' }}
              >
                {label('platform.taskCenter.newViaAssistant', 'AI 助手发起')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/scan')}
                className="inline-flex items-center gap-[7px] rounded-[11px] px-[15px] py-2 text-[13px] font-semibold text-white cursor-pointer hover:opacity-90"
                style={{ background: 'var(--brand)', boxShadow: '0 6px 16px rgba(93,95,239,.32)' }}
              >
                <Plus className="w-[15px] h-[15px]" />
                {label('platform.taskCenter.newTask', '新建任务')}
              </button>
            </>
          }
        />

        {/* 筛选行 */}
        <FilterRow>
          <FilterChips
            items={STATUS_FILTERS.map(f => ({
              key: f.key,
              label: label(f.labelKey, f.fallback),
              count: f.key === 'all' ? rows.length : rows.filter(r => r.status === f.key).length,
            }))}
            activeKey={statusDraft}
            onChange={key => { setStatusDraft(key as TaskStatusFilter); applyFilters(key as TaskStatusFilter, typeDraft); }}
          />
          <FilterSeparator />
          <FilterChips
            size="sm"
            items={[{ key: 'all', label: label('platform.taskCenter.typeAll', '全部类型') }, ...TYPE_FILTERS.map(tp => ({ key: tp, label: tp }))]}
            activeKey={typeDraft}
            onChange={key => { setTypeDraft(key); applyFilters(statusDraft, key); }}
          />
          <div className="ml-auto flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5" style={{ borderColor: 'var(--outline)' }}>
            <Search className="w-3.5 h-3.5 text-plat-muted" />
            <input
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              placeholder={label('platform.taskCenter.searchPlaceholder', '搜索任务名 / sessionId…')}
              className="bg-transparent outline-none text-[12.5px] text-plat-ink w-56 placeholder:text-plat-muted"
            />
          </div>
        </FilterRow>

        {/* 表格卡片 */}
        <div className="bg-card border rounded-plat shadow-plat-card overflow-hidden" style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}>
          <TaskTable
            rows={pagedRows}
            onRowClick={row => selectSession(row.sessionId)}
            empty={label('platform.taskCenter.empty', '暂无任务')}
          />
          {/* 分页 */}
          <div
            className="flex items-center px-5 py-3 border-t"
            style={{ borderTopColor: 'var(--plat-grid)' }}
          >
            <span className="text-[11.5px] text-plat-muted">
              {label('platform.taskCenter.pageInfo', '第 {{from}}–{{to}} / {{total}} 条')
                .replace('{{from}}', String(rows.length === 0 ? 0 : page * PAGE_SIZE + 1))
                .replace('{{to}}', String(Math.min((page + 1) * PAGE_SIZE, rows.length)))
                .replace('{{total}}', String(rows.length))}
            </span>
            <div className="ml-auto flex gap-1.5">
              <PagerButton disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</PagerButton>
              <span className="px-2 py-1 text-xs text-plat-ink-2">{page + 1} / {totalPages}</span>
              <PagerButton disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</PagerButton>
            </div>
          </div>
        </div>

        {/* 删除确认 */}
        <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{label('platform.taskCenter.deleteTitle', '删除任务')}</DialogTitle>
              <DialogDescription>
                {label('platform.taskCenter.deleteDesc', '确定删除该任务吗？相关数据将一并清除，操作不可恢复。')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {label('common.cancel', '取消')}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="w-4 h-4 mr-1" />
                {label('platform.taskCenter.confirmDelete', '删除')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function PagerButton({ children, disabled, onClick }: {
  children: React.ReactNode; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-w-[26px] h-[26px] px-2 rounded-full border bg-white text-xs text-plat-ink-2 disabled:opacity-40 enabled:hover:bg-plat-surface-low cursor-pointer"
      style={{ borderColor: 'var(--outline)' }}
    >
      {children}
    </button>
  );
}

/** AppContext TaskStatus → 后端筛选 key */
function mapAppStatus(status: string): string {
  switch (status) {
    case 'completed': case 'done': return 'done';
    case 'running': case 'pending': case 'doing': return 'doing';
    case 'error': return 'error';
    case 'terminated': return 'terminated';
    default: return 'doing';
  }
}
