import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 平台卡片 — 对齐设计稿 .card.card-pad
 * radius 16px + 发丝边 + 品牌系阴影
 */
export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 卡片标题（card-title） */
  title?: React.ReactNode;
  /** 副标题（card-sub） */
  subtitle?: React.ReactNode;
  /** 右上角操作区（card-link 等） */
  action?: React.ReactNode;
  /** 是否应用默认内边距 card-pad */
  padded?: boolean;
  /** 头部下方是否加分隔（默认 false，与设计稿一致） */
  divided?: boolean;
}

export const SectionCard = React.forwardRef<HTMLDivElement, SectionCardProps>(
  ({ title, subtitle, action, padded = true, divided = false, className, children, ...props }, ref) => {
    const hasHead = title || subtitle || action;
    return (
      <div
        ref={ref}
        className={cn(
          'bg-card border border-plat-outline rounded-plat shadow-plat-card',
          padded && 'p-[18px_20px]',
          className
        )}
        style={{
          borderRadius: 'var(--plat-radius)',
          borderColor: 'var(--outline)',
          boxShadow: 'var(--shadow-card)',
          ...(padded ? { padding: '18px 20px' } : null),
        }}
        {...props}
      >
        {hasHead && (
          <div className={cn('flex items-baseline gap-2.5', divided && 'pb-3 mb-3 border-b', !divided && 'mb-1')}>
            <div className="min-w-0">
              {title && (
                <div className="font-head font-semibold text-[15px] leading-tight text-plat-ink">{title}</div>
              )}
              {subtitle && <div className="text-[11.5px] text-plat-muted mt-0.5">{subtitle}</div>}
            </div>
            {action && <div className="ml-auto shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }
);
SectionCard.displayName = 'SectionCard';
