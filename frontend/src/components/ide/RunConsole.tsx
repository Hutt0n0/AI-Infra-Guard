import React from 'react';
import { Play, Square, Loader2, PackagePlus } from 'lucide-react';
import type { IdeRunMeta, IdeRunStatus } from '../../lib/ideApi';

export const RUN_STATUS_META: Record<IdeRunStatus, { label: string; color: string; bg: string }> = {
  running: { label: '运行中', color: '#1d4ed8', bg: '#dbeafe' },
  done: { label: '完成', color: '#166534', bg: '#dcfce7' },
  error: { label: '错误', color: '#b91c1c', bg: '#fee2e2' },
  timeout: { label: '超时', color: '#a16207', bg: '#fef9c3' },
  killed: { label: '已停止', color: '#57534e', bg: '#e7e5e4' },
};

export const StatusBadge: React.FC<{ status: IdeRunStatus }> = ({ status }) => {
  const m = RUN_STATUS_META[status] || RUN_STATUS_META.error;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color: m.color, background: m.bg }}
    >
      {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {m.label}
    </span>
  );
};

export const RunConsole: React.FC<{
  run: IdeRunMeta | null;
  lines: string[];
  onKill: () => void;
  onOpenDeps: () => void;
  followRef: React.RefObject<HTMLDivElement | null>;
}> = ({ run, lines, onKill, onOpenDeps, followRef }) => {
  const fmtDur = (ms?: number | null) =>
    ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* console header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0" style={{ borderColor: 'var(--outline)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-plat-muted">输出</span>
        {run && (
          <>
            <span className="text-[11px] font-mono text-plat-ink-2 truncate max-w-[180px]">
              {run.kind === 'deps' ? `安装依赖: ${run.script}` : run.script}
            </span>
            <StatusBadge status={run.status} />
            {run.duration_ms != null && (
              <span className="text-[10px] text-plat-muted">{fmtDur(run.duration_ms)}</span>
            )}
            {run.exit_code != null && run.status !== 'done' && (
              <span className="text-[10px] text-red-600">exit {run.exit_code}</span>
            )}
            {run.message && (
              <span className="text-[10px] text-plat-muted truncate max-w-[220px]" title={run.message}>
                {run.message}
              </span>
            )}
            <span className="flex-1" />
            {run.status === 'running' && (
              <button
                onClick={onKill}
                className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 cursor-pointer text-white bg-red-500 hover:bg-red-600"
              >
                <Square className="w-3 h-3" /> 停止
              </button>
            )}
          </>
        )}
        {!run && <span className="flex-1" />}
        <button
          onClick={onOpenDeps}
          className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 cursor-pointer text-plat-ink-2 hover:bg-plat-surface-low"
          title="安装依赖到当前用户环境"
        >
          <PackagePlus className="w-3.5 h-3.5" /> 安装依赖
        </button>
      </div>
      {/* deps banner */}
      {run?.kind === 'deps' && (
        <div className="px-3 py-1 text-[11px] flex-shrink-0" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
          依赖安装输出 — 完成后可在脚本中直接 import
        </div>
      )}
      {/* output */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-[#0d1117] px-3 py-2">
        {lines.length === 0 && !run && (
          <div className="text-xs text-gray-500 text-center py-8">
            点击「运行」执行当前脚本 · 输出实时显示在这里
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="font-mono text-[11px] leading-[1.6] whitespace-pre-wrap break-all text-[#c9d1d9]">
            {l || ' '}
          </div>
        ))}
        <div ref={followRef} />
      </div>
    </div>
  );
};

export const RunButton: React.FC<{
  disabled?: boolean;
  running: boolean;
  onClick: () => void;
}> = ({ disabled, running, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled || running}
    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50 hover:opacity-90"
    style={{ background: 'var(--brand)' }}
  >
    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
    {running ? '运行中…' : '运行'}
  </button>
);

export default RunConsole;
