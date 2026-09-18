import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard, SeverityBadge } from '../primitives';
import { severityScoreImpact, normalizeSeverity } from '../primitives/tokens';

/** 最新风险发现 — 来自最近完成的扫描 */
export function RecentFindingsCard({
  data,
  onViewAll,
}: {
  data: { id: string; title: string; sub: string; severity: string; impact?: number }[];
  onViewAll?: () => void;
}) {
  const { t, ready } = useTranslation();
  return (
    <SectionCard
      title={ready ? t('platform.dashboard.findingsTitle', '最新风险发现') : '最新风险发现'}
      subtitle={ready ? t('platform.dashboard.findingsSub', '来自最近完成的扫描') : '来自最近完成的扫描'}
      action={
        <button type="button" onClick={onViewAll} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--brand-deep)' }}>
          {ready ? t('platform.dashboard.viewAllFindings', '全部发现 →') : '全部发现 →'}
        </button>
      }
    >
      <table className="w-full mt-2">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-plat-muted pb-1.5 pl-0" style={{ borderBottom: '1px solid var(--plat-grid)' }}>
              {ready ? t('platform.dashboard.findingItem', '风险项') : '风险项'}
            </th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-plat-muted pb-1.5" style={{ borderBottom: '1px solid var(--plat-grid)' }}>
              {ready ? t('platform.dashboard.findingLevel', '级别') : '级别'}
            </th>
            <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-plat-muted pb-1.5" style={{ borderBottom: '1px solid var(--plat-grid)' }}>
              {ready ? t('platform.dashboard.findingImpact', '评分影响') : '评分影响'}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map(f => {
            const impact = f.impact ?? -severityScoreImpact(normalizeSeverity(f.severity));
            return (
              <tr key={f.id} className="border-b last:border-b-0" style={{ borderBottomColor: 'var(--plat-grid)' }}>
                <td className="py-2.5">
                  <div className="text-[12px] font-semibold font-mono text-plat-ink truncate max-w-[220px]">{f.title}</div>
                  <div className="text-[11.5px] text-plat-muted truncate max-w-[220px]">{f.sub}</div>
                </td>
                <td className="py-2.5"><SeverityBadge severity={f.severity} /></td>
                <td className="py-2.5 text-right font-mono font-bold text-[13px]">{impact}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionCard>
  );
}
