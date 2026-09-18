import * as React from 'react';
import { cn } from '@/lib/utils';

/** 页头 — page-title / page-sub / 右侧操作区 */
export interface PageHeaderProps {
  title: React.ReactNode;
  /** 标题右侧浅色英文（设计稿 crumb .light 风格） */
  titleLight?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, titleLight, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      <div className="flex items-end gap-3">
        <h1 className="font-head font-bold text-2xl tracking-tight text-plat-ink leading-tight">
          {title}
          {titleLight && <span className="ml-2 font-medium text-base text-plat-muted">{titleLight}</span>}
        </h1>
        {actions && <div className="ml-auto flex gap-2.5">{actions}</div>}
      </div>
      {subtitle && <p className="mt-1 text-[13px] text-plat-ink-2">{subtitle}</p>}
    </div>
  );
}
