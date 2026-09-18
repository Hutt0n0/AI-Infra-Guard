import * as React from 'react';
import { Bug, ShieldCheck, Bot, AlertTriangle, FileSearch } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MCPService } from '../../../config/mcpServices';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'AI-Infra-Scan': Bug,
  'Mcp-Scan': ShieldCheck,
  'Skill-Scan': FileSearch,
  'Model-Redteam-Report': AlertTriangle,
  'Agent-Scan': Bot,
};

/** 左列检测能力选择 — 数据来自 useMcpServices()，与 AI 助手同源 */
export function CapabilitySelector({
  services,
  activeId,
  onSelect,
}: {
  services: MCPService[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 shrink-0"
      style={{ width: 220 }}
    >
      <div className="font-head font-semibold text-[15px] text-plat-ink px-1 mb-1">
        检测能力
      </div>
      {services.map(service => {
        const Icon = ICONS[service.id] ?? Bug;
        const active = service.id === activeId;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.id)}
            className={cn(
              'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-[13px] font-medium transition-colors cursor-pointer',
              active
                ? 'text-white font-semibold border-transparent'
                : 'bg-white text-plat-ink-2 hover:bg-plat-surface-low'
            )}
            style={active ? { background: 'var(--brand)' } : { borderColor: 'var(--outline)' }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{service.name}</span>
          </button>
        );
      })}
      <div className="mt-auto pt-4 border-t text-[11.5px] text-plat-muted px-1" style={{ borderColor: 'var(--plat-grid)' }}>
        也可以在 AI 助手中用自然语言发起同样的扫描
      </div>
    </div>
  );
}
