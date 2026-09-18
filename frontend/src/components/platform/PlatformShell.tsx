import * as React from 'react';
import { Outlet } from 'react-router-dom';
import SideNav from './SideNav';
import Topbar from './Topbar';

/**
 * 平台总壳 — 设计稿 .shell：左侧 236px 常驻导航 + 右侧主列（Topbar + 页面画布）
 */
export default function PlatformShell() {
  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--surface)' }}>
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 pb-12 max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
