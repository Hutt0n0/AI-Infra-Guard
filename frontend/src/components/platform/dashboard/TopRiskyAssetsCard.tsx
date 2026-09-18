import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard, SeverityBadge } from '../primitives';

/** 最高风险资产 — SecScore 升序表格 */
export function TopRiskyAssetsCard({
  data,
  onViewAll,
}: {
  data: { name: string; sub: string; severity: string; score: number }[];
  onViewAll?: () => void;
}) {
  const { t, ready } = useTranslation();
  return (
    <SectionCard
      title={ready ? t('platform.dashboard.topAssetsTitle', '最高风险资产') : '最高风险资产'}
      subtitle={ready ? t('platform.dashboard.topAssetsSub', '按 SecScore 升序') : '按 SecScore 升序'}
      action={
        <button type="button" onClick={onViewAll} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--brand-deep)' }}>
          {ready ? t('platform.dashboard.viewAll', '全部 →') : '全部 →'}
        </button>
      }
    >
      <table className="w-full mt-2">
        <tbody>
          {data.map(a => (
            <tr key={a.name} className="border-b last:border-b-0" style={{ borderBottomColor: 'var(--plat-grid)' }}>
              <td className="py-2.5">
                <div className="text-[13px] font-semibold text-plat-ink truncate">{a.name}</div>
                <div className="text-[11.5px] text-plat-muted truncate">{a.sub}</div>
              </td>
              <td className="py-2.5 text-right"><SeverityBadge severity={a.severity} /></td>
              <td className="py-2.5 text-right font-mono font-bold text-[13px] w-10">{a.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
