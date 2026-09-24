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

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, RotateCcw, UserX, UserCheck } from 'lucide-react';
import { apiFetch } from '../../lib/http';
import { useAuth } from '../../context/AuthContext';

interface AuthUser {
  user_id: string;
  username: string;
  email: string;
  is_active: boolean;
  first_login: boolean;
  created_at: number;
  role: string;
}

/** 用户管理 Tab（admin-only）：建号 / 启禁 / 重置密码，敏感凭据一次性展示。 */
const UserManagementTab: React.FC = () => {
  const { t } = useTranslation();
  const { username: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // 一次性凭据展示（建号/重置返回的 initial_password / new_password）
  const [oneTimeCredential, setOneTimeCredential] = useState<{ title: string; value: string } | null>(null);

  const label = (key: string, fallback: string) => (t(key, fallback) as string);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/auth/users');
      const body = await res.json().catch(() => ({ status: 1 }));
      if (body.status === 0) setUsers(body.data?.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    const res = await apiFetch('/api/v1/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername.trim(),
        email: newEmail.trim() || `${newUsername.trim()}@localhost`,
        ...(newPassword ? { password: newPassword } : {}),
      }),
    });
    const body = await res.json().catch(() => ({ status: 1 }));
    if (body.status !== 0) {
      toast.error(body.message || label('auth.createFailed', '创建失败'));
      return;
    }
    if (body.data?.initial_password) {
      setOneTimeCredential({ title: label('auth.initialPassword', '初始密码（仅显示一次）'), value: body.data.initial_password });
    }
    toast.success(label('auth.createOk', '用户已创建'));
    setShowCreate(false);
    setNewUsername(''); setNewEmail(''); setNewPassword('');
    loadUsers();
  };

  const handleToggleActive = async (u: AuthUser) => {
    const res = await apiFetch(`/api/v1/auth/users/${u.username}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !u.is_active }),
    });
    const body = await res.json().catch(() => ({ status: 1 }));
    if (body.status !== 0) {
      toast.error(body.message || label('auth.updateFailed', '更新失败'));
      return;
    }
    loadUsers();
  };

  const handleResetPassword = async (u: AuthUser) => {
    const res = await apiFetch(`/api/v1/auth/users/${u.username}/reset-password`, { method: 'POST' });
    const body = await res.json().catch(() => ({ status: 1 }));
    if (body.status !== 0) {
      toast.error(body.message || label('auth.resetFailed', '重置失败'));
      return;
    }
    if (body.data?.new_password) {
      setOneTimeCredential({ title: label('auth.newPasswordOneTime', '新密码（仅显示一次）'), value: body.data.new_password });
    }
    loadUsers();
  };

  return (
    <div className="p-6 flex flex-col gap-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-700">{label('auth.userManagement', '用户管理')}</div>
          <div className="text-xs text-gray-400 mt-0.5">{label('auth.userManagementDesc', '创建平台账号、禁用登录、重置密码')}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {label('auth.createUser', '新建用户')}
        </button>
      </div>

      {oneTimeCredential && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-amber-800">{oneTimeCredential.title}</div>
            <div className="text-sm font-mono text-amber-900 mt-0.5 select-all">{oneTimeCredential.value}</div>
          </div>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(oneTimeCredential.value); toast.success(label('auth.copied', '已复制')); }}
            className="text-xs text-amber-700 hover:text-amber-900 underline cursor-pointer"
          >
            {label('auth.copy', '复制')}
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-[10px] border border-gray-200 p-4 flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2.5">
            <input
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder={label('auth.username', '用户名')}
              className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
            <input
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder={`${label('auth.email', '邮箱')}（可选）`}
              className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
            <input
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={`${label('auth.password', '密码')}（${label('auth.optional', '留空自动生成')}）`}
              className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer">
              {label('auth.create', '创建')}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="h-8 px-4 rounded-[8px] text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 cursor-pointer">
              {label('common.cancel', '取消')}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-[10px] border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="text-left px-3 py-2 font-semibold">{label('auth.username', '用户名')}</th>
              <th className="text-left px-3 py-2 font-semibold">{label('auth.email', '邮箱')}</th>
              <th className="text-left px-3 py-2 font-semibold">{label('auth.role', '角色')}</th>
              <th className="text-left px-3 py-2 font-semibold">{label('auth.status', '状态')}</th>
              <th className="text-right px-3 py-2 font-semibold">{label('auth.actions', '操作')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-700">
                  {u.username}
                  {u.username === me && <span className="ml-1.5 text-[10px] text-gray-400">({label('auth.you', '我')})</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">{u.email}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role === 'admin' ? label('auth.roleAdmin', '管理员') : label('auth.roleUser', '用户')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active ? label('auth.active', '启用') : label('auth.disabled', '禁用')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title={u.is_active ? label('auth.disable', '禁用') : label('auth.enable', '启用')}
                      onClick={() => handleToggleActive(u)}
                      className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                    >
                      {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      title={label('auth.resetPassword', '重置密码')}
                      onClick={() => handleResetPassword(u)}
                      className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{label('auth.noUsers', '暂无用户')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagementTab;
