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

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

/**
 * 登录页（/login）——全站唯一开放路由。
 * - 常规登录：用户名 + 密码
 * - 首次登录（first_login）：强制修改密码后进入平台
 * - 匿名分享链接命中时带提示文案
 */
const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, refresh } = useAuth();
  const next = searchParams.get('next') || '/';

  const isShareAccess = next.startsWith('/report/');
  const [mode, setMode] = useState<'login' | 'change-password'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = (key: string, fallback: string) => (t(key, fallback) as string);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      if (!res.ok) {
        toast.error(res.message || label('auth.loginFailed', '登录失败'));
        return;
      }
      if (res.firstLogin) {
        setMode('change-password');
        toast.info(label('auth.changePasswordRequired', '首次登录，请先修改密码'));
        return;
      }
      navigate(next, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error(label('auth.passwordTooShort', '新密码至少 8 位'));
      return;
    }
    if (newPassword !== newPassword2) {
      toast.error(label('auth.passwordMismatch', '两次输入的新密码不一致'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ old: password, new: newPassword }),
      });
      const body = await res.json().catch(() => ({ status: 1 }));
      if (body.status !== 0) {
        toast.error(body.message || label('auth.changePasswordFailed', '修改密码失败'));
        return;
      }
      await refresh();
      toast.success(label('auth.changePasswordOk', '密码已修改'));
      navigate(next, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-low, #f6f7fb)' }}>
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center" style={{ background: 'var(--brand)', boxShadow: '0 8px 20px rgba(93,95,239,.32)' }}>
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="text-lg font-bold text-plat-ink">A.I.G</div>
          <div className="text-xs text-plat-muted">{label('auth.subtitle', 'AI 基础设施安全评估平台')}</div>
        </div>

        <div className="bg-white border rounded-[16px] p-6" style={{ borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card)' }}>
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <div className="text-base font-semibold text-plat-ink mb-1">{label('auth.title', '登录')}</div>
                <div className="text-xs text-plat-muted">{label('auth.subtitle', 'AI 基础设施安全评估平台')}</div>
              </div>
              {isShareAccess && (
                <div className="text-xs rounded-[10px] px-3 py-2" style={{ color: 'var(--st-info-t)', background: 'var(--st-info-bg)' }}>
                  {label('auth.shareLoginHint', '查看分享的报告需要登录')}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-plat-ink-2">{label('auth.username', '用户名')}</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="h-10 rounded-[10px] border px-3 text-sm outline-none focus:ring-2"
                  style={{ borderColor: 'var(--outline)' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-plat-ink-2">{label('auth.password', '密码')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-10 rounded-[10px] border px-3 text-sm outline-none focus:ring-2"
                  style={{ borderColor: 'var(--outline)' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                className="h-10 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: 'var(--brand)' }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {label('auth.login', '登 录')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <div>
                <div className="text-base font-semibold text-plat-ink mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                  {label('auth.changePasswordTitle', '修改初始密码')}
                </div>
                <div className="text-xs text-plat-muted">{label('auth.changePasswordDesc', '首次登录需要设置新密码后继续')}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-plat-ink-2">{label('auth.newPassword', '新密码')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  className="h-10 rounded-[10px] border px-3 text-sm outline-none"
                  style={{ borderColor: 'var(--outline)' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-plat-ink-2">{label('auth.newPassword2', '确认新密码')}</label>
                <input
                  type="password"
                  value={newPassword2}
                  onChange={e => setNewPassword2(e.target.value)}
                  autoComplete="new-password"
                  className="h-10 rounded-[10px] border px-3 text-sm outline-none"
                  style={{ borderColor: 'var(--outline)' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !newPassword || !newPassword2}
                className="h-10 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: 'var(--brand)' }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {label('auth.changePasswordSubmit', '修改并继续')}
              </button>
            </form>
          )}
        </div>

        <div className="text-center text-[11px] text-plat-muted">
          {label('auth.footer', 'Tencent Zhuque Lab · AI-Infra-Guard')}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
