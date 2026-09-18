import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TASK_STATUS_STYLES } from './tokens';

const FALLBACK: Record<string, string> = {
  todo: '待执行',
  doing: '运行',
  done: '完成',
  error: '失败',
  terminated: '已终止',
};

/** 任务状态徽章 — 设计稿 .badge.b-run/.b-good/.b-crit/.b-gray（运行中可带进度） */
export function TaskStatusBadge({
  status,
  progress,
  className,
}: {
  status: string;
  /** 运行中任务的进度（0-100，仅展示用） */
  progress?: number;
  className?: string;
}) {
  const { t, ready } = useTranslation();
  const s = TASK_STATUS_STYLES[status] ?? TASK_STATUS_STYLES.todo;
  const label = ready ? t(`platform.taskStatus.${status}`, FALLBACK[status] ?? status) : (FALLBACK[status] ?? status);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold whitespace-nowrap', className)}
      style={{ background: s.bg, color: s.text }}
    >
      {status === 'doing' && <SpinnerDot />}
      {status === 'done' && <CheckIcon />}
      {label}
      {status === 'doing' && progress != null && <span className="opacity-80">{Math.round(progress)}%</span>}
    </span>
  );
}

function SpinnerDot() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 animate-spin" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 2.4, strokeLinecap: 'round' }}>
      <path d="M21 12a9 9 0 11-6.2-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
