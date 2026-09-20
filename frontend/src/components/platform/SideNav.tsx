import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ListChecks, ShieldCheck, FileBarChart2,
  BookOpen, Bot, Settings, Radar, Store, FileSearch, AlertTriangle, Bug, ScrollText,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import SettingsDialog from '../SettingsDialog';

interface NavItemDef {
  key: string;
  /** 路由；null = 非路由入口（设置）；'external:' 前缀 = 外部链接 */
  to: string | null;
  icon: React.ComponentType<{ className?: string }>;
  /** 分组 */
  section: 'monitor' | 'capability' | 'knowledge' | 'system';
  /** 角标来源 */
  badge?: 'runningTasks';
  onClick?: () => void;
}

const SECTIONS: { id: NavItemDef['section']; labelKey: string; fallback: string }[] = [
  { id: 'monitor', labelKey: 'platform.nav.secMonitor', fallback: '监控' },
  { id: 'capability', labelKey: 'platform.nav.secCapability', fallback: '检测能力' },
  { id: 'knowledge', labelKey: 'platform.nav.secKnowledge', fallback: '知识库' },
  { id: 'system', labelKey: 'platform.nav.secSystem', fallback: '系统' },
];

/** 导航元数据表 — 检测能力区 = 5 类扫描能力独立菜单（各含历史任务+指标）
 *  + 平台级能力（投毒检测/技能市场）。新建扫描不占菜单：Topbar 右上角 CTA 触发。 */
const NAV_ITEMS: NavItemDef[] = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard, section: 'monitor' },
  { key: 'tasks', to: '/tasks', icon: ListChecks, section: 'monitor', badge: 'runningTasks' },
  // 5 类扫描能力 — 点击进入该类型的历史任务列表与结果指标
  { key: 'agentScan', to: '/scan/agent', icon: Bot, section: 'capability' },
  { key: 'skillScan', to: '/scan/skill', icon: FileSearch, section: 'capability' },
  { key: 'mcpScan', to: '/scan/mcp', icon: ShieldCheck, section: 'capability' },
  { key: 'modelRedteamReport', to: '/scan/redteam', icon: AlertTriangle, section: 'capability' },
  { key: 'aiInfraScan', to: '/scan/infra', icon: Bug, section: 'capability' },
  // 平台级能力（非任务型）
  { key: 'poisonDetect', to: '/poison-detect', icon: Radar, section: 'capability' },
  { key: 'skillMarket', to: 'external:https://matrix.tencent.com/skill-market', icon: Store, section: 'capability' },
  { key: 'knowledge', to: '/knowledge', icon: BookOpen, section: 'knowledge' },
  { key: 'agents', to: '/agents', icon: Bot, section: 'system' },
  { key: 'logs', to: '/logs', icon: ScrollText, section: 'system' },
  { key: 'settings', to: null, icon: Settings, section: 'system' },
];

export default function SideNav() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const { state } = useApp();
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const runningCount = state.tasks.filter(task => task.status === 'running').length;

  const itemLabel = (key: string): string =>
    ready ? t(`platform.nav.${key}`, '') : '';

  const renderItems = (section: NavItemDef['section']) =>
    NAV_ITEMS.filter(item => item.section === section).map(item => {
      const Icon = item.icon;
      const isActive =
        item.to === '/'
          ? undefined // NavLink 自己判断
          : undefined;
      const content = (
        <>
          <Icon className="w-[17px] h-[17px] shrink-0" />
          <span className="truncate">{itemLabel(item.key)}</span>
          {item.badge === 'runningTasks' && runningCount > 0 && (
            <span
              className="ml-auto text-[10.5px] font-semibold rounded-full px-2 py-px"
              style={{ background: 'var(--surface-mid)', color: 'var(--brand-deep)' }}
            >
              {runningCount}
            </span>
          )}
        </>
      );

      if (item.to === null) {
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => (item.key === 'settings' ? setSettingsOpen(true) : item.onClick?.())}
            className="w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[10px] text-[13.5px] font-medium text-plat-ink-2 hover:bg-plat-surface-low transition-colors cursor-pointer mb-0.5"
          >
            {content}
          </button>
        );
      }

      // 外部链接（external: 前缀）— 新窗口打开
      if (item.to.startsWith('external:')) {
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => window.open(item.to.slice('external:'.length), '_blank')}
            className="w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[10px] text-[13.5px] font-medium text-plat-ink-2 hover:bg-plat-surface-low transition-colors cursor-pointer mb-0.5"
          >
            {content}
          </button>
        );
      }

      return (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive: active }) =>
            `flex items-center gap-2.5 px-2.5 py-[9px] rounded-[10px] text-[13.5px] font-medium transition-colors mb-0.5 ${
              active
                ? 'text-white shadow-[0_6px_16px_rgba(93,95,239,.32)]'
                : 'text-plat-ink-2 hover:bg-plat-surface-low'
            }`
          }
          style={({ isActive: active }) =>
            active ? { background: 'var(--brand)' } : undefined
          }
        >
          {content}
        </NavLink>
      );
    });

  return (
    <aside
      className="w-[236px] shrink-0 h-screen sticky top-0 flex flex-col border-r"
      style={{
        background: 'rgba(255,255,255,.78)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--outline)',
        padding: '20px 12px',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2.5 pb-[18px]">
        <div
          className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-white font-head font-bold text-[13px] shrink-0"
          style={{
            background: 'linear-gradient(135deg,#5D5FEF,#4343D5)',
            boxShadow: '0 4px 10px rgba(93,95,239,.35)',
          }}
        >
          AIG
        </div>
        <div className="min-w-0">
          <div className="font-head font-bold text-base leading-tight text-plat-ink">A.I.G Pro</div>
          <div className="text-[10.5px] text-plat-muted tracking-[0.08em]">
            {ready ? t('platform.nav.brandSub', 'AI RED TEAM PLATFORM') : 'AI RED TEAM PLATFORM'}
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin">
        {SECTIONS.map(section => (
          <div key={section.id}>
            <div className="text-[10.5px] font-semibold text-plat-muted uppercase tracking-[0.1em] px-2.5 pt-3.5 pb-1.5">
              {ready ? t(section.labelKey, section.fallback) : section.fallback}
            </div>
            {renderItems(section.id)}
          </div>
        ))}
      </nav>

      {/* Foot user */}
      <div className="mt-auto border-t pt-3" style={{ borderColor: 'var(--outline)' }}>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] hover:bg-plat-surface-low transition-colors">
          <div
            className="w-[30px] h-[30px] rounded-full grid place-items-center font-bold text-xs shrink-0"
            style={{ background: 'var(--brand-fixed)', color: 'var(--brand-deep)' }}
          >
            AI
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[12.5px] text-plat-ink truncate">public_user</div>
            <div className="text-[11px] text-plat-muted">
              {ready ? t('platform.nav.administrator', '管理员') : '管理员'} · {env()}
            </div>
          </div>
        </div>
      </div>

      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

/** 版本号 — 静态读取构建信息，避免引 useVersionCheck 的网络依赖 */
function env(): string {
  try {
    const version = (window as any).__AIG_VERSION__ || 'v4.6.2';
    return version;
  } catch {
    return 'v4.6.2';
  }
}
