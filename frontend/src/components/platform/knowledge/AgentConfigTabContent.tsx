import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ExternalLink, Bot } from 'lucide-react';
import yaml from 'js-yaml';
import { agentApi } from '../../../lib/agentApi';
import { DataTable } from '../primitives';
import type { DataTableColumn } from '../primitives';

interface AgentConfigRow {
  id: string;
  type: string;
  baseUrl: string;
}

/**
 * 规则库 · Agent 配置 Tab — 只读清单（数据源 /knowledge/agent/names + /:name）。
 * 完整管理（新建/编辑/连通性测试/导入）在「节点与 Agent」页，此处跳转避免双入口漂移。
 */
export default function AgentConfigTabContent() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<AgentConfigRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await agentApi.getAgentNames();
        if (cancelled) return;
        if (res.status === 0) {
          const names: string[] = res.data || [];
          // 并发拉详情解析 type/endpoint 摘要（AgentManagementDialog 同款解析）
          const detail = await Promise.all(names.map(async name => {
            try {
              const dRes = await agentApi.getAgent(name);
              if (dRes.status === 0 && dRes.data) {
                let parsed = yaml.load(dRes.data as unknown as string) as any;
                if (parsed && !Array.isArray(parsed) && parsed.targets && Array.isArray(parsed.targets)) {
                  parsed = parsed.targets;
                }
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const first = parsed[0];
                  const type = first.id || '';
                  const config = first.config || {};
                  const baseUrl =
                    type === 'http' ? config.url || ''
                    : type === 'dify' ? config.apiBaseUrl || ''
                    : type === 'coze' ? config.apiBaseUrl || ''
                    : '';
                  return { id: name, type, baseUrl };
                }
              }
            } catch { /* 单个解析失败降级为仅名称 */ }
            return { id: name, type: '', baseUrl: '' };
          }));
          if (!cancelled) setRows(detail);
        } else if (!cancelled) {
          setRows([]);
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const columns: DataTableColumn<AgentConfigRow>[] = [
    {
      key: 'name',
      header: label('platform.ruleLibrary.agentColName', '配置名'),
      width: '32%',
      cell: r => (
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-plat-muted shrink-0" />
          <span className="font-semibold text-plat-ink truncate">{r.id}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: label('platform.ruleLibrary.agentColType', '协议类型'),
      cell: r => r.type
        ? <span className="inline-flex items-center rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold" style={{ background: 'var(--surface-mid)', color: 'var(--brand-deep)' }}>{r.type}</span>
        : <span className="text-plat-muted">—</span>,
    },
    {
      key: 'endpoint',
      header: label('platform.ruleLibrary.agentColEndpoint', 'Endpoint'),
      cell: r => <span className="font-mono text-[12px] text-plat-ink-2 truncate block max-w-[360px]">{r.baseUrl || '—'}</span>,
    },
  ];

  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-plat-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          {label('platform.ruleLibrary.agentLoading', '加载 Agent 配置…')}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.id}
            empty={label('platform.ruleLibrary.agentEmpty', '暂无 Agent 配置 — 在「节点与 Agent」页新建')}
          />
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
            <span className="text-[11.5px] text-plat-muted">
              {label('platform.ruleLibrary.agentTotal', '共 {{count}} 个配置').replace('{{count}}', String(rows.length))}
            </span>
            <button
              type="button"
              onClick={() => navigate('/agents')}
              className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
              style={{ color: 'var(--brand-deep)' }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {label('platform.ruleLibrary.agentManage', '前往节点与 Agent 管理 →')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
