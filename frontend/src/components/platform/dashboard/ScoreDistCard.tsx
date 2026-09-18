import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList } from 'recharts';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '../primitives';
import { SCORE_MET_BAND } from '../primitives/tokens';

/** 资产评分分布 — 单蓝有序柱状（分值越低越深） */
export function ScoreDistCard({ data }: { data: { bucket: string; count: number }[] }) {
  const { t, ready } = useTranslation();
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  // 高风险区间 = 0-39 与 40-59 两桶
  const risky = (data[0]?.count ?? 0) + (data[1]?.count ?? 0);
  const riskyPct = ((risky / total) * 100).toFixed(1);

  return (
    <SectionCard
      title={ready ? t('platform.dashboard.scoreDistTitle', '资产评分分布') : '资产评分分布'}
      subtitle={ready ? t('platform.dashboard.scoreDistSub', 'SecScore 区间') : 'SecScore 区间'}
    >
      <div style={{ height: 190, marginTop: 14 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 8 }} barCategoryGap="32%">
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10.5, fill: 'var(--plat-muted)' }}
              stroke="var(--plat-axis)"
              tickLine={false}
            />
            <YAxis hide />
            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 600, fill: 'var(--ink)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <rect key={i} fill={SCORE_MET_BAND[i] ?? SCORE_MET_BAND[SCORE_MET_BAND.length - 1]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 pt-3 border-t flex items-baseline gap-2" style={{ borderTopColor: 'var(--plat-grid)' }}>
        <b className="font-head text-[22px] font-bold text-plat-ink">{riskyPct}%</b>
        <span className="text-xs text-plat-muted">
          {ready ? t('platform.dashboard.riskyHint', '资产处于高风险区间(<60 分)') : '资产处于高风险区间(<60 分)'}
        </span>
      </div>
    </SectionCard>
  );
}
