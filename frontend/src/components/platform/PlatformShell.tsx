import * as React from 'react';
import { Outlet } from 'react-router-dom';
import SideNav from './SideNav';
import Topbar from './Topbar';

/**
 * 平台总壳 — 设计稿 .shell：左侧 236px 常驻导航 + 右侧主列（Topbar + 页面画布）
 *
 * 高度链：h-screen → 主列 flex → main flex-1（自身滚动）→ 内容包装器 h-full flex-col。
 * 全页应用型页面（任务详情 /task/:sessionId 需要内部 Tab 独立滚动）用
 * Outlet context 的 detailShell 标记改为不滚动、由页面自身占满高度。
 */
export default function PlatformShell() {
  // 由子路由声明需要"满高壳"（任务详情页等内部滚动布局）
  const [fullHeight, setFullHeight] = React.useState(false);

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--surface)' }}>
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className={fullHeight ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          <div
            className={fullHeight ? 'h-full flex flex-col min-h-0' : 'p-6 pb-12 max-w-[1440px]'}
            style={fullHeight ? { padding: 0, maxWidth: 'none' } : undefined}
          >
            <ShellModeContext.Provider value={setFullHeight}>
              <Outlet />
            </ShellModeContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}

/** 子路由向壳声明布局模式的通道 */
export const ShellModeContext = React.createContext<(fullHeight: boolean) => void>(() => {});
