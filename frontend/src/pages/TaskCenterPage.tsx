import * as React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Trash2, Download } from 'lucide-react';
import { PageHeader, FilterChips, FilterRow, FilterSeparator } from '../components/platform/primitives';
import { TaskTable } from '../components/platform/task/TaskTable';
import type { TaskTableRow, TaskStatusFilter } from '../components/platform/task/TaskTable';
import { TaskDetailPane } from '../components/platform/task/TaskDetailPane';
import { useApp } from '../context/AppContext';
import { deleteTaskRequest } from '../lib/taskApi';
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

  const [statusDraft, setStatusDraft] = React.useState<TaskStatusFilter>(statusFilter);
  const [typeDraft, setTypeDraft] = React.useState<string>(typeFilter);
  const [searchDraft, setSearchDraft] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [deleteTarget, setDeleteTarget] = React.useState<TaskTableRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setStatusDraft(statusFilter);
    setTypeDraft(typeFilter);
  }, [statusFilter, typeFilter]);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  // 数据源：AppContext.tasks（5 秒轮询驱动）。状态/类型前端 filter，搜索标题/sessionId。
  const rows: TaskTableRow[] = React.useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    return state.tasks
      .filter(task => {
        if (statusDraft !== 'all' && mapAppStatus(task.status) !== statusDraft) return false;
        if (typeDraft !== 'all' && task.type !== typeDraft) return false;
        if (q && !(`${task.title}`.toLowerCase().includes(q) || task.id.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(task => {
        // 行内进度：plan 完成比（与 TaskDetailPane 同口径）；助手活跃会话的 plan 由 SSE 实时更新
        let progress: number | undefined;
        if (task.plan?.length) {
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
        };
      });
  }, [state.tasks, statusDraft, typeDraft, searchDraft]);

  const pagedRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // 筛选变化时回到第一页
  React.useEffect(() => { setPage(0); }, [statusDraft, typeDraft, searchDraft]);

  const applyFilters = (status: TaskStatusFilter, type: string) => {
    const next = new URLSearchParams(searchParams);
    if (status === 'all') next.delete('status'); else next.set('status', status);
    if (type === 'all') next.delete('type'); else next.set('type', type);
    next.delete('sessionId');
    setSearchParams(next);
  };

  const selectSession = (sessionId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (sessionId) next.set('sessionId', sessionId); else next.delete('sessionId');
    setSearchParams(next);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteTaskRequest(deleteTarget.sessionId);
      if (result.status === 0) {
        actions.deleteTask(deleteTarget.sessionId);
        toast.success(label('platform.taskCenter.deleteSuccess', '任务已删除'));
        if (selectedSessionId === deleteTarget.sessionId) selectSession(null);
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
            activeSessionId={selectedSessionId}
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

      {/* 详情右栏（55vw） */}
      {selectedSessionId && (
        <div className="shrink-0 h-full hidden xl:block" style={{ width: 'min(55vw, 900px)' }}>
          <TaskDetailPane
            sessionId={selectedSessionId}
            onClose={() => selectSession(null)}
          />
        </div>
      )}
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
