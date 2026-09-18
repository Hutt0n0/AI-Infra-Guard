import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '../primitives';
import type { DataTableColumn } from '../primitives';
import { TaskStatusBadge, TaskTypeBadge } from '../primitives';
import type { TaskSummary } from '../../../lib/taskApi';

/** 任务状态 → 平台筛选 key */
export type TaskStatusFilter = 'all' | 'doing' | 'done' | 'error' | 'terminated';

export function statusMatchesFilter(status: string, filter: TaskStatusFilter): boolean {
  if (filter === 'all') return true;
  return status === filter;
}

export interface TaskTableRow {
  sessionId: string;
  title: string;
  taskType: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  /** 目标：后端列表无此字段，一期显示 content 截断（由页面层透传或 '—'） */
  target?: string;
  /** 运行中任务的进度（0-100，plan 完成比；无 plan 数据时不显示） */
  progress?: number;
  /** 阶段 9 后端扩展字段（enrichTaskSummary；取不到为 undefined → '—'） */
  riskCount?: number;
  score?: number;
  agentNode?: string;
}

export function TaskTable({
  rows,
  activeSessionId,
  onRowClick,
  empty,
}: {
  rows: TaskTableRow[];
  activeSessionId?: string | null;
  onRowClick: (row: TaskTableRow) => void;
  empty?: React.ReactNode;
}) {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const columns: DataTableColumn<TaskTableRow>[] = [
    {
      key: 'task',
      header: label('platform.taskCenter.colTask', '任务'),
      width: '28%',
      cell: r => (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-plat-ink truncate">{r.title || r.sessionId}</div>
          <div className="text-[11.5px] text-plat-muted font-mono truncate">
            {r.sessionId.slice(0, 18)}… · {fmtTime(r.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: label('platform.taskCenter.colType', '类型'),
      cell: r => <TaskTypeBadge type={r.taskType} />,
    },
    {
      key: 'target',
      header: label('platform.taskCenter.colTarget', '目标 / 范围'),
      cell: r => <span className="font-mono text-[12px] text-plat-ink-2">{r.target || '—'}</span>,
    },
    {
      key: 'agent',
      header: label('platform.taskCenter.colAgent', 'Agent 节点'),
      cell: r => <span className="font-mono text-[12px] text-plat-ink-2 truncate block max-w-[140px]">{r.agentNode || '—'}</span>,
    },
    {
      key: 'status',
      header: label('platform.taskCenter.colStatus', '状态'),
      cell: r => (
        <TaskStatusBadge
          status={r.status}
          progress={r.status === 'doing' && r.progress != null ? r.progress : undefined}
        />
      ),
    },
    {
      key: 'risks',
      header: label('platform.taskCenter.colRisks', '风险'),
      numeric: true,
      cell: r => r.riskCount != null
        ? <span className="font-semibold" style={{ color: r.riskCount > 0 ? 'var(--st-crit-t)' : 'var(--st-good-t)' }}>{r.riskCount}</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'score',
      header: label('platform.taskCenter.colScore', '评分'),
      numeric: true,
      cell: r => r.score != null
        ? <span className="font-semibold" style={{ color: r.score < 60 ? 'var(--st-crit-t)' : r.score < 80 ? 'var(--st-warn-t)' : 'var(--st-good-t)' }}>{r.score}</span>
        : <span className="text-plat-muted">—</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={r => r.sessionId}
      onRowClick={onRowClick}
      rowActive={r => r.sessionId === activeSessionId}
      empty={empty}
    />
  );
}
