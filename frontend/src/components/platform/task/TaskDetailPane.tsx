import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { TaskStatusBadge, TaskTypeBadge, SeverityBadge } from '../primitives';
import { TaskDetailPanel } from '../TaskDetailPanel';
import CollapsibleTaskPlan from '../../CollapsibleTaskPlan';
import { useTaskDetail } from '../../../hooks/useTaskDetail';
import { useTaskDetailState } from '../../../hooks/useTaskDetailState';
import { useApp } from '../../../context/AppContext';
import { terminateTaskRequest } from '../../../lib/taskApi';
import type { TaskTableRow } from './TaskTable';
import { toast } from 'sonner';

/**
 * 任务详情右栏 — /tasks?sessionId= 驱动；不依赖 currentTaskId、不污染全局。
 * 左列执行计划（CollapsibleTaskPlan）+ 右列 ScanProgressConsole/结果面板。
 * 注意：useTaskDetailState 依赖 AppContext 的 currentTaskId；任务中心的详情
 * 通过把所选任务临时设为 currentTask 的轻量方案不可取，因此这里用独立的
 * 只读详情视图（计划 + 终端流），复杂结果面板在抽屉/报告页可用。
 */
export function TaskDetailPane({
  sessionId,
  onClose,
  onOpenInDrawer,
}: {
  sessionId: string;
  onClose: () => void;
  onOpenInDrawer?: (sessionId: string) => void;
}) {
  const { t, ready } = useTranslation();
  const { task, isLoading, error, refresh } = useTaskDetail(sessionId);
  const [terminating, setTerminating] = React.useState(false);
  const { actions } = useApp();

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const handleTerminate = async () => {
    if (!task) return;
    setTerminating(true);
    try {
      const result = await terminateTaskRequest(task.id);
      if (result.status === 0) {
        toast.success(label('taskTerminate.terminateSuccess', '任务已终止'));
        // 同步全局任务列表状态（轮询会刷新详情）
        actions.loadTasks();
        refresh();
      } else {
        toast.error(result.message || label('taskTerminate.terminateFailed', '终止失败'));
      }
    } catch {
      toast.error(label('taskTerminate.terminateRequestFailed', '终止请求失败'));
    } finally {
      setTerminating(false);
    }
  };

  const isRunning = task?.status === 'running';

  // 进度（plan 完成比）
  const progress = React.useMemo(() => {
    if (!task?.plan?.length) return undefined;
    const done = task.plan.filter(s => s.status === 'done').length;
    return Math.round((done / task.plan.length) * 100);
  }, [task]);

  return (
    <div
      className="h-full flex flex-col bg-white border-l"
      style={{ borderColor: 'var(--outline)' }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--outline)' }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-head font-bold text-[15px] text-plat-ink truncate">
              {task?.title || sessionId}
            </span>
            {task && <TaskStatusBadge status={mapStatusForBadge(task.status)} progress={progress} />}
          </div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate mt-0.5">
            {task ? `${task.type} · ${sessionId}` : sessionId}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={refresh}
            className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
            style={{ borderColor: 'var(--outline)' }}
            aria-label="refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onOpenInDrawer && (
            <button
              type="button"
              onClick={() => onOpenInDrawer(sessionId)}
              className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
              style={{ color: 'var(--brand-deep)' }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {label('platform.taskCenter.openInAssistant', '在助手打开')}
            </button>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={handleTerminate}
              disabled={terminating}
              className="inline-flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
              style={{ borderColor: '#F3C6C6', color: 'var(--st-crit-t)' }}
            >
              {terminating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {label('platform.taskCenter.terminate', '终止任务')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
            style={{ borderColor: 'var(--outline)' }}
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading && (
          <div className="h-full grid place-items-center text-plat-muted text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {label('platform.taskCenter.loading', '加载任务详情…')}
          </div>
        )}
        {!isLoading && error && (
          <div className="h-full grid place-items-center text-sm" style={{ color: 'var(--st-crit-t)' }}>
            {error}
          </div>
        )}
        {!isLoading && !error && task && (
          <div className="h-full grid grid-rows-[auto_1fr] overflow-y-auto scrollbar-thin">
            {/* 执行计划 */}
            <div className="px-5 pt-4 pb-2">
              <div className="text-xs font-semibold text-plat-ink-2 mb-2">
                {label('platform.taskCenter.executionPlan', '执行计划')}
              </div>
              <CollapsibleTaskPlan steps={task.plan} taskTitle={task.title || task.id} />
            </div>
            {/* 终端流 / 结果 */}
            <div className="px-5 pb-5 min-h-0">
              <div className="text-xs font-semibold text-plat-ink-2 mb-2">
                {label('platform.taskCenter.console', '实时输出 · ScanProgressConsole')}
              </div>
              <TaskDetailPanel
                task={task}
                state={{
                  currentTask: task,
                  selectedStep: null,
                  selectedTool: null,
                  mcpResult: undefined,
                  infraScanResult: undefined,
                  redteamReportResult: undefined,
                  jailbreakResult: undefined,
                  agentScanResult: undefined,
                  handleStepSelect: () => {},
                  handleToolSelect: () => {},
                  handleMcpResultSelect: () => {},
                }}
                isFullscreen={false}
                onToggleFullscreen={() => {}}
                consoleStageFilter={null}
                onStageFilterChange={() => {}}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** useTaskDetail 返回状态 → badge 状态 */
function mapStatusForBadge(status: string): string {
  switch (status) {
    case 'completed': return 'done';
    case 'running': return 'doing';
    case 'error': return 'error';
    case 'terminated': return 'terminated';
    default: return 'todo';
  }
}
