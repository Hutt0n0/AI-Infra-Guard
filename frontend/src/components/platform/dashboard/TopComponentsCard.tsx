import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '../primitives';

/** 组件识别 Top 8 — 横向条形（单系列单色） */
export function TopComponentsCard({ data }: { data: { name: string; count: number }[] }) {
  const { t, ready } = useTranslation();
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <SectionCard
      title={ready ? t('platform.dashboard.componentsTitle', '组件识别 Top 8') : '组件识别 Top 8'}
      subtitle={ready ? t('platform.dashboard.componentsSub', '指纹命中统计') : '指纹命中统计'}
    >
      <div className="mt-3 flex flex-col gap-[9px]">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-right text-[11px] text-plat-muted truncate">{d.name}</span>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 flex justify-end">
                <div
                  className="h-[14px] rounded-r-[4px]"
                  style={{ width: `${(d.count / max) * 82}%`, minWidth: 8, background: 'var(--series-1)' }}
                />
              </div>
              <span className="text-[11px] font-semibold text-plat-ink w-6">{d.count}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
