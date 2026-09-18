import * as React from 'react';
import { cn } from '@/lib/utils';

/** 表格列定义 */
export interface DataTableColumn<T> {
  key: string;
  /** 表头内容 */
  header: React.ReactNode;
  /** 单元格渲染 */
  cell: (row: T) => React.ReactNode;
  /** 数字列右对齐（tabular-nums） */
  numeric?: boolean;
  /** 附加单元格/表头类名 */
  className?: string;
  headerClassName?: string;
  /** 列宽（style.width） */
  width?: number | string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** 行点击（任务详情等） */
  onRowClick?: (row: T) => void;
  /** 行是否高亮（当前选中） */
  rowActive?: (row: T) => boolean;
  empty?: React.ReactNode;
  className?: string;
}

/**
 * 轻量数据表 — 设计稿表格风格（大写小表头/发丝分隔行/数字右对齐）
 * 基于原生 table，不做重抽象
 */
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, rowActive, empty, className,
}: DataTableProps<T>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={cn(
                  'text-left text-[11px] font-semibold uppercase tracking-wide text-plat-muted border-b py-2 px-2.5',
                  col.numeric && 'text-right',
                  i === 0 && 'pl-5',
                  col.headerClassName
                )}
                style={{ borderBottomColor: 'var(--plat-grid)', width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-[13px] text-plat-muted py-10">
                {empty ?? '—'}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const key = rowKey(row);
              const active = rowActive?.(row);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                    active ? 'bg-plat-surface-low' : 'hover:bg-plat-surface-low/60'
                  )}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        'border-b py-2.5 px-2.5 text-[13px] align-middle text-plat-ink',
                        col.numeric && 'text-right tabular-nums',
                        i === 0 && 'pl-5',
                        col.className
                      )}
                      style={{ borderBottomColor: 'var(--plat-grid)' }}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
