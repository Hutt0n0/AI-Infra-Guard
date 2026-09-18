import * as React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '../primitives';
import { SERIES_PALETTE } from '../primitives';

/** 风险发现趋势 — 3 系列折线（AI 基础设施 / MCP 服务 / Agent 工作流） */
export function TrendChartCard({ data }: { data: { date: string; infra: number; mcp: number; agent: number }[] }) {
  const { t, ready } = useTranslation();
  const series = [
    { key: 'infra' as const, label: ready ? t('platform.dashboard.seriesInfra', 'AI 基础设施') : 'AI 基础设施' },
    { key: 'mcp' as const, label: ready ? t('platform.dashboard.seriesMcp', 'MCP 服务') : 'MCP 服务' },
    { key: 'agent' as const, label: ready ? t('platform.dashboard.seriesAgent', 'Agent 工作流') : 'Agent 工作流' },
  ];

  return (
    <SectionCard
      title={ready ? t('platform.dashboard.trendTitle', '风险发现趋势') : '风险发现趋势'}
      subtitle={ready ? t('platform.dashboard.trendSub', '按任务类型 · 扫描任务产出') : '按任务类型 · 扫描任务产出'}
      action={<span className="text-[11px] text-plat-muted border rounded-md px-2 py-0.5" style={{ borderColor: 'var(--outline)' }}>
        {ready ? t('platform.dashboard.tableView', '表格视图') : '表格视图'}
      </span>}
    >
      <div className="flex gap-4 items-center flex-wrap mt-2 mb-1">
        {series.map((s, i) => (
          <div key={s.key} className="flex items-center gap-[7px] text-xs text-plat-ink-2">
            <span className="w-3.5 h-[3px] rounded-sm inline-block" style={{ background: SERIES_PALETTE[i] }} />
            {s.label}
          </div>
        ))}
      </div>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 42, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--plat-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10.5, fill: 'var(--plat-muted)' }}
              stroke="var(--plat-axis)"
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: 'var(--plat-muted)' }}
              stroke="transparent"
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: '1px solid var(--outline)',
                boxShadow: 'var(--shadow-card)',
                fontSize: 12,
              }}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={SERIES_PALETTE[i]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                label={i === 0 ? { position: 'right', fontSize: 11, fontWeight: 600, fill: 'var(--ink)' } : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
