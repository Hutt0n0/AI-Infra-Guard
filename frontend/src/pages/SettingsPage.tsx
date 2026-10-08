import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Blocks,
  Database,
  Globe,
  ScrollText,
  RefreshCw,
  KeyRound,
  Users,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import ModelManagementSettings from '../components/management/ModelManagementDialog';
import KnowledgeBaseSettings, { KnowledgeBaseSettingsRef } from '../components/management/KnowledgeBaseDialog';
import AgentManagementDialog from '../components/management/AgentManagementDialog';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Changelog from '../components/Changelog';
import AccountTab from '../components/management/AccountTab';
import UserManagementTab from '../components/management/UserManagementTab';
import { PageHeader } from '../components/platform/primitives';
import { useAuth } from '../context/AuthContext';

// The open-source build always shows the "Update data" button (used to sync the latest community fingerprint/vulnerability databases)
const showUpdateDataButton = true;

export type SettingsTab = 'plugins' | 'models' | 'agents' | 'language' | 'changelog' | 'account' | 'users';

const VALID_TABS: SettingsTab[] = ['account', 'users', 'models', 'agents', 'plugins', 'language', 'changelog'];

/**
 * 设置独立页 — 侧栏「设置」从弹窗升级为 /settings 路由（支持 ?tab= 深链，与规则库同模式）。
 * Tab 内容与 SettingsDialog 完全同源（同一组 management 组件），避免双实现漂移；
 * 弹窗入口保留（CommandSearch 等旧路径）。
 */
export default function SettingsPage() {
  const { t, ready } = useTranslation();
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [updating, setUpdating] = React.useState(false);
  const [changelogVersion, setChangelogVersion] = React.useState('');
  const knowledgeBaseRef = React.useRef<KnowledgeBaseSettingsRef>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  // ?tab= 深链 — 非法值归位 account
  const tabParam = searchParams.get('tab') as SettingsTab | null;
  const activeTab: SettingsTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'account';
  // admin-only tab 对非 admin 归位（深链防越权展示；组件内部另有接口层校验）
  const effectiveTab: SettingsTab = activeTab === 'users' && auth.role !== 'admin' ? 'account' : activeTab;

  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams(tab === 'account' ? {} : { tab }, { replace: true });
  };

  const menuItems = [
    { id: 'account' as const, icon: KeyRound, label: label('auth.account', '账号安全') },
    ...(auth.role === 'admin'
      ? [{ id: 'users' as const, icon: Users, label: label('auth.userManagement', '用户管理') }]
      : []),
    { id: 'models' as const, icon: Database, label: label('task.modelConfig', '模型配置') },
    { id: 'agents' as const, icon: Bot, label: label('task.agentConfig', 'Agent 配置') },
    { id: 'plugins' as const, icon: Blocks, label: label('task.pluginManagement', '插件管理') },
    { id: 'language' as const, icon: Globe, label: label('language.switch', 'Language') },
    { id: 'changelog' as const, icon: ScrollText, label: label('common.changelog', '更新日志') },
  ];

  // Update data: POST triggers async sync → poll GET for the final result, then refresh knowledge bases on success
  const handleUpdateData = async () => {
    if (updating) return;
    setUpdating(true);

    const POLL_INTERVAL = 2000;
    const POLL_TIMEOUT = 5 * 60 * 1000;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      const triggerResp = await fetch('/api/v1/system/update-data', { method: 'POST' });
      const triggerData = await triggerResp.json();
      if (triggerData.status !== 0) {
        toast.error(label('knowledgeBase.updateDataFailed', '同步失败'), {
          description: triggerData.message || label('knowledgeBase.updateDataFailed', '同步失败'),
        });
        return;
      }

      const startTs = Date.now();
      let finalData: any = triggerData.data;
      let finalStatus = triggerData.status;
      let finalMessage = triggerData.message;

      while (finalData?.running) {
        if (Date.now() - startTs > POLL_TIMEOUT) {
          toast.error(label('knowledgeBase.updateDataFailed', '同步失败'), {
            description: label('knowledgeBase.updateDataTimeout', '同步超时'),
          });
          return;
        }
        await sleep(POLL_INTERVAL);
        const pollResp = await fetch('/api/v1/system/update-data');
        const pollData = await pollResp.json();
        finalStatus = pollData.status;
        finalMessage = pollData.message;
        finalData = pollData.data;
      }

      const success = finalStatus === 0 && finalData?.success !== false;
      if (success) {
        const filesUpdated = finalData?.files_updated ?? 0;
        if (filesUpdated === 0) {
          toast.success(label('knowledgeBase.updateDataSuccess', '同步成功'), {
            description: label('knowledgeBase.dataAlreadyUpToDate', '数据已是最新'),
          });
        } else {
          toast.success(label('knowledgeBase.updateDataSuccess', '同步成功'), {
            description: ready
              ? t('knowledgeBase.filesUpdatedCount', { count: filesUpdated })
              : `${filesUpdated} record(s) updated`,
          });
        }
        knowledgeBaseRef.current?.refreshAll();
      } else {
        toast.error(label('knowledgeBase.updateDataFailed', '同步失败'), {
          description: finalData?.message || finalMessage || label('knowledgeBase.updateDataFailed', '同步失败'),
        });
      }
    } catch {
      toast.error(label('knowledgeBase.updateDataFailed', '同步失败'), {
        description: label('knowledgeBase.updateDataFailed', '同步失败'),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={label('platform.nav.settings', '设置')}
        titleLight="Settings"
        subtitle={label('platform.settings.pageSub', '账号安全、用户管理、模型与 Agent 配置、语言与更新日志')}
      />

      <div className="flex gap-5 items-start">
        {/* 左侧页内二级导航 — 与 SideNav 同款视觉 */}
        <div
          className="w-[200px] shrink-0 bg-card border rounded-plat shadow-plat-card p-2"
          style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
        >
          {menuItems.map(item => {
            const Icon = item.icon;
            const active = effectiveTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium transition-colors mb-0.5 cursor-pointer ${
                  active ? 'text-white shadow-[0_6px_16px_rgba(93,95,239,.32)]' : 'text-plat-ink-2 hover:bg-plat-surface-low'
                }`}
                style={active ? { background: 'var(--brand)' } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 右侧内容区 */}
        <div
          className="flex-1 min-w-0 bg-card border rounded-plat shadow-plat-card"
          style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-center gap-3 px-5 h-[57px] border-b" style={{ borderColor: 'var(--outline)' }}>
            <Settings className="w-[18px] h-[18px] text-plat-muted shrink-0" />
            <h2 className="font-semibold text-[15px] text-plat-ink">
              {menuItems.find(i => i.id === effectiveTab)?.label}
            </h2>
            {effectiveTab === 'changelog' && changelogVersion && (
              <span className="text-xs font-normal text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] px-2 py-0.5 rounded-full">
                {changelogVersion}
              </span>
            )}
            {effectiveTab === 'plugins' && showUpdateDataButton && (
              <button
                type="button"
                onClick={handleUpdateData}
                disabled={updating}
                className="ml-auto flex items-center gap-1 text-sm font-normal text-[var(--brand)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
                {updating
                  ? label('knowledgeBase.updatingData', '正在同步…')
                  : label('knowledgeBase.updateData', '同步官方规则')}
              </button>
            )}
          </div>

          <div className="p-5">
            {effectiveTab === 'account' && <AccountTab />}
            {effectiveTab === 'users' && <UserManagementTab />}
            {effectiveTab === 'plugins' && <KnowledgeBaseSettings ref={knowledgeBaseRef} />}
            {effectiveTab === 'models' && <ModelManagementSettings />}
            {effectiveTab === 'agents' && <AgentManagementDialog />}
            {effectiveTab === 'language' && (
              <div className="flex flex-col items-center justify-center py-16">
                <h3 className="text-base font-medium text-plat-ink mb-6">{label('language.select', '选择语言')}</h3>
                <div className="scale-150">
                  <LanguageSwitcher />
                </div>
              </div>
            )}
            {effectiveTab === 'changelog' && (
              <Changelog onVersionLoaded={setChangelogVersion} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
