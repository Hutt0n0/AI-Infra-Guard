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
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/http';
import { useAuth } from '../../context/AuthContext';

/** 账号安全 Tab：修改自己的密码（全员可见）。改密成功后其余会话被服务端吊销。 */
const AccountTab: React.FC = () => {
  const { t } = useTranslation();
  const { username, refresh } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = (key: string, fallback: string) => (t(key, fallback) as string);

  const handleSubmit = async (e: React.FormEvent) => {
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
      const res = await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old: oldPassword, new: newPassword }),
      });
      const body = await res.json().catch(() => ({ status: 1 }));
      if (body.status !== 0) {
        toast.error(body.message || label('auth.changePasswordFailed', '修改密码失败'));
        return;
      }
      await refresh();
      toast.success(label('auth.changePasswordOk', '密码已修改'));
      setOldPassword(''); setNewPassword(''); setNewPassword2('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-[440px] flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-gray-700">{label('auth.account', '账号安全')}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {label('auth.currentUser', '当前用户')}: <span className="font-medium text-gray-600">{username}</span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">{label('auth.oldPassword', '原密码')}</label>
          <input
            type="password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            autoComplete="current-password"
            className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">{label('auth.newPassword', '新密码')}</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">{label('auth.newPassword2', '确认新密码')}</label>
          <input
            type="password"
            value={newPassword2}
            onChange={e => setNewPassword2(e.target.value)}
            autoComplete="new-password"
            className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !oldPassword || !newPassword || !newPassword2}
          className="h-9 rounded-[8px] text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? label('auth.submitting', '提交中…') : label('auth.changePasswordSubmit', '修改密码')}
        </button>
        <div className="text-[11px] text-gray-400">{label('auth.changePasswordNote', '修改成功后，其他已登录设备将被登出')}</div>
      </form>
    </div>
  );
};

export default AccountTab;
