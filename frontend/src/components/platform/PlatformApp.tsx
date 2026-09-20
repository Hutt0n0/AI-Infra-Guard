import * as React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';import PlatformShell from './PlatformShell';
import AssistantDock from './AssistantDock';
import DashboardPage from '../../pages/DashboardPage';
import TaskCenterPage from '../../pages/TaskCenterPage';
import NewScanPage from '../../pages/NewScanPage';
import ScanTypePage from '../../pages/ScanTypePage';
import RuleLibraryPage from '../../pages/RuleLibraryPage';
import AgentsPage from '../../pages/AgentsPage';
import JailbreakPage from '../../pages/JailbreakPage';
import ReportsPage from '../../pages/ReportsPage';
import TaskDetailPage from '../../pages/TaskDetailPage';
import LogsPage from '../../pages/LogsPage';
import HelpDocumentPage from '../../pages/HelpDocumentPage';

/**
 * 平台应用 — 二级路由 + 常驻助手浮球。
 * /help 在壳内独立展示（无侧栏依赖）；其余页面挂 PlatformShell 下。
 */
export default function PlatformApp() {
  return (
    <div className="h-screen" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
      <Routes>
        <Route path="/help" element={<HelpDocumentPage />} />
        <Route element={<PlatformShell />}>
          <Route index element={<DashboardPage />} />
          {/* 任务中心（sessionId 直达详情右栏） */}
          <Route path="tasks" element={<TaskCenterPage />} />
          {/* 统一任务详情页（4 Tab：控制台/目标通信/模型往来/报告） */}
          <Route path="task/:sessionId" element={<TaskDetailPage />} />
          {/* 5 类扫描能力独立菜单（历史任务 + 指标）— key 强制类型切换时整页重挂载 */}
          <Route path="scan/:scanType" element={<ScanTypePageWithKey />} />
          {/* 新建扫描表单（Topbar CTA / 类型页「新建此类扫描」入口） */}
          <Route path="scan" element={<NewScanPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="jailbreak" element={<JailbreakPage />} />
          <Route path="knowledge" element={<RuleLibraryPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {/* 助手浮球 + 抽屉：/help 下不挂（HelpDocumentPage 自带返回导航） */}
      <AssistantDockOnlyOnShell />
    </div>
  );
}

/** 助手挂载控制：仅壳页面显示（/help 排除） */
function AssistantDockOnlyOnShell() {
  const location = useLocation();
  // 简单判断：用 pathname 排除
  if (location.pathname.startsWith('/help')) return null;
  return <AssistantDock />;
}

/** ScanTypePage 带 key 包装 — scanType 变化时强制重挂载，保证状态/数据完全隔离 */
function ScanTypePageWithKey() {
  const location = useLocation();
  return <ScanTypePage key={location.pathname} />;
}
