import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/platform/primitives';
import AgentManagementDialog from '../components/management/AgentManagementDialog';

/**
 * Agent 节点页 — 系统中的 agent 配置即执行节点。
 * AgentManagementDialog 自包含（自带列表/新建/编辑/连通性测试/导入），
 * 页面仅提供平台壳内的承载与页头。
 */
export default function AgentsPage() {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  return (
    <div>
      <PageHeader
        title={label('platform.nav.agents', '节点与 Agent')}
        titleLight="Agents & Nodes"
        subtitle={label(
          'platform.agents.pageSub',
          'Agent 扫描配置即执行节点 — 管理被测 Agent 的连接与凭据，支持连通性测试'
        )}
      />
      <div
        className="bg-card border rounded-plat shadow-plat-card overflow-hidden"
        style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
      >
        <AgentManagementDialog />
      </div>
    </div>
  );
}
