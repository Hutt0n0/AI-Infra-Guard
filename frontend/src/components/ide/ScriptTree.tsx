import React from 'react';
import { FileCode2, Plus, Trash2, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { IdeScriptMeta } from '../../lib/ideApi';

export const ScriptTree: React.FC<{
  scripts: IdeScriptMeta[];
  active: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}> = ({ scripts, active, onSelect, onNew, onRename, onDelete }) => {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--outline)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-plat-muted">脚本</span>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-1.5 py-1 hover:bg-plat-surface-low cursor-pointer text-plat-ink-2"
          title="新建脚本"
        >
          <Plus className="w-3.5 h-3.5" /> 新建
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {scripts.length === 0 && (
          <div className="text-xs text-plat-muted text-center py-8">暂无脚本</div>
        )}
        {scripts.map(s => (
          <div
            key={s.name}
            className={cn(
              'group flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 transition-colors',
              s.name === active
                ? 'bg-blue-50/70 border-blue-500'
                : 'border-transparent hover:bg-plat-surface-low'
            )}
            onClick={() => onSelect(s.name)}
          >
            <FileCode2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
            <span className="text-xs font-medium text-plat-ink truncate flex-1">{s.name}</span>
            <span className="text-[10px] text-plat-muted flex-shrink-0 group-hover:hidden">
              {s.size < 1024 ? `${s.size}B` : `${(s.size / 1024).toFixed(1)}K`}
            </span>
            <span className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
              <button
                className="p-0.5 rounded hover:bg-white cursor-pointer text-plat-muted hover:text-plat-ink"
                title="重命名"
                onClick={(e) => { e.stopPropagation(); onRename(s.name); }}
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                className="p-0.5 rounded hover:bg-white cursor-pointer text-plat-muted hover:text-red-600"
                title="删除"
                onClick={(e) => { e.stopPropagation(); onDelete(s.name); }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScriptTree;
