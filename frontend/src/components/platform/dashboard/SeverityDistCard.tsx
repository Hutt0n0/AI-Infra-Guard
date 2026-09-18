import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '../primitives';
import { SEVERITY_VAR } from '../primitives/tokens';

/** 严重度分布 — 横向条形（有序色带，低→高 变深） */
export function SeverityDistCard({ data }: { data: { level: string; count: number }[] }) {
  const { t, ready } = useTranslation();
  const max = Math.max(...data.map(d => d.count), 1);
  const criticalCount = data.find(d => d.level === 'critical')?.count ?? 0;

  return (
    <SectionCard
      title={ready ? t('platform.dashboard.severityTitle', '严重度分布') : '严重度分布'}
      subtitle={ready ? t('platform.dashboard.severitySub', '存量风险') : '存量风险'}
    >
      <div className="mt-3 flex flex-col gap-3">
        {data.map(d => (
          <div key={d.level} className="flex items-center gap-2.5">
            <span className="w-9 shrink-0 text-xs font-semibold text-plat-ink-2">
              {ready ? t(`platform.severity.${d.level}`, d.level) : d.level}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <div
                className="h-6 rounded-r-[4px]"
                style={{
                  width: `${(d.count / max) * 100}%`,
                  minWidth: 8,
                  background: SEVERITY_VAR[d.level as keyof typeof SEVERITY_VAR] ?? 'var(--sev-1)',
                }}
              />
              <span className="text-xs font-bold text-plat-ink">{d.count}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
        <div className="flex items-baseline gap-2">
          <b className="font-head text-[22px] font-bold" style={{ color: 'var(--st-crit-t)' }}>{criticalCount}</b>
          <span className="text-xs text-plat-muted">
            {ready ? t('platform.dashboard.criticalHint', '项严重风险需 24h 内处置') : '项严重风险需 24h 内处置'}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
