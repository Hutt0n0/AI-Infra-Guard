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

import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

/**
 * 路由级认证门：挂载时探测 /api/v1/auth/me。
 * - enabled=false（AIG_AUTH_DISABLE=1）→ 直接放行（kill-switch 平价）
 * - authenticated → 放行（gating 后面的 AppProvider，避免未登录触发数据加载）
 * - 否则 → 重定向 /login?next=…
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [probe, setProbe] = useState<'loading' | 'ok' | 'deny'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
        const body = await res.json();
        const d = body?.data ?? {};
        if (cancelled) return;
        if (d.enabled === false || d.authenticated) setProbe('ok');
        else setProbe('deny');
      } catch {
        if (!cancelled) setProbe('deny');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (probe === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--surface)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand)' }} />
        <div className="text-sm text-plat-muted">{t('auth.checking', '正在检查登录状态…')}</div>
      </div>
    );
  }
  if (probe === 'deny') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
};
