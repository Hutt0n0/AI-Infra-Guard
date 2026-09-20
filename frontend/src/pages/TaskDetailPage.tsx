/**
 * 任务详情页 — 统一的四 Tab 审计视图（控制台 / 目标通信 / 模型往来 / 报告）。
 * 数据源：useTaskDetail（fetchTaskDetailRaw + assembleTaskFromDetail，与全局状态解耦）。
 * Tab 复用既有实现：ScanProgressConsole（执行流）、TraceStreamView（目标通信）、
 * 5 类 DetailPanel（报告）；模型往来 Tab 从 plan/toolUsed/actionLog 提取 LLM JSON。
 */
import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2, RefreshCw, Terminal, MessagesSquare, Brain, FileBarChart2,
  X, ExternalLink, ArrowLeft, Gauge, Trash2, Link2, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { TaskStatusBadge, TaskTypeBadge } from '../components/platform/primitives';
import ScanProgressConsole, { TraceStreamView, parseLlmTrace } from '../components/detailPanel/ScanProgressConsole';
import { TaskDetailPanel } from '../components/platform/TaskDetailPanel';
import CollapsibleTaskPlan from '../components/CollapsibleTaskPlan';
import { useTaskDetail } from '../hooks/useTaskDetail';
import { useTaskDetailState } from '../hooks/useTaskDetailState';
import { terminateTaskRequest, deleteTaskRequest, openTaskSSE } from '../lib/taskApi';
import type { LlmTrace } from '../components/detailPanel/ScanProgressConsole';
import { cn } from '../lib/utils';
import { ShellModeContext } from '../components/platform/PlatformShell';

type TabKey = 'console' | 'target-comm' | 'model-comm' | 'report';

/** 模型往来 Tab：从 task.plan 的 toolUsed.actionLog 提取全部 LLM 调用 */
function extractLlmCalls(task: NonNullable<ReturnType<typeof useTaskDetail>['task']>): Array<LlmTrace & { key: string; stepTitle: string; time?: Date }> {
  const calls: Array<LlmTrace & { key: string; stepTitle: string; time?: Date }> = [];
  for (const step of task.plan) {
    for (const sub of step.subSteps || []) {
      for (const tool of sub.toolUsed || []) {
        const trace = parseLlmTrace(tool.actionLog || '');
        if (trace) {
          calls.push({
            ...trace,
            key: tool.toolId || tool.id || `${sub.id}-${calls.length}`,
            stepTitle: trace.stage || step.title,
            time: tool.timestamp,
          });
        }
      }
    }
  }
  return calls;
}

/** 模型往来 Tab — LLM 调用按 stage 分组，左侧列表 + 右侧完整 messages 往来 */
function ModelCommView({ task }: { task: NonNullable<ReturnType<typeof useTaskDetail>['task']> }) {
  const { t, ready } = useTranslation();
  const calls = React.useMemo(() => extractLlmCalls(task), [task]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof calls>();
    for (const c of calls) {
      const g = c.stepTitle || c.stage || 'LLM';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return [...map.entries()];
  }, [calls]);

  const selected = calls.find(c => c.key === selectedKey) ?? calls[calls.length - 1] ?? null;

  if (calls.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-[13px] text-plat-muted">
        {label('platform.taskDetail.noModelComm', '该任务没有记录模型调用明细')}
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* 左：调用列表（按 stage 分组） */}
      <div className="w-[42%] max-w-[42%] border-r overflow-y-auto min-h-0 flex flex-col" style={{ borderColor: 'var(--plat-grid)', background: 'var(--surface-low)' }}>
        {groups.map(([group, groupCalls]) => (
          <div key={group}>
            <div className="px-3 py-1.5 text-[10.5px] font-semibold text-plat-muted uppercase tracking-wider sticky top-0 bg-white/90 backdrop-blur border-b" style={{ borderColor: 'var(--plat-grid)' }}>
              {group}
              <span className="ml-1.5 opacity-60">{groupCalls.length}</span>
            </div>
            {groupCalls.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedKey(c.key)}
                className={cn(
                  'w-full text-left px-3 py-2 border-b transition-colors cursor-pointer',
                  selected?.key === c.key ? 'bg-white' : 'hover:bg-white/70'
                )}
                style={{ borderBottomColor: 'var(--plat-grid)' }}
              >
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-deep)' }} />
                  <span className="text-[12px] font-semibold text-plat-ink truncate flex-1">
                    {label('platform.taskDetail.llmCall', 'LLM 调用')} {c.iteration != null ? `#${c.iteration}` : ''}
                  </span>
                  <span className="text-[10px] text-plat-muted font-mono shrink-0">{c.model}</span>
                </div>
                <div className="text-[11px] text-plat-muted line-clamp-2 mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {c.response.slice(0, 120)}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 右：完整往来（messages + response） */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-2.5 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--plat-grid)' }}>
            <span className="font-head font-semibold text-[13px] text-plat-ink">
              {label('platform.taskDetail.llmCall', 'LLM 调用')} {selected.iteration != null ? `#${selected.iteration}` : ''}
            </span>
            <span className="text-[11px] font-mono text-plat-muted">{selected.model}</span>
            <span
              className="text-[11px] rounded-full px-2 py-0.5 font-semibold"
              style={{ background: 'var(--surface-mid)', color: 'var(--brand-deep)' }}
            >
              {selected.stepTitle}
            </span>
            <button
              type="button"
              onClick={() => {
                const text = selected.messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n') + '\n\n[assistant]\n' + selected.response;
                navigator.clipboard?.writeText(text);
                toast.success(label('platform.taskDetail.copied', '已复制往来全文'));
              }}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer text-plat-ink-2 hover:text-plat-ink"
            >
              <Copy className="w-3.5 h-3.5" />
              {label('platform.taskDetail.copyAll', '复制全文')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
            {selected.messages.map((m, i) => (
              <div key={i}>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-plat-muted mb-1">{m.role}</div>
                <pre
                  className="whitespace-pre-wrap text-[12px] leading-relaxed rounded-[10px] p-3 max-h-[280px] overflow-y-auto scrollbar-thin font-mono"
                  style={{
                    background: m.role === 'system' ? 'var(--surface-mid)' : 'var(--surface-low)',
                    color: 'var(--ink)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </pre>
              </div>
            ))}
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-deep)' }}>
                {label('platform.taskDetail.llmResponse', '模型响应（assistant）')}
              </div>
              <pre
                className="whitespace-pre-wrap text-[12px] leading-relaxed rounded-[10px] p-3 max-h-[400px] overflow-y-auto scrollbar-thin font-mono"
                style={{ background: 'var(--brand-fixed)', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}
              >
                {selected.response}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t, ready } = useTranslation();
  // 向平台壳声明：本页为满高布局（内部 Tab 各自滚动，不走外层页面滚动）
  const setFullHeight = React.useContext(ShellModeContext);
  React.useEffect(() => {
    setFullHeight(true);
    return () => setFullHeight(false);
  }, [setFullHeight]);
  const { task, isLoading, error, refresh, silentRefresh } = useTaskDetail(sessionId ?? null);
  const detailState = useTaskDetailState();
  const [tab, setTab] = React.useState<TabKey>('console');
  const [modelSubTab, setModelSubTab] = React.useState<'scan' | 'eval'>('scan');
  const [terminating, setTerminating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [consoleStageFilter, setConsoleStageFilter] = React.useState<string | null>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  // 实时进度：对运行中任务建立 SSE（NewScanPage 表单创建的任务不经过 ChatArea，
  // 此前没有任何通道建立 SSE）。事件不逐条刷新——LLM 驱动的扫描每秒可产生多条
  // 事件，逐条全量 fetch 会把详情页刷成频闪。改为 trailing 节流：
  // 事件只标记"有新内容"，每 2s 最多静默刷新一次（不打 loading 态）；
  // SSE 断开时回退为 3s 轮询，保证刷新页面/分享链接打开同样能看到进度。
  const isRunning = task?.status === 'running';
  const [sseDown, setSseDown] = React.useState(false);
  // trailing 节流：dirty 标记 + 定时器，事件风暴中每 2s 消费一次
  const dirtyRef = React.useRef(false);
  const throttleTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const requestRefresh = React.useCallback(() => {
    dirtyRef.current = true;
    if (throttleTimerRef.current) return; // 已有消费循环在跑
    throttleTimerRef.current = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      silentRefresh();
    }, 2000);
  }, [silentRefresh]);

  // 卸载 / 任务结束后清理节流循环
  React.useEffect(() => {
    if (isRunning) return;
    if (throttleTimerRef.current) {
      clearInterval(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    dirtyRef.current = false;
  }, [isRunning]);
  React.useEffect(() => {
    return () => {
      if (throttleTimerRef.current) clearInterval(throttleTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!sessionId || !isRunning) return;
    setSseDown(false);
    const close = openTaskSSE(sessionId, {
      onEvent: (type) => {
        if (type !== 'connected') requestRefresh();
      },
      onError: () => setSseDown(true),
    });
    return close;
  }, [sessionId, isRunning, requestRefresh]);

  React.useEffect(() => {
    if (!sessionId || !isRunning || !sseDown) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [sessionId, isRunning, sseDown, refresh]);

  const traceCount = task?.traces?.length ?? 0;

  const handleTerminate = async () => {
    if (!task) return;
    setTerminating(true);
    try {
      const result = await terminateTaskRequest(task.id);
      if (result.status === 0) {
        toast.success(label('taskTerminate.terminateSuccess', '任务已终止'));
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

  const handleDelete = async () => {
    if (!task) return;
    if (!window.confirm(label('platform.taskCenter.deleteDesc', '确定删除该任务吗？相关数据将一并清除，操作不可恢复。'))) return;
    setDeleting(true);
    try {
      const result = await deleteTaskRequest(task.id);
      if (result.status === 0) {
        toast.success(label('platform.taskCenter.deleteSuccess', '任务已删除'));
        navigate(-1);
      } else {
        toast.error(result.message || label('platform.taskCenter.deleteFailed', '删除失败'));
      }
    } catch {
      toast.error(label('platform.taskCenter.deleteFailed', '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = () => {
    if (!task) return;
    const shareUrl = `${window.location.origin}/report/${task.id}`;
    navigator.clipboard?.writeText(shareUrl);
    toast.success(label('detailPanel.shareUrlCopied', '分享链接已复制'));
  };

  const tabs: { key: TabKey; icon: React.ElementType; label: string; badge?: number }[] = [
    { key: 'console', icon: Terminal, label: label('platform.taskDetail.tabConsole', '控制台') },
    { key: 'target-comm', icon: MessagesSquare, label: label('platform.taskDetail.tabTargetComm', '受测对象往来通信'), badge: traceCount || undefined },
    { key: 'model-comm', icon: Brain, label: label('platform.taskDetail.tabModelComm', '模型往来通信') },
    { key: 'report', icon: FileBarChart2, label: label('platform.taskDetail.tabReport', '报告') },
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 头部 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--outline)', background: 'rgba(255,255,255,.9)' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer shrink-0"
          style={{ borderColor: 'var(--outline)' }}
          aria-label="back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-head font-bold text-[16px] text-plat-ink truncate">
              {task?.title || sessionId}
            </span>
            {task && (
              <TaskStatusBadge
                status={task.status === 'completed' ? 'done' : task.status === 'running' ? 'doing' : task.status}
                progress={task.plan?.length ? Math.round((task.plan.filter(s => s.status === 'done').length / task.plan.length) * 100) : undefined}
              />
            )}
            {task && <TaskTypeBadge type={task.type} />}
          </div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate mt-0.5">{sessionId}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task?.status === 'running' && (
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
          {task && task.status !== 'running' && (
            <>
              <button
                type="button"
                onClick={handleShare}
                className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
                style={{ borderColor: 'var(--outline)' }}
                aria-label="share"
                title={label('platform.taskDetail.share', '复制分享链接')}
              >
                <Link2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="w-8 h-8 rounded-[10px] border grid place-items-center cursor-pointer disabled:opacity-50"
                style={{ borderColor: '#F3C6C6', color: 'var(--st-crit-t)' }}
                aria-label="delete"
                title={label('platform.taskCenter.deleteTitle', '删除任务')}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={refresh}
            className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
            style={{ borderColor: 'var(--outline)' }}
            aria-label="refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/report/${sessionId}`)}
            className="inline-flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-xs font-semibold cursor-pointer"
            style={{ borderColor: 'var(--outline)', color: 'var(--brand-deep)' }}
            title={label('platform.taskDetail.openReportPage', '打开分享报告页')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {label('platform.taskDetail.reportPage', '报告页')}
          </button>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex items-center gap-1 px-6 border-b shrink-0" style={{ borderColor: 'var(--outline)' }}>
        {tabs.map(item => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer',
                active ? 'font-semibold' : 'text-plat-muted hover:text-plat-ink-2'
              )}
              style={{ borderColor: active ? 'var(--brand)' : 'transparent', color: active ? 'var(--ink)' : undefined }}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {item.badge != null && <span className="text-[10px] font-mono text-plat-muted">{item.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading && (
          <div className="flex-1 grid place-items-center gap-2 text-plat-muted text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            {label('platform.taskCenter.loading', '加载任务详情…')}
          </div>
        )}
        {!isLoading && error && (
          <div className="flex-1 grid place-items-center text-sm" style={{ color: 'var(--st-crit-t)' }}>{error}</div>
        )}
        {!isLoading && !error && task && (
          <>
            {/* Tab 1 控制台 */}
            {tab === 'console' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 执行计划：最高 40%，超出内部滚动，不再把控制台挤出视口 */}
                <div
                  className="px-6 pt-3 pb-2 shrink-0 overflow-y-auto scrollbar-thin"
                  style={{ maxHeight: '40%' }}
                >
                  <div className="text-xs font-semibold text-plat-ink-2 mb-2">{label('platform.taskCenter.executionPlan', '执行计划')}</div>
                  <CollapsibleTaskPlan steps={task.plan} taskTitle={task.title || task.id} />
                </div>
                <div className="flex-1 min-h-0 border-t" style={{ borderColor: 'var(--plat-grid)' }}>
                  <ScanProgressConsole
                    task={task}
                    stageFilter={consoleStageFilter}
                    onStageFilterChange={setConsoleStageFilter}
                  />
                </div>
              </div>
            )}
            {/* Tab 2 受测对象往来通信 */}
            {tab === 'target-comm' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <TraceStreamView traces={task.traces || []} />
              </div>
            )}
            {/* Tab 3 模型往来通信（扫描驱动 LLM / 体检评估模型子 Tab） */}
            {tab === 'model-comm' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {task.type === 'Model-Redteam-Report' && (
                  <div className="px-6 pt-2.5 pb-0 flex items-center gap-1 shrink-0 border-b" style={{ borderColor: 'var(--plat-grid)' }}>
                    <button
                      type="button"
                      onClick={() => setModelSubTab('scan')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px cursor-pointer transition-colors',
                        modelSubTab === 'scan' ? 'font-semibold' : 'text-plat-muted hover:text-plat-ink-2'
                      )}
                      style={{ borderColor: modelSubTab === 'scan' ? 'var(--brand)' : 'transparent', color: modelSubTab === 'scan' ? 'var(--ink)' : undefined }}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      {label('platform.taskDetail.scanModel', '扫描驱动模型')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelSubTab('eval')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px cursor-pointer transition-colors',
                        modelSubTab === 'eval' ? 'font-semibold' : 'text-plat-muted hover:text-plat-ink-2'
                      )}
                      style={{ borderColor: modelSubTab === 'eval' ? 'var(--brand)' : 'transparent', color: modelSubTab === 'eval' ? 'var(--ink)' : undefined }}
                    >
                      <Gauge className="w-3.5 h-3.5" />
                      {label('platform.taskDetail.evalModel', '评估模型')}
                    </button>
                  </div>
                )}
                {modelSubTab === 'scan' || task.type !== 'Model-Redteam-Report' ? (
                  <ModelCommView task={task} />
                ) : (
                  <div className="flex-1 grid place-items-center text-[13px] text-plat-muted px-8 text-center">
                    {label(
                      'platform.taskDetail.evalModelEmpty',
                      '评估模型（评分判定）的调用在当前版本的执行引擎中不单独记录往来流水——其判定结果体现在报告 Tab 的逐项评分与 extraBody.vulnerabilityResults 中。待引擎侧补齐 eval 模型 trace 记录后此处自动展示。'
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Tab 4 报告 */}
            {tab === 'report' && (
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4">
                <TaskDetailPanel
                  task={task}
                  state={{
                    ...detailState,
                    currentTask: task,
                  }}
                  isFullscreen={false}
                  onToggleFullscreen={() => {}}
                  consoleStageFilter={consoleStageFilter}
                  onStageFilterChange={setConsoleStageFilter}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
