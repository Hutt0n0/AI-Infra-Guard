import * as React from 'react';
import { FlaskConical, Save, RefreshCw, Timer } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { PageHeader } from '../components/platform/primitives';
import { ShellModeContext } from '../components/platform/PlatformShell';
import IdeEditor from '../components/ide/IdeEditor';
import ScriptTree from '../components/ide/ScriptTree';
import RunConsole, { RunButton, StatusBadge, RUN_STATUS_META } from '../components/ide/RunConsole';
import InstallDepsDialog from '../components/ide/InstallDepsDialog';
import { useRunPolling } from '../components/ide/useRunPolling';
import { ideApi, IDE_SCRIPT_NAME_RE, type IdeScriptMeta, type IdeRunMeta, type IdeVenvStatus } from '../lib/ideApi';
import { useTranslation } from 'react-i18next';

/**
 * Python 实验室 — 满高三栏:脚本树 / Monaco 编辑器 / 运行输出控制台。
 * 运行与依赖安装都走 REST 轮询(700ms 增量),无 SSE。
 */
export default function IdePage() {
  const { t, ready } = useTranslation();
  const label = React.useCallback((key: string, fallback: string) => (ready ? t(key, fallback) : fallback), [t, ready]);

  const setFullHeight = React.useContext(ShellModeContext);
  React.useEffect(() => {
    setFullHeight(true);
    return () => setFullHeight(false);
  }, [setFullHeight]);

  // 脚本状态
  const [scripts, setScripts] = React.useState<IdeScriptMeta[]>([]);
  const [activeScript, setActiveScript] = React.useState<string | null>(null);
  const [content, setContent] = React.useState('');
  const [loadedMtime, setLoadedMtime] = React.useState<number | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 运行状态
  const { run, lines, startRun, viewHistorical, setRun } = useRunPolling();
  const [argsInput, setArgsInput] = React.useState('');
  const [timeoutSec, setTimeoutSec] = React.useState(600);
  const [starting, setStarting] = React.useState(false);

  // venv / 历史 / 弹窗
  const [venv, setVenv] = React.useState<IdeVenvStatus | null>(null);
  const [runs, setRuns] = React.useState<IdeRunMeta[]>([]);
  const [depsOpen, setDepsOpen] = React.useState(false);
  const followRef = React.useRef<HTMLDivElement | null>(null);

  const loadScripts = React.useCallback(async (selectFirst: string | null = null) => {
    try {
      const d = await ideApi.listScripts();
      setScripts(d.scripts);
      if (selectFirst || (!activeScript && d.scripts.length > 0)) {
        const target = selectFirst || d.scripts[0].name;
        openScript(target);
      }
    } catch (e: any) {
      setNotice(e.message || '加载脚本列表失败');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript]);

  const openScript = React.useCallback(async (name: string) => {
    try {
      const d = await ideApi.getScript(name);
      setActiveScript(name);
      setContent(d.content);
      setLoadedMtime(d.mtime);
      setDirty(false);
      setNotice(null);
    } catch (e: any) {
      setNotice(e.message || '打开脚本失败');
    }
  }, []);

  React.useEffect(() => {
    loadScripts();
    ideApi.venvStatus().then(setVenv).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = React.useCallback(() => {
    ideApi.listRuns(15).then(d => setRuns(d.runs)).catch(() => {});
  }, []);
  React.useEffect(() => {
    refreshHistory();
    const id = window.setInterval(refreshHistory, 5000);
    return () => window.clearInterval(id);
  }, [refreshHistory]);

  // 输出自动跟随底部
  React.useEffect(() => {
    followRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const save = React.useCallback(async (force = false) => {
    if (!activeScript) return;
    setSaving(true);
    try {
      const d = await ideApi.saveScript(activeScript, content, loadedMtime, force);
      setLoadedMtime(d.mtime);
      setDirty(false);
      setNotice(label('platform.ide.saved', '已保存'));
      setScripts(prev => prev.map(s => s.name === activeScript ? { ...s, size: content.length } : s));
    } catch (e: any) {
      if (e.data?.code === 'conflict') {
        const overwrite = window.confirm(
          label('platform.ide.conflict.title', '脚本已被其他窗口修改。\n\n确定覆盖其他窗口的修改吗?(取消可从服务端重新加载)')
        );
        if (overwrite) {
          await save(true);
        } else {
          // 用服务端当前内容刷新冲突数据
          openScript(activeScript);
        }
      } else {
        setNotice(e.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }, [activeScript, content, loadedMtime, openScript, label]);

  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const doRun = async () => {
    if (!activeScript) return;
    setStarting(true);
    try {
      if (dirty) await save();
      const args = argsInput.split(/\s+/).filter(Boolean);
      const { run_id } = await ideApi.startRun(activeScript, args, timeoutSec);
      startRun(run_id);
    } catch (e: any) {
      setNotice(e.message || '运行失败');
    } finally {
      setStarting(false);
    }
  };

  const doKill = async () => {
    if (!run) return;
    try {
      await ideApi.killRun(run.run_id);
    } catch { /* 轮询会收到终态 */ }
  };

  const doNew = async () => {
    const name = window.prompt(label('platform.ide.newScript', '新脚本名(以 .py 结尾):'), 'script_.py');
    if (!name) return;
    if (!IDE_SCRIPT_NAME_RE.test(name)) {
      setNotice(label('platform.ide.nameInvalid', '脚本名只能包含字母/数字/_-.且以 .py 结尾'));
      return;
    }
    try {
      await ideApi.saveScript(name, `# ${name}\n`, null, true);
      await loadScripts(name);
    } catch (e: any) {
      setNotice(e.message || '创建失败');
    }
  };

  const doRename = async (name: string) => {
    const newName = window.prompt(label('platform.ide.rename', '新名称:'), name);
    if (!newName || newName === name) return;
    if (!IDE_SCRIPT_NAME_RE.test(newName)) {
      setNotice(label('platform.ide.nameInvalid', '脚本名只能包含字母/数字/_-.且以 .py 结尾'));
      return;
    }
    try {
      await ideApi.renameScript(name, newName);
      if (activeScript === name) setActiveScript(newName);
      loadScripts();
    } catch (e: any) {
      setNotice(e.message || '重命名失败');
    }
  };

  const doDelete = async (name: string) => {
    if (!window.confirm(label('platform.ide.deleteConfirm', `确定删除脚本 ${name}?`))) return;
    try {
      await ideApi.deleteScript(name);
      if (activeScript === name) {
        setActiveScript(null);
        setContent('');
        setLoadedMtime(null);
      }
      loadScripts();
    } catch (e: any) {
      setNotice(e.message || '删除失败');
    }
  };

  const running = run?.status === 'running';

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-6 pt-4 pb-3 flex items-center gap-3 flex-shrink-0">
        <PageHeader
          title={label('platform.ide.title', 'Python 实验室')}
          subtitle={label('platform.ide.pageSub', '在服务端编写、运行 Python 脚本并管理依赖')}
        />
        <span className="flex-1" />
        {venv && (
          <span className="text-[11px] text-plat-ink-2 bg-plat-surface-low rounded-full px-2.5 py-1" style={{ border: '1px solid var(--outline)' }}>
            <FlaskConical className="w-3 h-3 inline mr-1" style={{ color: 'var(--brand)' }} />
            {venv.exists
              ? `venv · ${(venv.python_version || '').replace(/^Python /, '') || '?'} · ${(venv.packages?.length ?? 0)} 包`
              : 'venv 未创建(运行/装依赖时自动创建)'}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 px-6 pb-4">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-xl overflow-hidden" style={{ border: '1px solid var(--outline)', background: 'var(--surface)' }}>
          {/* 左:脚本树 */}
          <ResizablePanel defaultSize={22} minSize={16}>
            <ScriptTree
              scripts={scripts}
              active={activeScript}
              onSelect={openScript}
              onNew={doNew}
              onRename={doRename}
              onDelete={doDelete}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* 右:编辑器 + 输出 */}
          <ResizablePanel defaultSize={78}>
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={62} minSize={25}>
                <div className="flex flex-col h-full min-h-0">
                  {/* 工具栏 */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0 flex-wrap" style={{ borderColor: 'var(--outline)' }}>
                    <RunButton running={!!running || starting} onClick={doRun} disabled={!activeScript} />
                    {activeScript && (
                      <span className="text-xs font-medium text-plat-ink-2">{activeScript}</span>
                    )}
                    {dirty && <span className="text-[10px] text-amber-600">● 未保存</span>}
                    <button
                      onClick={() => save()}
                      disabled={!activeScript || saving}
                      className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 cursor-pointer text-plat-ink-2 hover:bg-plat-surface-low disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" /> 保存 <span className="text-plat-muted">⌘S</span>
                    </button>
                    <span className="w-px h-4" style={{ background: 'var(--outline)' }} />
                    <input
                      value={argsInput}
                      onChange={e => setArgsInput(e.target.value)}
                      placeholder={label('platform.ide.argsPlaceholder', '运行参数(空格分隔,可选)')}
                      className="text-[11px] font-mono rounded-md px-2 py-1 outline-none w-[220px]"
                      style={{ border: '1px solid var(--outline)' }}
                    />
                    <span className="inline-flex items-center gap-1 text-[11px] text-plat-muted">
                      <Timer className="w-3 h-3" />
                      <select
                        value={timeoutSec}
                        onChange={e => setTimeoutSec(Number(e.target.value))}
                        className="text-[11px] rounded-md px-1 py-1 outline-none cursor-pointer"
                        style={{ border: '1px solid var(--outline)' }}
                      >
                        <option value={300}>5 分钟</option>
                        <option value={600}>10 分钟</option>
                        <option value={1800}>30 分钟</option>
                      </select>
                    </span>
                    <span className="flex-1" />
                    {notice && <span className="text-[11px]" style={{ color: 'var(--brand)' }}>{notice}</span>}
                  </div>
                  {/* 编辑器 */}
                  <div className="flex-1 min-h-0">
                    {activeScript ? (
                      <IdeEditor
                        value={content}
                        onChange={(v) => { setContent(v); setDirty(true); }}
                        onSaveShortcut={() => save()}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-plat-muted">
                        {label('platform.ide.console.empty', '从左侧选择或新建脚本')}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={38} minSize={15}>
                <div className="flex flex-col h-full min-h-0">
                  {/* 历史运行条 */}
                  {runs.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1 border-b overflow-x-auto flex-shrink-0" style={{ borderColor: 'var(--outline)' }}>
                      <span className="text-[10px] text-plat-muted flex-shrink-0">历史:</span>
                      {runs.slice(0, 10).map(r => (
                        <button
                          key={r.run_id}
                          onClick={() => viewHistorical(r.run_id)}
                          className="inline-flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5 cursor-pointer flex-shrink-0 hover:bg-plat-surface-low"
                          style={{ border: '1px solid var(--outline)', color: RUN_STATUS_META[r.status]?.color }}
                          title={`${r.script} · ${r.status}`}
                        >
                          {r.kind === 'deps' ? '📦' : '🐍'} {r.script.slice(0, 14)}
                          <StatusBadge status={r.status} />
                        </button>
                      ))}
                      <span className="flex-1" />
                      <button onClick={refreshHistory} className="text-plat-muted hover:text-plat-ink cursor-pointer flex-shrink-0" title="刷新">
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <RunConsole run={run} lines={lines} onKill={doKill} onOpenDeps={() => setDepsOpen(true)} followRef={followRef} />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {depsOpen && (
        <InstallDepsDialog
          onClose={() => setDepsOpen(false)}
          onInstalled={(runId) => startRun(runId)}
        />
      )}
    </div>
  );
}
