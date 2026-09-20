import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import CommandSearch from './CommandSearch';
import NotificationBell from './NotificationBell';

/** 路由 → 面包屑元数据 */
const CRUMB_MAP: Record<string, { key: string; fallback: string; light: string }> = {
  '/': { key: 'platform.nav.dashboard', fallback: '安全总览', light: 'Security Posture' },
  '/tasks': { key: 'platform.nav.tasks', fallback: '任务中心', light: 'Task Center' },
  '/scan/agent': { key: 'platform.nav.agentScan', fallback: 'Agent扫描', light: 'Agent Scan' },
  '/scan/skill': { key: 'platform.nav.skillScan', fallback: 'Skill扫描', light: 'Skill Scan' },
  '/scan/mcp': { key: 'platform.nav.mcpScan', fallback: 'MCP扫描', light: 'MCP Scan' },
  '/scan/redteam': { key: 'platform.nav.modelRedteamReport', fallback: '大模型安全体检', light: 'LLM Security Check' },
  '/scan/infra': { key: 'platform.nav.aiInfraScan', fallback: 'AI基础设施扫描', light: 'AI Infra Scan' },
  '/scan': { key: 'platform.topbar.newScan', fallback: '新建扫描', light: 'New Scan' },
  '/reports': { key: 'platform.nav.reports', fallback: '报告中心', light: 'Reports' },
  '/knowledge': { key: 'platform.nav.knowledge', fallback: '规则库', light: 'Rule Library' },
  '/agents': { key: 'platform.nav.agents', fallback: '节点与 Agent', light: 'Agents & Nodes' },
  '/logs': { key: 'platform.logs.title', fallback: '日志中心', light: 'Logs' },
  '/help': { key: 'navigation.help', fallback: '帮助文档', light: 'Help' },
};

export default function Topbar() {
  const { t, ready } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = React.useState(false);

  // 前缀匹配（/tasks?x=/tasks 等场景）
  const crumb =
    CRUMB_MAP[location.pathname] ??
    Object.entries(CRUMB_MAP).find(([path]) => location.pathname.startsWith(path))?.[1] ??
    CRUMB_MAP['/'];

  // ⌘K 快捷键
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-3.5 border-b px-7 py-3 shrink-0"
      style={{
        background: 'rgba(248,249,255,.82)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--outline)',
      }}
    >
      <div className="font-head font-bold text-[19px] text-plat-ink">
        {ready ? t(crumb.key, crumb.fallback) : crumb.fallback}
        <span className="ml-2 font-medium text-[15px] text-plat-muted">{crumb.light}</span>
      </div>

      {/* 搜索入口 */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="ml-auto hidden md:flex items-center gap-2 rounded-[10px] border px-3 py-[7px] text-[13px] text-plat-muted bg-white hover:bg-plat-surface-low transition-colors cursor-pointer"
        style={{ borderColor: 'var(--outline)', width: 300 }}
      >
        <Search className="w-[15px] h-[15px]" />
        <span className="flex-1 text-left truncate">
          {ready ? t('platform.topbar.searchPlaceholder', '搜索目标、CVE、任务…') : '搜索目标、CVE、任务…'}
        </span>
        <kbd className="text-[11px] text-plat-muted">⌘K</kbd>
      </button>

      {/* 通知中心 — 任务状态变化事件驱动（NotificationBell） */}
      <NotificationBell />

      {/* 新建扫描 */}
      <button
        type="button"
        onClick={() => navigate('/scan')}
        className="inline-flex items-center gap-[7px] rounded-[11px] px-[15px] py-2 text-[13px] font-semibold text-white transition-colors cursor-pointer hover:opacity-90"
        style={{ background: 'var(--brand)', boxShadow: '0 6px 16px rgba(93,95,239,.32)' }}
      >
        <Plus className="w-[15px] h-[15px]" />
        {ready ? t('platform.topbar.newScan', '新建扫描') : '新建扫描'}
      </button>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
