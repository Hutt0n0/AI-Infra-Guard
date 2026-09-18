import * as React from 'react';
import {
  SectionCard, PageHeader, FilterChips, KpiCard, Sparkline,
  SeverityBadge, TaskStatusBadge, TaskTypeBadge, DataTable,
} from './primitives';
import type { DataTableColumn } from './primitives';

/** 临时组件预览页（阶段 7 删除）— 供 /dev-kit 目检 primitives */
const rows = [
  { name: 'llm-gateway.prod.internal', sub: 'vLLM 0.8.4 · 10.2.11.30', severity: 'CRITICAL', score: 31 },
  { name: 'dify-workspace.corp.cn', sub: 'Dify 1.4.1 · Web', severity: 'HIGH', score: 45 },
  { name: 'agent-factory.internal', sub: 'Agent 工作流 · OWASP Agentic', severity: 'MEDIUM', score: 61 },
  { name: 'comfyui-lab.research', sub: 'ComfyUI · GPU 节点', severity: 'LOW', score: 68 },
];

type Row = (typeof rows)[number];

const columns: DataTableColumn<Row>[] = [
  {
    key: 'name',
    header: '资产',
    cell: r => (
      <div>
        <div className="font-semibold">{r.name}</div>
        <div className="text-[11.5px] text-plat-muted">{r.sub}</div>
      </div>
    ),
  },
  { key: 'sev', header: '级别', cell: r => <SeverityBadge severity={r.severity} withDot /> },
  { key: 'score', header: 'SecScore', numeric: true, cell: r => <span className="font-mono font-bold">{r.score}</span> },
];

const DevKitPage: React.FC = () => {
  const [chip, setChip] = React.useState('all');
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--surface)' }}>
      <div className="max-w-[1200px] mx-auto p-7 space-y-5">
        <PageHeader
          title="平台组件预览"
          titleLight="/dev-kit"
          subtitle="阶段 1 primitives 目检页 — 验收后删除"
        />

        <SectionCard title="FilterChips" subtitle="单行筛选 chips">
          <FilterChips
            items={[
              { key: 'all', label: '全部', count: 128 },
              { key: 'running', label: '运行中', count: 3 },
              { key: 'done', label: '已完成', count: 116 },
              { key: 'failed', label: '失败', count: 5 },
            ]}
            activeKey={chip}
            onChange={setChip}
          />
        </SectionCard>

        <div className="grid grid-cols-4 gap-3.5">
          <KpiCard
            label="综合安全评分"
            value={72}
            unit="/100"
            delta="▲ 4.2"
            deltaTone="up-good"
            range="vs 上周期 · SecScore"
            spark={[22, 25, 20, 23, 16, 19, 12, 14, 8]}
          />
          <KpiCard
            label="待处置风险"
            value={47}
            unit="项"
            delta="▼ 6 新增"
            deltaTone="down-bad"
            range="严重 5 · 高危 16 · 中危 26"
            spark={[18, 22, 15, 20, 14, 18, 11, 16, 12]}
            sparkColor="var(--series-2)"
          />
          <KpiCard label="覆盖 AI 资产" value={128} unit="个" delta="▲ 9 新接入" deltaTone="up-good" range="28 个组件"
            spark={[26, 25, 24, 22, 22, 19, 17, 14, 11]} sparkColor="var(--series-3)" />
          <KpiCard label="越狱攻防通过率" value="17.4" unit="%" delta="▲ 2.1 攻破率" deltaTone="up-bad" range="18 数据集"
            spark={[14, 16, 13, 17, 15, 19, 16, 20, 18]} />
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          <SectionCard title="Badges" subtitle="severity / status / type">
            <div className="flex flex-wrap gap-2 items-center">
              <SeverityBadge severity="CRITICAL" withDot />
              <SeverityBadge severity="HIGH" withDot />
              <SeverityBadge severity="MEDIUM" withDot />
              <SeverityBadge severity="LOW" withDot />
              <SeverityBadge severity="INFO" />
              <SeverityBadge severity="严重" />
              <SeverityBadge severity="unknown-value" />
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <TaskStatusBadge status="doing" progress={62} />
              <TaskStatusBadge status="done" />
              <TaskStatusBadge status="error" />
              <TaskStatusBadge status="terminated" />
              <TaskTypeBadge type="AI-Infra-Scan" />
              <TaskTypeBadge type="Model-Redteam-Report" />
            </div>
          </SectionCard>
          <SectionCard title="Sparkline" subtitle="独立 spark 组件">
            <div className="flex items-center gap-4 h-[50px]">
              <Sparkline points={[5, 8, 6, 10, 7, 12, 9, 14]} />
              <Sparkline points={[14, 10, 12, 8, 11, 6, 9, 5]} color="var(--series-2)" />
              <Sparkline points={[1, 3, 2, 5, 4, 7, 6, 9]} color="var(--series-3)" />
            </div>
          </SectionCard>
          <SectionCard title="SectionCard" subtitle="action 插槽">
            <div className="text-[13px] text-plat-ink-2">
              卡片正文 — radius 16px / 发丝边 / 品牌阴影。头部 slot 已在本卡片演示。
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="DataTable"
          subtitle="表格风格 + 行点击"
          action={<span className="text-xs font-semibold" style={{ color: 'var(--brand-deep)' }}>全部 128 →</span>}
        >
          <DataTable columns={columns} rows={rows} rowKey={r => r.name} onRowClick={() => {}} />
        </SectionCard>
      </div>
    </div>
  );
};

export default DevKitPage;
