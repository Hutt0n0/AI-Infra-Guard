import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SEVERITY_STYLES, normalizeSeverity, type SeverityLevel } from './tokens';

const FALLBACK: Record<SeverityLevel, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
};

/** 严重度徽章 — 设计稿 .badge.b-crit/.b-high/.b-med/.b-low */
export function SeverityBadge({
  severity,
  className,
  withDot = false,
}: {
  severity: string | undefined | null;
  className?: string;
  withDot?: boolean;
}) {
  const { t, ready } = useTranslation();
  const level = normalizeSeverity(severity);
  const s = SEVERITY_STYLES[level];
  const label = ready ? t(`platform.severity.${level}`, FALLBACK[level]) : FALLBACK[level];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold whitespace-nowrap', className)}
      style={{ background: s.bg, color: s.text }}
    >
      {withDot && <i className="w-[7px] h-[7px] rounded-[2px] inline-block" style={{ background: s.dot }} />}
      {label}
    </span>
  );
}
