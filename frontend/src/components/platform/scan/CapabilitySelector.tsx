import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, ShieldCheck, Bot, AlertTriangle, FileSearch, Radar, Store, ExternalLink, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MCPService } from '../../../config/mcpServices';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'AI-Infra-Scan': Bug,
  'Mcp-Scan': ShieldCheck,
  'Skill-Scan': FileSearch,
  'Model-Redteam-Report': AlertTriangle,
  'Agent-Scan': Bot,
};

/** 平台级检测能力（非任务型）：投毒检测 = 平台内页；技能市场 = 外部站点 */
const PLATFORM_CAPABILITIES = [
  {
    id: 'poison-detect',
    icon: Radar,
    name: '大模型API投毒检测',
    desc: '识别中转代理是否被劫持、篡改或投毒',
    to: '/poison-detect',
    external: false,
  },
  {
    id: 'skill-market',
    icon: Store,
    name: 'AI 安全技能市场',
    desc: '一站式获取安全 Skill',
    to: 'https://matrix.tencent.com/skill-market',
    external: true,
  },
] as const;

/** 左列检测能力选择 — 任务型 5 类（useMcpServices 数据，与 AI 助手同源）+ 平台级 2 项 */
export function CapabilitySelector({
  services,
  activeId,
  onSelect,
}: {
  services: MCPService[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="flex flex-col gap-2 shrink-0"
      style={{ width: 220 }}
    >
      <div className="font-head font-semibold text-[15px] text-plat-ink px-1 mb-1">
        检测能力
      </div>

      {/* 任务型能力（可发起扫描任务） */}
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

      {/* 平台级能力（页内工具 / 外部市场） */}
      <div className="px-1 pt-3 mt-1 border-t text-[10.5px] font-semibold text-plat-muted uppercase tracking-wider" style={{ borderColor: 'var(--plat-grid)' }}>
        平台能力
      </div>
      {PLATFORM_CAPABILITIES.map(cap => {
        const Icon = cap.icon;
        return (
          <button
            key={cap.id}
            type="button"
            onClick={() => (cap.external ? window.open(cap.to, '_blank') : navigate(cap.to))}
            className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-[13px] font-medium bg-white text-plat-ink-2 hover:bg-plat-surface-low transition-colors cursor-pointer"
            style={{ borderColor: 'var(--outline)' }}
            title={cap.desc}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-deep)' }} />
            <span className="truncate flex-1">{cap.name}</span>
            {cap.external
              ? <ExternalLink className="w-3.5 h-3.5 shrink-0 text-plat-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-plat-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
        );
      })}

      <div className="mt-auto pt-4 border-t text-[11.5px] text-plat-muted px-1" style={{ borderColor: 'var(--plat-grid)' }}>
        也可以在 AI 助手中用自然语言发起同样的扫描
      </div>
    </div>
  );
}
