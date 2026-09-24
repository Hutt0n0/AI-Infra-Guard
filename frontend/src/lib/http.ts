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

/**
 * 统一 API fetch 包装。
 *
 * 认证契约：服务端会话走 HttpOnly cookie（aig_session），同源请求自动携带。
 * 401 时派发全局 `aig:unauthorized` 事件——AuthContext 单点监听并重定向登录页，
 * 调用方拿到原始 Response 走既有错误路径（envelope status/message）。
 */

/** 401 全局事件名（AuthContext 监听） */
export const UNAUTHORIZED_EVENT = 'aig:unauthorized';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { url: String(input) } }));
  }
  return response;
}
