import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, ExternalLink } from 'lucide-react';
import ChatArea from '../ChatArea';
import { TaskDetailPanel } from './TaskDetailPanel';
import { useTaskDetailState } from '../../hooks/useTaskDetailState';
import { cn } from '../../lib/utils';

/**
 * AI 助手常驻入口 — 浮球 + 右侧抽屉（内嵌 ChatArea 对话内核）
 *
 * 保活硬性要求：SSE 连接 / messageQueue / 5 秒轮询都挂在 ChatArea 生命周期上，
 * 抽屉开合只操作 CSS（translate-x / pointer-events-none），禁止条件渲染 ChatArea。
 * 首次打开才挂载（浮球从未点击前不建立任何连接）。
 */
export default function AssistantDock() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [mounted, setMounted] = React.useState(false); // 是否已首次打开
  const [open, setOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [consoleStageFilter, setConsoleStageFilter] = React.useState<string | null>(null);
  // 执行控制台浮层（dev ac3053a6 平台等价：任意任务状态可开）
  const [consoleOpen, setConsoleOpen] = React.useState(false);

  const detailState = useTaskDetailState();
  const { currentTask } = detailState;

  // 打开控制台浮层：清选中步骤，进入控制台视图
  const openConsoleOverlay = () => {
    detailState.handleStepSelect(null);
    setConsoleOpen(true);
  };

  // 任务切换时关闭控制台浮层
  React.useEffect(() => {
    setConsoleOpen(false);
    setConsoleStageFilter(null);
  }, [currentTask?.id]);

  const firstOpen = () => {
    if (!mounted) setMounted(true);
    setOpen(true);
  };

  return (
    <>
      {/* 浮球 */}
      {!open && (
        <button
          type="button"
          onClick={firstOpen}
          className="fixed right-7 bottom-7 z-50 w-[68px] h-[68px] rounded-[24px] grid place-items-center text-white transition-transform hover:-translate-y-[3px] cursor-pointer group"
          style={{
            background: 'linear-gradient(135deg,#5D5FEF,#4343D5)',
            boxShadow: '0 12px 32px rgba(67,67,213,.45)',
          }}
          aria-label={ready ? t('platform.assistant.floatLabel', 'AI 助手') : 'AI 助手'}
        >
          <MessageCircle className="w-[30px] h-[30px]" />
          <span
            className="absolute right-[86px] top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-white px-3 py-[7px] rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ background: 'var(--ink)' }}
          >
            {ready
              ? t('platform.assistant.tooltip', 'AI 安全面试官 — 对话式发起扫描、解读报告、生成整改建议')
              : 'AI 安全面试官'}
          </span>
        </button>
      )}

      {/* 抽屉（mounted 后常驻，仅 CSS 开合） */}
      {mounted && (
        <div
          className={cn(
            'fixed right-0 top-0 z-40 h-screen bg-white border-l flex flex-col transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          )}
          style={{
            width: 'clamp(560px, 44vw, 820px)',
            borderColor: 'var(--outline)',
            boxShadow: '-12px 0 40px rgba(11,28,48,.08)',
          }}
          aria-hidden={!open}
        >
          {/* 抽屉头部 */}
          <div
            className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
            style={{ borderColor: 'var(--outline)' }}
          >
            <div className="font-head font-bold text-[15px] text-plat-ink">
              {ready ? t('platform.assistant.title', 'AI 安全面试官') : 'AI 安全面试官'}
            </div>
            <span className="text-[11.5px] text-plat-muted truncate max-w-[240px]">
              {currentTask ? (currentTask.title || currentTask.id) : ''}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {currentTask && (
                <button
                  type="button"
                  onClick={() => navigate(`/task/${currentTask.id}`)}
                  className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--brand-deep)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {ready ? t('platform.assistant.openInTaskCenter', '在任务中心打开') : '在任务中心打开'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
                style={{ borderColor: 'var(--outline)' }}
                aria-label="close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 抽屉内容：ChatArea + 详情浮层 */}
          <div className="flex-1 min-h-0 relative flex">
            <div className="flex-1 min-w-0">
              <ChatArea
                selectedStep={detailState.selectedStep}
                onStepSelect={detailState.handleStepSelect}
                onMcpResultSelect={detailState.handleMcpResultSelect}
                onToolSelect={detailState.handleToolSelect}
                onOpenConsole={openConsoleOverlay}
                welcomeAnimationCompleted={true}
              />
            </div>

            {/* 详情浮层（抽屉内切换，不跳路由；控制台模式显示执行流/目标通信） */}
            {currentTask && (detailState.selectedStep || consoleOpen) && (
              <div
                className="absolute right-0 top-0 h-full bg-white border-l z-10 flex flex-col"
                style={{ width: 'min(55vw, 900px)', borderColor: 'var(--outline)' }}
              >
                <div
                  className="flex items-center px-4 py-2.5 border-b shrink-0"
                  style={{ borderColor: 'var(--outline)' }}
                >
                  <span className="font-head font-semibold text-[13.5px] text-plat-ink truncate">
                    {currentTask.title || currentTask.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConsoleOpen(false);
                      detailState.handleStepSelect(null);
                    }}
                    className="ml-auto w-8 h-8 rounded-[10px] border grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer shrink-0"
                    style={{ borderColor: 'var(--outline)' }}
                    aria-label="back to chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <TaskDetailPanel
                    task={currentTask}
                    state={detailState}
                    isFullscreen={false}
                    onToggleFullscreen={() => {}}
                    consoleStageFilter={consoleStageFilter}
                    onStageFilterChange={setConsoleStageFilter}
                    consoleOpen={consoleOpen}
                    onConsoleOpenChange={setConsoleOpen}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
