import * as React from 'react';
import { SectionCard } from '../primitives';

export interface ScanTemplate {
  id: string;
  name: string;
  taskType: string;
  savedAt: number;
  /** 保存的表单快照（content + selections 的可序列化子集） */
  snapshot: Record<string, unknown>;
}

const STORAGE_KEY = 'aig.scanTemplates';
const MAX_TEMPLATES = 9;

export function loadScanTemplates(): ScanTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TEMPLATES) : [];
  } catch {
    return [];
  }
}

export function saveScanTemplate(tpl: Omit<ScanTemplate, 'id' | 'savedAt'>): ScanTemplate[] {
  const templates = loadScanTemplates();
  const next: ScanTemplate[] = [
    { ...tpl, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() },
    ...templates,
  ].slice(0, MAX_TEMPLATES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* quota — 静默 */ }
  return next;
}

export function removeScanTemplate(id: string): ScanTemplate[] {
  const next = loadScanTemplates().filter(t => t.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* 静默 */ }
  return next;
}

/** 扫描模板卡片（localStorage 持久化，复用历史配置） */
export function ScanTemplates({
  templates,
  onApply,
  onRemove,
}: {
  templates: ScanTemplate[];
  onApply: (tpl: ScanTemplate) => void;
  onRemove: (id: string) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <SectionCard title="扫描模板" subtitle="复用历史配置">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-2.5">
        {templates.map(tpl => (
          <div
            key={tpl.id}
            className="group relative border rounded-xl px-3.5 py-3 cursor-pointer hover:bg-plat-surface-low transition-colors"
            style={{ borderColor: 'var(--outline)' }}
            onClick={() => onApply(tpl)}
          >
            <div className="text-[12.5px] font-semibold text-plat-ink truncate pr-5">{tpl.name}</div>
            <div className="text-[11.5px] text-plat-muted mt-0.5 truncate">{tpl.taskType}</div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onRemove(tpl.id); }}
              className="absolute right-2 top-2 w-5 h-5 grid place-items-center rounded text-plat-muted opacity-0 group-hover:opacity-100 hover:text-plat-ink cursor-pointer"
              aria-label="remove template"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
