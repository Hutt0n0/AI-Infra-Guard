import * as React from 'react';
import { cn } from '@/lib/utils';

/** 迷你走势线 — 设计稿 .spark（纯 SVG，preserveAspectRatio=none） */
export interface SparklineProps {
  points: number[];
  color?: string;
  className?: string;
  /** 末端圆点是否带表面色描边环（设计稿样式） */
  endDot?: boolean;
}

export function Sparkline({ points, color = 'var(--series-1)', className, endDot = true }: SparklineProps) {
  if (!points.length) return null;
  const W = 120;
  const H = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  // 上下各留 3px 余量
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const coords = points.map((p, i) => {
    const x = 2 + i * step * (points.length > 1 ? (W - 4) / W : 0);
    const y = H - 3 - ((p - min) / span) * (H - 6);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1].split(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-[34px] flex-1 min-w-0', className)}
    >
      <path
        d={`M${coords.join(' L')}`}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot && (
        <circle
          cx={Number(last[0])}
          cy={Number(last[1])}
          r="3"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
