// Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Requirement: Any integration or derivative work must explicitly attribute
// Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
// documentation or user interface, as detailed in the NOTICE file.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TaskStatusBadge } from './primitives';
import { cn } from '../../lib/utils';

/** 实时任务进度（0-100；无 plan 时 undefined → 渲染不确定脉冲条） */
function taskProgress(task: any): number | undefined {
  if (!task?.plan || task.plan.length === 0) return undefined;
  const done = task.plan.filter((s: any) => s.status === 'done').length;
  return Math.round((done / task.plan.length) * 100);
}

const RECENT_LIMIT = 10;

interface DockTaskSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * dock 任务侧栏：运行中任务置顶（进度条）+ 最近任务，点击切换 chat 上下文。
 * 折叠为 48px 状态点列。数据源 useApp().state.tasks（5s 轮询 + SSE 双通道保活）。
 */
const DockTaskSidebar: React.FC<DockTaskSidebarProps> = ({ collapsed, onToggleCollapsed }) => {
  const { t, ready } = useTranslation();
  const { state, actions } = useApp();
  const [loadingTaskId, setLoadingTaskId] = React.useState<string | null>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const { running, recent } = React.useMemo(() => {
    const byUpdated = (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return {
      running: state.tasks.filter(t => t.status === 'running' || t.status === 'pending').sort(byUpdated),
      recent: state.tasks
        .filter(t => t.status === 'completed' || t.status === 'error' || t.status === 'terminated')
        .sort(byUpdated)
        .slice(0, RECENT_LIMIT),
    };
  }, [state.tasks]);

  const handleSelect = async (taskId: string) => {
    if (taskId === state.currentTaskId || loadingTaskId) return;
    setLoadingTaskId(taskId);
    try {
      await actions.switchTask(taskId);
    } finally {
      setLoadingTaskId(null);
    }
  };

  // ---- 折叠态：状态点列 ----
  if (collapsed) {
    return (
      <div
        className="shrink-0 h-full flex flex-col items-center overflow-y-auto scrollbar-thin border-r py-2 gap-1.5"
        style={{ width: 48, borderColor: 'var(--outline)' }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={label('platform.assistant.sidebarExpand', '展开任务列表')}
          className="p-1.5 rounded-[8px] text-plat-muted hover:text-plat-ink hover:bg-white transition-colors cursor-pointer"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
        {[...running, ...recent].map(task => (
          <button
            key={task.id}
            type="button"
            onClick={() => handleSelect(task.id)}
            title={`${task.title} (${task.status})`}
            className={cn(
              'w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0 cursor-pointer transition-transform hover:scale-105',
              task.id === state.currentTaskId && 'ring-2'
            )}
            style={{
              background:
                task.status === 'running' || task.status === 'pending'
                  ? 'var(--st-good-bg)'
                  : task.status === 'error'
                  ? 'var(--st-crit-bg)'
                  : 'var(--surface-mid)',
              color:
                task.status === 'running' || task.status === 'pending'
                  ? 'var(--st-good-t)'
                  : task.status === 'error'
                  ? 'var(--st-crit-t)'
                  : 'var(--plat-muted)',
              ...(task.id === state.currentTaskId ? { boxShadow: '0 0 0 2px var(--brand)' } : {}),
            }}
          >
            {(task.title || '?').slice(0, 1).toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  // ---- 展开态：完整列表 ----
  const renderRow = (task: any) => {
    const progress = taskProgress(task);
    const isActive = task.id === state.currentTaskId;
    const isRunning = task.status === 'running' || task.status === 'pending';
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => handleSelect(task.id)}
        className={cn(
          'w-full text-left px-2.5 py-2 border-b transition-colors cursor-pointer',
          isActive ? 'bg-white' : 'hover:bg-white/70',
          loadingTaskId === task.id && 'opacity-60'
        )}
        style={{ borderBottomColor: 'var(--plat-grid)' }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-semibold text-plat-ink truncate flex-1" title={task.title}>
            {task.title || task.id}
          </span>
          <TaskStatusBadge status={task.status} progress={isRunning ? progress : undefined} />
        </div>
        {isRunning && (
          <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-mid)' }}>
            {progress === undefined ? (
              <div className="h-full w-1/3 rounded-full animate-pulse" style={{ background: 'var(--brand)' }} />
            ) : (
              <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: 'var(--brand)' }} />
            )}
          </div>
        )}
      </button>
    );
  };

  const isEmpty = running.length === 0 && recent.length === 0;

  return (
    <div
      className="shrink-0 h-full flex flex-col overflow-hidden border-r"
      style={{ width: 220, borderColor: 'var(--outline)' }}
    >
      <div className="px-2.5 pt-2.5 pb-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10.5px] font-semibold text-plat-muted uppercase tracking-[0.1em]">
          {label('platform.assistant.sidebarTitle', '任务列表')}
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={label('platform.assistant.sidebarCollapse', '收起')}
          className="p-1 rounded-[6px] text-plat-muted hover:text-plat-ink hover:bg-white transition-colors cursor-pointer"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {isEmpty && (
          <div className="px-3 py-8 text-center text-[11.5px] text-plat-muted">
            {label('platform.assistant.sidebarEmpty', '暂无任务 — 通过 AI 助手或新建扫描发起')}
          </div>
        )}
        {running.length > 0 && (
          <>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-plat-muted uppercase tracking-wider" style={{ background: 'var(--surface-low)' }}>
              {label('platform.assistant.sidebarRunning', '运行中')} · {running.length}
            </div>
            {running.map(renderRow)}
          </>
        )}
        {recent.length > 0 && (
          <>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-plat-muted uppercase tracking-wider" style={{ background: 'var(--surface-low)' }}>
              {label('platform.assistant.sidebarRecent', '最近任务')}
            </div>
            {recent.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
};

export default DockTaskSidebar;
