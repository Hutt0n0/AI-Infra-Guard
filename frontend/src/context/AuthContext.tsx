// Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Requirement: Any integration or derivative work must explicitly attribute
// Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
// documentation or user interface, as detailed in the NOTICE file.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UNAUTHORIZED_EVENT } from '../lib/http';

/**
 * 认证上下文：登录态/当前用户/角色 + 全局 401 处理。
 *
 * 会话 cookie 为 HttpOnly（JS 不可读），登录态以 /api/v1/auth/me 探测为准。
 * apiFetch 层在任意 API 返回 401 时派发 aig:unauthorized 事件，本 Provider
 * 统一捕获并重定向 /login?next=…（已在 /login 时忽略防循环）。
 */

export interface AuthState {
  enabled: boolean; // 服务端认证开关（AIG_AUTH_DISABLE=1 时 false）
  authenticated: boolean;
  username: string;
  role: 'admin' | 'user' | '';
  firstLogin: boolean;
  loading: boolean; // 首次 /me 探测中
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string; firstLogin?: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    enabled: true, authenticated: false, username: '', role: '', firstLogin: false, loading: true,
  });
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
      const body = await res.json();
      const d = body?.data ?? {};
      setState({
        enabled: d.enabled !== false,
        authenticated: !!d.authenticated,
        username: d.username || '',
        role: d.role || '',
        firstLogin: !!d.first_login,
        loading: false,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 全局 401：重定向登录页（保留 next 以便登录后回跳）
  useEffect(() => {
    const handler = () => {
      if (location.pathname === '/login') return; // 防循环
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?next=${next}`, { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [location, navigate]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({ status: 1, message: '网络错误' }));
    if (res.status === 200 && body.status === 0) {
      await refresh();
      return { ok: true, firstLogin: !!body.data?.first_login };
    }
    return { ok: false, message: body.message || '登录失败' };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* 忽略 */ }
    setState(prev => ({ ...prev, authenticated: false, username: '', role: '' }));
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
