import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, FilterChips, FilterRow, SectionCard } from '../components/platform/primitives';
import FingerprintTabContent from '../components/management/FingerprintTabContent';
import VulnerabilityTabContent from '../components/management/VulnerabilityTabContent';
import EvaluationTabContent from '../components/management/EvaluationTabContent';
import MCPTabContent from '../components/management/MCPTabContent';
import { useKnowledgeLibrary, useKnowledgeTotals } from '../hooks/useKnowledgeLibrary';
import type { KnowledgeTab } from '../hooks/useKnowledgeLibrary';

const TABS: { key: KnowledgeTab; labelKey: string; fallback: string }[] = [
  { key: 'vulnerabilities', labelKey: 'platform.ruleLibrary.tabVul', fallback: '漏洞库 CVE' },
  { key: 'fingerprints', labelKey: 'platform.ruleLibrary.tabFp', fallback: '指纹库' },
  { key: 'evaluations', labelKey: 'platform.ruleLibrary.tabEval', fallback: '评测集' },
  { key: 'mcps', labelKey: 'platform.ruleLibrary.tabMcp', fallback: 'MCP 插件' },
];

/** 规则库 — 知识库平台化页面：统计卡 + 4 Tab（复用 management TabContent） */
export default function RuleLibraryPage() {
  const { t, ready } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as KnowledgeTab) || 'vulnerabilities';
  const activeTab: KnowledgeTab = TABS.some(x => x.key === tab) ? tab : 'vulnerabilities';
  const { totals, agentCount } = useKnowledgeTotals();
  const [syncing, setSyncing] = React.useState(false);

  const lib = useKnowledgeLibrary(activeTab);
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const setTab = (key: KnowledgeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next);
  };

  // 同步官方规则 — 复用 /api/v1/system/update-data（SettingsDialog 同款）
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/v1/system/update-data', { method: 'POST' });
      const data = await res.json();
      if (data.status === 0) {
        toast.success(label('platform.ruleLibrary.syncStarted', '规则同步已启动'));
        // 同步为后台任务：延时刷新统计
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(data.message || label('platform.ruleLibrary.syncFailed', '同步失败'));
      }
    } catch {
      toast.error(label('platform.ruleLibrary.syncFailed', '同步失败'));
    } finally {
      setSyncing(false);
    }
  };

  const stats: { key: KnowledgeTab | 'agents'; label: string; value: number | null; unit: string }[] = [
    { key: 'fingerprints', label: label('platform.ruleLibrary.statFp', '指纹规则'), value: totals.fingerprints, unit: 'YAML' },
    { key: 'vulnerabilities', label: label('platform.ruleLibrary.statVul', 'CVE 规则'), value: totals.vulnerabilities, unit: '条' },
    { key: 'evaluations', label: label('platform.ruleLibrary.statEval', '评测数据集'), value: totals.evaluations, unit: 'JSON' },
    { key: 'mcps', label: label('platform.ruleLibrary.statMcp', 'MCP 插件规则'), value: totals.mcps, unit: 'YAML' },
    { key: 'agents', label: label('platform.ruleLibrary.statAgents', 'Agent 配置'), value: agentCount, unit: 'YAML' },
  ];

  return (
    <div>
      <PageHeader
        title={label('platform.nav.knowledge', '规则库')}
        subtitle={label(
          'platform.ruleLibrary.pageSub',
          '指纹 · CVE · 评测集 · MCP 插件 · Agent 配置 — 统一知识库管理，与扫描引擎实时联动'
        )}
        actions={
          <>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer disabled:opacity-60"
              style={{ borderColor: 'var(--outline)' }}
            >
              {syncing ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              {label('platform.ruleLibrary.sync', '同步官方规则')}
            </button>
            <button
              type="button"
              onClick={() => {
                // TabContent 内部自带「新建/上传」入口；滚到列表区提示
                document.querySelector('#rule-list')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-[7px] rounded-[11px] px-[15px] py-2 text-[13px] font-semibold text-white cursor-pointer hover:opacity-90"
              style={{ background: 'var(--brand)', boxShadow: '0 6px 16px rgba(93,95,239,.32)' }}
            >
              <Plus className="w-[15px] h-[15px]" />
              {label('platform.ruleLibrary.newRule', '新建规则')}
            </button>
          </>
        }
      />

      {/* 统计卡 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-4">
        {stats.map(s => (
          <div
            key={s.key}
            className="bg-card border rounded-plat shadow-plat-card p-[18px_20px] flex flex-col gap-1.5"
            style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
          >
            <div className="text-xs font-medium text-plat-ink-2">{s.label}</div>
            <div className="flex items-baseline gap-2">
              <b className="font-head text-[22px] font-bold text-plat-ink">
                {s.value ?? '—'}
              </b>
              <span className="text-xs text-plat-muted">{s.unit}</span>
            </div>
            <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--surface-mid)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: s.value != null && s.value > 0 ? '100%' : '0%',
                  background: 'var(--brand)',
                  maxWidth: s.key === 'vulnerabilities' ? '100%' : '56%',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Tab chips */}
      <FilterRow>
        <FilterChips
          items={TABS.map(x => ({ key: x.key, label: label(x.labelKey, x.fallback) }))}
          activeKey={activeTab}
          onChange={key => setTab(key as KnowledgeTab)}
        />
      </FilterRow>

      {/* Tab 内容（复用 management TabContent，数据层来自 useKnowledgeLibrary） */}
      <div id="rule-list">
        <SectionCard padded={false} className="overflow-hidden">
          <div className="p-[18px_20px]">
            {activeTab === 'fingerprints' && (
              <FingerprintTabContent
                fingerprints={lib.items}
                loading={lib.loading}
                searchTerm={lib.searchTerm}
                setSearchTerm={q => lib.search(q)}
                currentPage={lib.page}
                totalPages={lib.totalPages}
                total={lib.total}
                setCurrentPage={lib.gotoPage}
                fetchFingerprints={(p, size, q) => lib.gotoPage(p ?? 1)}
              />
            )}
            {activeTab === 'vulnerabilities' && (
              <VulnerabilityTabContent
                vulnerabilities={lib.items}
                loading={lib.loading}
                searchTerm={lib.searchTerm}
                setSearchTerm={q => lib.search(q)}
                currentPage={lib.page}
                totalPages={lib.totalPages}
                total={lib.total}
                setCurrentPage={lib.gotoPage}
                fetchVulnerabilities={(p, size, q) => lib.gotoPage(p ?? 1)}
              />
            )}
            {activeTab === 'evaluations' && (
              <EvaluationTabContent
                evaluations={lib.items}
                loading={lib.loading}
                searchTerm={lib.searchTerm}
                setSearchTerm={q => lib.search(q)}
                currentPage={lib.page}
                totalPages={lib.totalPages}
                total={lib.total}
                setCurrentPage={lib.gotoPage}
                fetchEvaluations={(p, size, q) => lib.gotoPage(p ?? 1)}
              />
            )}
            {activeTab === 'mcps' && (
              <MCPTabContent
                mcps={lib.items}
                loading={lib.loading}
                searchTerm={lib.searchTerm}
                setSearchTerm={q => lib.search(q)}
                currentPage={lib.page}
                totalPages={lib.totalPages}
                total={lib.total}
                setCurrentPage={lib.gotoPage}
                fetchMCPs={(p, size, q) => lib.gotoPage(p ?? 1)}
              />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
