import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  /** KPI 标签左侧图标（15px，brand 色描边） */
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  /** 值后的单位（如 /100、项、%） */
  unit?: React.ReactNode;
  /** 同比变化文案（含方向符号） */
  delta?: React.ReactNode;
  /** delta 方向：up-good 绿 / down-bad 红 / up-bad 红 / flat 灰 */
  deltaTone?: 'up-good' | 'down-bad' | 'up-bad' | 'flat';
  /** foot 右侧说明（如 vs 上周期 · SecScore） */
  range?: React.ReactNode;
  /** 底部 sparkline 数据点 */
  spark?: number[];
  sparkColor?: string;
  className?: string;
}

const DELTA_COLOR: Record<NonNullable<KpiCardProps['deltaTone']>, string> = {
  'up-good': '#0C7A0C',
  'down-bad': '#B02A2A',
  'up-bad': '#B02A2A',
  flat: 'var(--plat-muted)',
};

/** KPI 统计卡 — 设计稿 .kpi（label / 大数值 / delta+说明 / sparkline） */
export function KpiCard({
  icon, label, value, unit, delta, deltaTone = 'flat', range, spark, sparkColor, className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden flex flex-col gap-2.5 bg-card border rounded-plat shadow-plat-card p-[18px_20px]',
        className
      )}
      style={{ borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card)', borderRadius: 'var(--plat-radius)' }}
    >
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-plat-ink-2">
        {icon && <span className="[&_svg]:w-[15px] [&_svg]:h-[15px] text-plat-brand">{icon}</span>}
        {label}
      </div>
      <div className="font-head font-bold text-[34px] leading-none tracking-tight text-plat-ink">
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-plat-muted">{unit}</span>}
      </div>
      {(delta || range) && (
        <div className="flex items-center gap-2.5 text-[11px] text-plat-muted">
          {delta && (
            <span className="text-xs font-semibold" style={{ color: DELTA_COLOR[deltaTone] }}>
              {delta}
            </span>
          )}
          {range}
        </div>
      )}
      {spark && spark.length > 0 && (
        <SparklineBlock points={spark} color={sparkColor} />
      )}
    </div>
  );
}

function SparklineBlock({ points, color }: { points: number[]; color?: string }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 120, H = 34;
  const step = points.length > 1 ? (W - 4) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = 2 + i * step;
    const y = H - 3 - ((p - min) / span) * (H - 6);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const [lx, ly] = coords[coords.length - 1].split(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[34px] flex-1 min-w-0">
      <path d={`M${coords.join(' L')}`} fill="none" stroke={color ?? 'var(--series-1)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill={color ?? 'var(--series-1)'} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

// 避免未使用导入告警：Sparkline 独立组件在别处复用
export { Sparkline } from './Sparkline';
