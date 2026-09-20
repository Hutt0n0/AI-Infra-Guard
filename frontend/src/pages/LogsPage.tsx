import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Server, Bot, AlertTriangle, Search, ArrowDownToLine } from 'lucide-react';
import { PageHeader, FilterChips } from '../components/platform/primitives';
import { ShellModeContext } from '../components/platform/PlatformShell';

/**
 * 平台日志中心 — server / agent 端日志查看（GET /api/v1/system/logs）。
 * 用途：在平台上直接排查任务失败等原因（如 agent 未启动导致 SSE 超时），
 * 无需登录服务器翻文件。
 */

type LogSource = 'server' | 'agent';

const SOURCES: { key: LogSource; label: string; icon: React.ElementType }[] = [
  { key: 'server', label: 'Server（webserver）', icon: Server },
  { key: 'agent', label: 'Agent（扫描节点）', icon: Bot },
];

const LINE_COUNTS = [200, 500, 2000];

function levelOf(line: string): 'error' | 'warn' | 'info' | 'other' {
  if (/\bERROR\b|\bError\b|\bFATAL\b|\bpanic\b/.test(line)) return 'error';
  if (/\bWARN\b|\bWarning\b/.test(line)) return 'warn';
  if (/\bINFO\b|\bDEBUG\b/.test(line)) return 'info';
  return 'other';
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'var(--st-crit-t)',
  warn: 'var(--st-warn-t)',
  info: 'var(--ink-2)',
  other: 'var(--ink-2)',
};

export default function LogsPage() {
  const { t, ready } = useTranslation();
  // 日志页是"内部滚动"布局：向壳声明满高模式，main 不滚动、由日志容器自身滚动，
  // 否则 h-full 解析不出导致内容撑出平台页面高度
  const setFullHeight = React.useContext(ShellModeContext);
  React.useEffect(() => {
    setFullHeight(true);
    return () => setFullHeight(false);
  }, [setFullHeight]);
  const [source, setSource] = React.useState<LogSource>('server');
  const [lineCount, setLineCount] = React.useState(500);
  const [lines, setLines] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [logPath, setLogPath] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');
  const [errorsOnly, setErrorsOnly] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  // 贴底跟随：true 时新日志到达自动滚到底部；用户向上翻阅自动解除
  const [follow, setFollow] = React.useState(true);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const load = React.useCallback((src: LogSource, count: number) => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/v1/system/logs?source=${src}&lines=${count}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 0) {
          setLines(data.data?.lines ?? []);
          setNotice(data.data?.notice || null);
          setMissing(!!data.data?.missing);
          setLogPath(data.data?.path ?? '');
        } else {
          setError(data.message || '读取日志失败');
        }
        setIsLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : '读取日志失败');
        setIsLoading(false);
      });
  }, []);

  React.useEffect(() => {
    load(source, lineCount);
  }, [source, lineCount, load]);

  // 自动刷新（3s），仅 server 源有意义时也允许 agent
  React.useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => load(source, lineCount), 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, source, lineCount, load]);

  const filtered = React.useMemo(() => {
    let out = lines;
    if (errorsOnly) out = out.filter(l => levelOf(l) === 'error');
    const q = filter.trim().toLowerCase();
    if (q) out = out.filter(l => l.toLowerCase().includes(q));
    return out;
  }, [lines, errorsOnly, filter]);

  // 贴底跟随式自动滚动：仅当用户本来就停在底部（follow=true）时，
  // 新日志到达才自动滚动；一旦向上翻阅即解除跟随，滚回底部再恢复。
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !follow) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered, follow]);

  const handleScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setFollow(atBottom);
  }, []);

  // 切换来源 / 行数时重置为跟随最新
  React.useEffect(() => {
    setFollow(true);
  }, [source, lineCount]);

  const errorCount = lines.filter(l => levelOf(l) === 'error').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title={label('platform.logs.title', '日志中心')}
        titleLight="Logs"
        subtitle={label(
          'platform.logs.pageSub',
          '查看 Server / Agent 端运行日志，排查任务失败原因（如 agent 未启动、任务分发失败等）'
        )}
        actions={
          <>
            <button
              type="button"
              onClick={() => setAutoRefresh(v => !v)}
              className="inline-flex items-center gap-[7px] rounded-[11px] border px-[15px] py-2 text-[13px] font-semibold cursor-pointer transition-colors"
              style={
                autoRefresh
                  ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                  : { borderColor: 'var(--outline)', color: 'var(--ink-2)' }
              }
            >
              {label('platform.logs.autoRefresh', '自动刷新')}
              {autoRefresh ? ' · 开' : ' · 关'}
            </button>
            <button
              type="button"
              onClick={() => load(source, lineCount)}
              className="inline-flex items-center gap-[7px] rounded-[11px] border bg-white px-[15px] py-2 text-[13px] font-semibold text-plat-ink-2 hover:bg-plat-surface-low cursor-pointer"
              style={{ borderColor: 'var(--outline)' }}
            >
              {isLoading ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              {label('platform.logs.refresh', '刷新')}
            </button>
          </>
        }
      />

      {/* 来源切换 + 行数 + 过滤 */}
      <div className="flex items-center gap-2.5 flex-wrap mb-3 shrink-0">
        <FilterChips
          items={SOURCES.map(s => ({ key: s.key, label: s.label }))}
          activeKey={source}
          onChange={key => setSource(key as LogSource)}
        />
        <FilterChips
          size="sm"
          items={LINE_COUNTS.map(n => ({ key: String(n), label: `末 ${n} 行` }))}
          activeKey={String(lineCount)}
          onChange={key => setLineCount(Number(key))}
        />
        <div className="flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5" style={{ borderColor: 'var(--outline)' }}>
          <Search className="w-3.5 h-3.5 text-plat-muted" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={label('platform.logs.filter', '过滤关键字（sessionId / error…）')}
            className="bg-transparent outline-none text-[12.5px] text-plat-ink w-52 placeholder:text-plat-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => setErrorsOnly(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
          style={
            errorsOnly
              ? { background: 'var(--st-crit-bg)', color: 'var(--st-crit-t)' }
              : { background: 'var(--surface-mid)', color: 'var(--ink-2)' }
          }
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {label('platform.logs.errorsOnly', '仅错误')}
          {errorCount > 0 && <span className="font-mono">{errorCount}</span>}
        </button>
        <span className="ml-auto text-[11px] text-plat-muted font-mono truncate max-w-[320px]" title={logPath}>
          {logPath}
        </span>
      </div>

      {/* 日志容器（relative 用于悬浮"回到最新"按钮） */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-auto scrollbar-thin rounded-[14px] border"
          style={{ borderColor: 'var(--outline)', background: 'var(--surface-low)' }}
        >
        {isLoading && lines.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-plat-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            {label('platform.logs.loading', '加载日志…')}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--st-crit-t)' }}>{error}</div>
        ) : missing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="text-[13px] text-plat-muted">{notice}</div>
            <div className="text-[12px] text-plat-muted opacity-70">
              {source === 'agent'
                ? label('platform.logs.agentMissing', 'agent 从未启动 — 扫描任务将无法分发。启动命令：AIG_SERVER=127.0.0.1:8088 ./bin/agent')
                : label('platform.logs.serverMissing', 'server 日志尚未生成')}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-plat-muted">
            {label('platform.logs.empty', '没有匹配的日志行')}
          </div>
        ) : (
          <div className="py-2 font-mono text-[11.5px] leading-[1.7]">
            {notice && (
              <div className="px-4 py-1.5 text-[11px] font-sans" style={{ color: 'var(--st-warn-t)' }}>
                {notice}
              </div>
            )}
            {filtered.map((line, i) => {
              const lv = levelOf(line);
              return (
                <div
                  key={i}
                  className="px-4 whitespace-pre-wrap break-all hover:bg-white/60"
                  style={{ color: LEVEL_COLOR[lv] }}
                >
                  {line}
                </div>
              );
            })}
            <div className="px-4 py-2 text-plat-muted flex items-center gap-1.5 font-sans text-[11px]">
              <ArrowDownToLine className="w-3.5 h-3.5" />
              {label('platform.logs.end', '已到末尾')}
            </div>
          </div>
        )}
        </div>
        {/* 未跟随（用户在翻历史）时显示"回到最新"悬浮按钮 */}
        {!follow && (
          <button
            type="button"
            onClick={() => {
              const el = containerRef.current;
              if (el) el.scrollTop = el.scrollHeight; // 直接滚动，onScroll 会恢复 follow
            }}
            className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-[12px] font-semibold shadow-md cursor-pointer hover:bg-plat-surface-low"
            style={{ borderColor: 'var(--outline)', color: 'var(--brand)' }}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            {label('platform.logs.jumpToLatest', '回到最新')}
          </button>
        )}
      </div>
    </div>
  );
}
