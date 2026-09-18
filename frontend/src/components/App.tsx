import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { AuthGate } from '../config/privateModules';
import HelpDocumentPage from '../pages/HelpDocumentPage';
import ReportPage from '../pages/ReportPage';
import LLMProxyDetectPage from '../pages/LLMProxyDetectPage';
import PlatformApp from './platform/PlatformApp';
import { Toaster } from './ui/sonner';
import { isDocSiteMode, extraRoutes } from '@/config/privateModules';
import { useVersionCheck } from '../hooks/useVersionCheck';

/**
 * 平台壳入口（阶段 3 重构）：
 * 旧聊天工作台三栏（TaskSidebar | ChatArea | DetailPanel）由 PlatformApp +
 * AssistantDock（浮球抽屉）替代；/report /poison-detect 保留。
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

  // Whether login is required is controlled by the private overlay (in the open-source build AuthGate is a passthrough and does not enable login)
  return (
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
  );
};

export default App;
