import React from 'react';
import { X } from 'lucide-react';
import { ideApi, IDE_PKG_RE, type IdeVenvStatus } from '../../lib/ideApi';

export const InstallDepsDialog: React.FC<{
  onClose: () => void;
  onInstalled: (runId: string) => void;
}> = ({ onClose, onInstalled }) => {
  const [input, setInput] = React.useState('');
  const [venv, setVenv] = React.useState<IdeVenvStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    ideApi.venvStatus().then(setVenv).catch(() => {});
  }, []);

  const packages = input
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const invalid = packages.filter(p => !IDE_PKG_RE.test(p));

  const submit = async () => {
    if (packages.length === 0 || invalid.length > 0) {
      setError(invalid.length > 0 ? `非法包名: ${invalid.join(', ')}` : '请输入至少一个包名');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { run_id } = await ideApi.installDeps(packages);
      onInstalled(run_id);
      onClose();
    } catch (e: any) {
      setError(e.message || '安装失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-[520px] max-w-[92vw] p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-plat-ink">安装依赖</div>
          <button onClick={onClose} className="cursor-pointer text-plat-muted hover:text-plat-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-plat-muted">
          安装到当前用户独立 venv({venv?.exists ? `${(venv.python_version || '').replace(/^Python /, '') || '?'}` : '首次安装将自动创建 Python 3.12 环境'})
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={'每行/空格/逗号分隔,支持版本约束:\nrequests\npandas>=2.0\npyyaml'}
          rows={4}
          className="w-full border rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y focus:ring-1"
          style={{ borderColor: 'var(--outline)' }}
          autoFocus
        />
        {venv?.exists && (venv.packages?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {venv.packages!.map(p => (
              <span key={p.name} className="text-[10px] font-mono text-plat-ink-2 bg-plat-surface-low border rounded px-1.5 py-0.5" style={{ borderColor: 'var(--outline)' }}>
                {p.name}=={p.version}
              </span>
            ))}
          </div>
        )}
        {error && <div className="text-xs" style={{ color: 'var(--st-crit-t)' }}>{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs font-medium rounded-lg px-3 py-1.5 cursor-pointer text-plat-ink-2 hover:bg-plat-surface-low">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-xs font-semibold rounded-lg px-4 py-1.5 text-white cursor-pointer disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {submitting ? '创建安装任务…' : `安装${packages.length > 0 ? ` (${packages.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallDepsDialog;
