/**
 * Python 实验室(/ide)API 客户端 — 脚本 CRUD / 运行 / 依赖 / venv。
 * 与其他 lib/*.ts 一致:plain fetch + {status, message, data} envelope。
 */
import { apiFetch } from './http';

const BASE = '/api/v1/app/ide';

interface IdeEnvelope<T> {
  status: number;
  message: string;
  data: T;
}

export type IdeRunStatus = 'running' | 'done' | 'error' | 'timeout' | 'killed';

export interface IdeScriptMeta {
  name: string;
  size: number;
  mtime: number;
}

export interface IdeRunMeta {
  run_id: string;
  kind: 'script' | 'deps';
  script: string;
  packages?: string[];
  status: IdeRunStatus;
  exit_code: number | null;
  message?: string;
  created_at: number;
  finished_at?: number | null;
  duration_ms?: number | null;
  output_size?: number;
  output_truncated?: boolean;
}

export interface IdeRunOutput {
  run_id: string;
  kind: 'script' | 'deps';
  script: string;
  status: IdeRunStatus;
  exit_code: number | null;
  message?: string;
  created_at: number;
  finished_at?: number | null;
  duration_ms?: number | null;
  output_truncated: boolean;
  offset: number;
  next_offset: number;
  size: number;
  output: string;
}

export interface IdeVenvStatus {
  exists: boolean;
  path: string;
  python_version?: string;
  packages?: Array<{ name: string; version: string }>;
  error?: string;
}

/** 统一错误:非 0 status 抛 Error(带 message);conflict 场景由调用方读 data */
export class IdeApiError extends Error {
  data?: any;
  constructor(message: string, data?: any) {
    super(message);
    this.data = data;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<IdeEnvelope<T>> {
  const res = await apiFetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  return body as IdeEnvelope<T>;
}

async function unwrap<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<T>(path, init);
  if (body.status !== 0) {
    throw new IdeApiError(body.message || '请求失败', (body as any).data);
  }
  return body.data;
}

function jsonBody(payload: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(payload) };
}

export const ideApi = {
  listScripts: () => unwrap<{ scripts: IdeScriptMeta[]; dir: string }>('/scripts'),

  getScript: (name: string) =>
    unwrap<{ name: string; content: string; mtime: number }>(
      `/scripts/${encodeURIComponent(name)}`
    ),

  /** mtime 传 null 表示新建(跳过冲突检测) */
  saveScript: (name: string, content: string, mtime: number | null, force = false) =>
    unwrap<{ name: string; mtime: number }>(
      `/scripts/${encodeURIComponent(name)}`,
      jsonBody({ content, mtime, force })
    ),

  deleteScript: (name: string) =>
    unwrap<Record<string, never>>(`/scripts/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  renameScript: (name: string, newName: string) =>
    unwrap<{ name: string }>(
      `/scripts/${encodeURIComponent(name)}/rename`,
      jsonBody({ new_name: newName })
    ),

  startRun: (script: string, args: string[] = [], timeoutSec = 600) =>
    unwrap<{ run_id: string; status: IdeRunStatus }>(
      '/runs',
      jsonBody({ script, args, timeout_sec: timeoutSec })
    ),

  installDeps: (packages: string[]) =>
    unwrap<{ run_id: string; status: IdeRunStatus }>('/deps', jsonBody({ packages })),

  listRuns: (limit = 20) => unwrap<{ runs: IdeRunMeta[] }>(`/runs?limit=${limit}`),

  getRunOutput: (runId: string, offset: number) =>
    unwrap<IdeRunOutput>(`/runs/${encodeURIComponent(runId)}/output?offset=${offset}`),

  killRun: (runId: string) =>
    unwrap<{ run_id: string; status: IdeRunStatus }>(
      `/runs/${encodeURIComponent(runId)}/kill`,
      { method: 'POST' }
    ),

  venvStatus: () => unwrap<IdeVenvStatus>('/venv'),
};

/** 服务端同款包名校验(客户端预检) */
export const IDE_PKG_RE = /^[A-Za-z0-9._~+=!^*][A-Za-z0-9._~+=!<>^*-]{0,127}$/;

/** 服务端同款脚本名校验 */
export const IDE_SCRIPT_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}\.py$/;
