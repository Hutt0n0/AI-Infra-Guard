import * as React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PlatformShell from './PlatformShell';
import AssistantDock from './AssistantDock';
import DashboardPage from '../../pages/DashboardPage';
import TaskCenterPage from '../../pages/TaskCenterPage';
import NewScanPage from '../../pages/NewScanPage';
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
          <Route path="tasks" element={<TaskCenterPage />} />
          <Route path="scan" element={<NewScanPage />} />
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
