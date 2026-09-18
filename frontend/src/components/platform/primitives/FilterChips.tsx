import * as React from 'react';
import { cn } from '@/lib/utils';

/** 筛选 chip 单项 */
export interface FilterChipItem {
  key: string;
  label: React.ReactNode;
  /** chip 右侧的浅色计数（如「全部 128」的 128） */
  count?: React.ReactNode;
}

export interface FilterChipsProps {
  items: FilterChipItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** 是否允许多选模式（activeKey 为 string[]） */
  className?: string;
  /** 右侧插槽（日期选择等） */
  trailing?: React.ReactNode;
  /** 分隔符前插入独立 chips（如 severity 组）——一期用 groups 替代 */
  size?: 'sm' | 'md';
}

/** 单行筛选 chips（设计稿 .filter-row / .filter-chip） */
export function FilterChips({ items, activeKey, onChange, className, trailing, size = 'md' }: FilterChipsProps) {
  return (
    <div className={cn('flex items-center gap-2.5 flex-wrap', className)}>
      {items.map(item => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors cursor-pointer whitespace-nowrap',
              size === 'md' ? 'px-3.5 py-1.5 text-[12.5px]' : 'px-3 py-1 text-[12px]',
              active
                ? 'text-white font-semibold'
                : 'bg-white text-plat-ink-2 hover:bg-plat-surface-low'
            )}
            style={active
              ? { background: 'var(--brand)', borderColor: 'var(--brand)' }
              : { borderColor: 'var(--outline)' }}
          >
            {item.label}
            {item.count != null && (
              <span className={cn('text-[11px]', active ? 'opacity-70' : 'opacity-60')}>{item.count}</span>
            )}
          </button>
        );
      })}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}

/** 带分隔符的 chip 行（设计稿 .filter-sep） */
export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-2.5 mb-4 flex-wrap', className)}>{children}</div>;
}

export function FilterSeparator() {
  return <div className="w-px h-5 mx-0.5" style={{ background: 'var(--outline)' }} />;
}
