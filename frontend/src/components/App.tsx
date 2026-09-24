import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../context/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AuthGate } from '../config/privateModules';
import HelpDocumentPage from '../pages/HelpDocumentPage';
import ReportPage from '../pages/ReportPage';
import LLMProxyDetectPage from '../pages/LLMProxyDetectPage';
import LoginPage from '../pages/LoginPage';
import PlatformApp from './platform/PlatformApp';
import { Toaster } from './ui/sonner';
import { isDocSiteMode, extraRoutes } from '@/config/privateModules';
import { useVersionCheck } from '../hooks/useVersionCheck';

/**
 * 平台壳入口（阶段 3 重构）：
 * 旧聊天工作台三栏（TaskSidebar | ChatArea | DetailPanel）由 PlatformApp +
 * AssistantDock（浮球抽屉）替代；/report /poison-detect 保留。
 *
 * dev(ac3053a6) 的「执行控制台结束后仍可达」能力在平台层的等价实现位于
 * platform/task/TaskDetailPane.tsx（8.6.2）——本文件不再承载旧工作台状态。
 *
 * 认证（2026-09-24）：/login 全站唯一开放路由；其余所有页面（含 /report
 * 分享页与 /poison-detect）经 RequireAuth 门控——服务端 AIG_AUTH_DISABLE=1
 * 时 RequireAuth 直接放行（旧行为平价）。
 */
const PlatformEntry: React.FC = () => {
  // Check for a new platform version on page open and once per day; notify the user when available
  useVersionCheck();
  return (
    <PlatformApp />
  );
};

const App: React.FC = () => {
  // Doc-site mode (controlled by the private overlay): no login required; only shows the help doc page
  if (isDocSiteMode) {
    return (
      <Routes>
        <Route path="*" element={<HelpDocumentPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* 登录页：全站唯一免认证路由 */}
      <Route path="/login" element={<LoginPage />} />
      {/* 其余全部路由要求登录态（RequireAuth gating AppProvider，避免未登录触发数据加载） */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <AuthProvider>
              <Routes>
                <Route path="/report/:sessionId" element={<ReportPage />} />
                <Route path="/poison-detect" element={<LLMProxyDetectPage />} />
                {extraRoutes.map(r => (
                  <Route key={r.path} path={r.path} element={r.element} />
                ))}
                <Route
                  path="/*"
                  element={
                    <AuthGate>
                      <AppProvider>
                        <PlatformEntry />
                        <Toaster />
                      </AppProvider>
                    </AuthGate>
                  }
                />
              </Routes>
            </AuthProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
};

export default App;
