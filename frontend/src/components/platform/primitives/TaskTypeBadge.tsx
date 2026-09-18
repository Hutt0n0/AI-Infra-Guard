import * as React from 'react';
import { cn } from '@/lib/utils';

/** 任务类型徽章 — 设计稿 .badge.b-gray */
export function TaskTypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold whitespace-nowrap', className)}
      style={{ background: '#EFF1F6', color: 'var(--ink-2)' }}
    >
      {type}
    </span>
  );
}
