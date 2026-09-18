import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard, TaskStatusBadge } from '../primitives';
import { useApp } from '../../../context/AppContext';

/** 实时任务进度（0-100；无 plan 时按 step 计数推导） */
function taskProgress(task: any): number | undefined {
  if (!task?.plan || task.plan.length === 0) return undefined;
  const done = task.plan.filter((s: any) => s.status === 'done').length;
  return Math.round((done / task.plan.length) * 100);
}

/** 实时任务流 — 接真实 AppContext.tasks（非 mock） */
export function LiveTasksCard({ onOpenTaskCenter }: { onOpenTaskCenter?: () => void }) {
  const { t, ready } = useTranslation();
  const { state } = useApp();

  const running = state.tasks.filter(task => task.status === 'running');
  const completed = state.tasks
    .filter(task => task.status === 'completed')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 2);

  return (
    <SectionCard
      title={ready ? t('platform.dashboard.liveTitle', '实时任务流') : '实时任务流'}
      subtitle={ready ? t('platform.dashboard.liveSub', 'SSE · Agent 节点执行') : 'SSE · Agent 节点执行'}
      action={
        <span className="inline-flex items-center gap-1.5 text-xs text-plat-ink-2">
          <i
            className="w-2 h-2 rounded-full inline-block"
            style={{
              background: running.length > 0 ? 'var(--st-good)' : '#C3C6D4',
              boxShadow: running.length > 0 ? '0 0 0 3px rgba(12,163,12,.15)' : 'none',
            }}
          />
          {ready
            ? t('platform.dashboard.liveCount', '{{count}} 运行', { count: running.length })
            : `${running.length} 运行`}
        </span>
      }
    >
      <div className="mt-2.5 flex flex-col gap-3">
        {running.length === 0 && completed.length === 0 && (
          <div className="text-[13px] text-plat-muted py-6 text-center">
            {ready ? t('platform.dashboard.liveEmpty', '暂无任务 — 通过「新建扫描」或 AI 助手发起') : '暂无任务'}
          </div>
        )}
        {running.map(task => (
          <div key={task.id} className="flex gap-2.5">
            <span className="shrink-0 h-fit"><TaskStatusBadge status="doing" progress={taskProgress(task)} /></span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-plat-ink truncate">{task.title || task.id}</div>
              <div className="text-[11.5px] text-plat-muted truncate">{task.type}</div>
              <div className="mt-1.5 h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--surface-mid)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${taskProgress(task) ?? 5}%`, background: 'var(--brand)' }}
                />
              </div>
            </div>
          </div>
        ))}
        {completed.map(task => (
          <div key={task.id} className="flex gap-2.5 opacity-75">
            <span className="shrink-0 h-fit"><TaskStatusBadge status="done" /></span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-plat-ink truncate">{task.title || task.id}</div>
              <div className="text-[11.5px] text-plat-muted truncate">{task.type}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3.5 pt-2.5 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
        <button
          type="button"
          onClick={onOpenTaskCenter}
          className="text-xs font-semibold cursor-pointer"
          style={{ color: 'var(--brand-deep)' }}
        >
          {ready ? t('platform.dashboard.goTaskCenter', '进入任务中心 →') : '进入任务中心 →'}
        </button>
      </div>
    </SectionCard>
  );
}
