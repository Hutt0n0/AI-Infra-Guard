import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExecutionStep, Task, MessageTraceEntry } from '../../types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Loader2,
  MessagesSquare,
  ShieldAlert,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';

/**
 * ScanProgressConsole — 扫描执行流（面向安全专家的全量过程审计视图）。
 *
 * 参考 IDE 调试器的双栏形态：
 *  - 左列：统一时间序条目流。LLM API 调用与工具调用按发生顺序混排，
 *    每个条目一行（状态图标 + 名称 + 单行预览 + 时间戳），按阶段插入分组行。
 *  - 右侧：选中条目的完整详情。LLM 条目展示发往模型的完整 messages 数组
 *    （system / 每轮对话 / 工具回填）与原始响应；工具条目展示参数与输出。
 *  - 顶部：阶段过滤（信息收集 / 漏洞检测 / 漏洞整理）。
 *
 * 数据来源（无新增后端事件类型）：
 *  - plan step（1/2/3 主阶段；并行 worker 的 subStep 以 "2a".."2j" 挂在阶段2下）
 *  - subStep.toolUsed：llm_chat 条目的 actionLog 为 JSON，承载完整 LLM API trace；
 *    其余条目的 actionLog 承载工具输出
 */

export interface LlmTrace {
  model: string;
  iteration?: number;
  stage?: string;
  messages: Array<{ role: string; content: string }>;
  response: string;
}

interface StreamEntry {
  key: string;
  kind: 'llm' | 'tool';
  stageId: string; // "1" | "2" | "3"
  subId: string; // subStep id：worker 为 "2a".."2j"，顺序阶段为 statusId
  stepTitle: string;
  title: string;
  preview: string;
  status: string;
  time?: Date;
  trace?: LlmTrace;
  params?: string;
  output?: string;
}

const STAGE_DEFS: Array<{ id: string; zh: string; en: string }> = [
  { id: '1', zh: '信息收集', en: 'Info Collection' },
  { id: '2', zh: '漏洞检测', en: 'Vulnerability Detection' },
  { id: '3', zh: '漏洞整理', en: 'Vulnerability Review' },
];

const stageLabel = (id: string, lang: string) => {
  const def = STAGE_DEFS.find(s => s.id === id);
  if (!def) return id;
  return lang.startsWith('zh') ? def.zh : def.en;
};

export const parseLlmTrace = (actionLog: string): LlmTrace | null => {
  if (!actionLog) return null;
  try {
    const payload = JSON.parse(actionLog);
    if (!Array.isArray(payload.messages)) return null;
    return {
      model: payload.model || '',
      iteration: payload.iteration,
      stage: payload.stage || '',
      messages: payload.messages,
      response: payload.response || '',
    };
  } catch {
    return null;
  }
};

interface ScanProgressConsoleProps {
  task: Task;
  stageFilter?: string | null;
  onStageFilterChange?: (stageId: string | null) => void;
  // Shown as a "Back" button for ended tasks so the user can return to the
  // report view; running tasks default to the console so no back is needed.
  onBack?: () => void;
}

const ScanProgressConsole: React.FC<ScanProgressConsoleProps> = ({
  task,
  stageFilter,
  onStageFilterChange,
  onBack,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'zh';
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  // View mode: execution stream vs target-communication traces
  const [viewMode, setViewMode] = useState<'stream' | 'traces'>('stream');
  const listBottomRef = useRef<HTMLDivElement>(null);

  // ---- build the unified stream: LLM calls + tool calls, chronological ----
  const { entries, findings } = useMemo(() => {
    const list: StreamEntry[] = [];
    const workerNames: Record<string, string> = {};
    let vulnCount = 0;
    for (const step of task.plan) {
      for (const sub of step.subSteps || []) {
        for (const tool of sub.toolUsed || []) {
          const trace = parseLlmTrace(tool.actionLog || '');
          if (trace) {
            if (trace.stage) workerNames[sub.id] = trace.stage;
            list.push({
              key: tool.toolId || tool.id || `${sub.id}-${list.length}`,
              kind: 'llm',
              stageId: step.id,
              subId: sub.id,
              stepTitle: trace.stage || step.title,
              title: tool.brief || `LLM Call`,
              preview: trace.response.slice(0, 160).replace(/\s+/g, ' '),
              status: tool.status,
              time: tool.timestamp,
              trace,
            });
          } else {
            const resultText = tool.result || '';
            if (resultText.includes('<vuln>')) vulnCount += 1;
            list.push({
              key: tool.toolId || tool.id || `${sub.id}-${list.length}`,
              kind: 'tool',
              stageId: step.id,
              subId: sub.id,
              stepTitle: workerNames[sub.id] || step.title,
              title: tool.tool || tool.brief || 'tool',
              preview: (tool.message?.param || tool.brief || '').slice(0, 160).replace(/\s+/g, ' '),
              status: tool.status,
              time: tool.timestamp,
              params: tool.message?.param || '',
              output: tool.actionLog || resultText || '',
            });
          }
        }
      }
    }
    // Stable chronological order: timestamp first, arrival order as tiebreaker
    list.forEach((e, idx) => ((e as any).seq = idx));
    list.sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0) || (a as any).seq - (b as any).seq);
    return { entries: list, findings: vulnCount };
  }, [task.plan]);

  const filtered = useMemo(() => {
    if (!stageFilter) return entries;
    // Worker subSteps ("2a") live under stage "2"; match by stage prefix.
    return entries.filter(e => e.stageId === stageFilter || e.subId.startsWith(stageFilter));
  }, [entries, stageFilter]);

  // Auto-follow the newest entry until the user selects one manually
  useEffect(() => {
    if (follow && filtered.length > 0) {
      setSelectedKey(filtered[filtered.length - 1].key);
      listBottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [follow, filtered]);

  const selected = useMemo(
    () => filtered.find(e => e.key === selectedKey) || null,
    [filtered, selectedKey]
  );

  const handleSelect = (key: string) => {
    setFollow(false);
    setSelectedKey(key);
  };

  const fmtTime = (d?: Date) =>
    d ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d) : '';

  const availableStages = useMemo(() => {
    const ids = new Set(entries.map(e => e.stageId));
    return STAGE_DEFS.filter(s => ids.has(s.id));
  }, [entries]);

  return (
    <div className="w-full h-full bg-white flex flex-col min-w-[320px] relative">
      {/* View tabs: execution stream / target-communication traces */}
      <div className="px-3 pt-2 border-b border-gray-200 flex items-center gap-1 flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1.5 mr-1 text-xs text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {t('scanConsole.back', '返回')}
          </button>
        )}
        <button
          onClick={() => setViewMode('stream')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
            viewMode === 'stream'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          {t('scanConsole.streamTitle', '扫描执行流')}
        </button>
        <button
          onClick={() => setViewMode('traces')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
            viewMode === 'traces'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          {t('scanConsole.traceTitle', '目标通信')}
          {(task.traces?.length || 0) > 0 && (
            <span className="text-[10px] font-mono text-gray-400">
              {task.traces!.length}
            </span>
          )}
        </button>
      </div>

      {/* Target-communication trace stream view */}
      {viewMode === 'traces' ? (
        <TraceStreamView traces={task.traces || []} />
      ) : (
        <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-gray-700 flex-shrink-0" />
          <h3 className="font-semibold text-sm text-gray-900 whitespace-nowrap">
            {t('scanConsole.streamTitle', '扫描执行流')}
          </h3>
          {findings > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-600 font-medium flex-shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" /> {t('agentScan.findings')} {findings}
            </span>
          )}
        </div>
        {/* Stage filter chips */}
        <div className="flex items-center gap-1 flex-shrink-0 overflow-x-auto">
          <FilterChip
            active={!stageFilter}
            label={t('scanConsole.filterAll', '全部')}
            onClick={() => onStageFilterChange?.(null)}
          />
          {availableStages.map(s => (
            <FilterChip
              key={s.id}
              active={stageFilter === s.id}
              label={stageLabel(s.id, lang)}
              onClick={() => onStageFilterChange?.(s.id)}
            />
          ))}
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: stream list */}
        <div className="w-[46%] max-w-[46%] border-r border-gray-200 overflow-y-auto min-h-0 bg-gray-50/60">
          {filtered.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-10">
              {t('scanConsole.noEntries', '暂无执行条目（等待扫描开始）')}
            </div>
          )}
          {filtered.map((e, idx) => {
            const prev = filtered[idx - 1];
            const showGroup = !prev || prev.stageId !== e.stageId;
            return (
              <React.Fragment key={e.key}>
                {showGroup && (
                  <div className="px-3 pt-3 pb-1 flex items-center gap-2 sticky top-0 bg-gray-50/95 backdrop-blur z-10">
                    <span className="text-[10px] font-mono text-gray-400">{e.stageId}</span>
                    <span className="text-[11px] font-medium text-gray-500">{stageLabel(e.stageId, lang)}</span>
                    <span className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <EntryRow
                  entry={e}
                  selected={e.key === selectedKey}
                  onClick={() => handleSelect(e.key)}
                  fmtTime={fmtTime}
                />
              </React.Fragment>
            );
          })}
          <div ref={listBottomRef} />
        </div>

        {/* Right: entry detail */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-300">
              {t('scanConsole.selectEntry', '选择左侧条目查看完整详情')}
            </div>
          ) : selected.kind === 'llm' ? (
            <LlmDetailView entry={selected} fmtTime={fmtTime} />
          ) : (
            <ToolDetailView entry={selected} fmtTime={fmtTime} />
          )}
        </div>
      </div>

      {/* Follow indicator */}
      {!follow && filtered.length > 0 && (
        <button
          onClick={() => {
            setFollow(true);
            setSelectedKey(filtered[filtered.length - 1].key);
          }}
          className="absolute bottom-4 right-6 z-20 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs shadow-lg hover:bg-blue-700 transition-colors"
        >
          {t('scanConsole.followLatest', '跟随最新')} ↓
        </button>
      )}
        </>
      )}
    </div>
  );
};

// ================= Filter chip =================

const FilterChip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({
  active,
  label,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

// ================= Entry row (left list) =================

const EntryRow: React.FC<{
  entry: StreamEntry;
  selected: boolean;
  onClick: () => void;
  fmtTime: (d?: Date) => string;
}> = ({ entry, selected, onClick, fmtTime }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-1.5 border-l-2 transition-colors ${
      selected
        ? 'bg-blue-50 border-blue-500'
        : 'border-transparent hover:bg-gray-100'
    }`}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      <EntryIcon kind={entry.kind} status={entry.status} />
      <span
        className={`text-xs font-medium truncate flex-shrink-0 ${
          entry.kind === 'llm' ? 'text-purple-700' : 'text-blue-700'
        }`}
      >
        {entry.title}
      </span>
      <span className="text-[11px] text-gray-400 truncate flex-1">{entry.preview}</span>
      <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">{fmtTime(entry.time)}</span>
    </div>
  </button>
);

const EntryIcon: React.FC<{ kind: 'llm' | 'tool'; status: string }> = ({ kind, status }) => {
  if (status === 'doing') return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />;
  if (status === 'done')
    return kind === 'llm' ? (
      <Brain className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
    ) : (
      <Wrench className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
    );
  return <CircleDot className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />;
};

// ================= Detail: field row helper =================

const FieldRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start gap-3 py-1">
    <span className="text-[11px] text-gray-400 font-mono w-24 flex-shrink-0">{label}</span>
    <span className="text-xs text-gray-800 font-mono break-all min-w-0">{value}</span>
  </div>
);

const statusBadge = (status: string) =>
  status === 'done' ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
      <CheckCircle className="w-3 h-3" /> done
    </span>
  ) : status === 'doing' ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
      <Loader2 className="w-3 h-3 animate-spin" /> doing
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
      <CircleDot className="w-3 h-3" /> {status}
    </span>
  );

// ================= Detail: LLM call =================

const ROLE_LABEL: Record<string, string> = {
  system: 'SYSTEM',
  user: 'USER',
  assistant: 'ASSISTANT',
};

const LlmDetailView: React.FC<{ entry: StreamEntry; fmtTime: (d?: Date) => string }> = ({
  entry,
  fmtTime,
}) => {
  const { t } = useTranslation();
  const trace = entry.trace!;
  const [openMsgIdx, setOpenMsgIdx] = useState<number | null>(null);
  const [openRes, setOpenRes] = useState(true);
  const lastMsgIdx = trace.messages.length - 1;

  return (
    <div className="p-4 space-y-3">
      {/* Title + meta fields */}
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-semibold text-gray-900">{entry.title}</span>
        {statusBadge(entry.status)}
        <span className="ml-auto text-[10px] text-gray-300 font-mono">{fmtTime(entry.time)}</span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 divide-y divide-gray-100">
        <FieldRow label="step" value={`${entry.subId} · ${entry.stepTitle}`} />
        <FieldRow label="model" value={trace.model || '—'} />
        {trace.iteration !== undefined && <FieldRow label="iteration" value={String(trace.iteration)} />}
        <FieldRow label="messages" value={`${trace.messages.length} ${t('scanConsole.msgUnit', '条')}`} />
      </div>

      {/* Full messages array */}
      <div className="text-[11px] font-medium text-gray-500 pt-1">
        {t('scanConsole.requestMessages', '请求 messages 数组（完整 API 输入）')}
      </div>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {trace.messages.map((m, idx) => {
          const role = (m.role || '').toLowerCase();
          const isLast = idx === lastMsgIdx;
          const label = ROLE_LABEL[role] || role.toUpperCase();
          const color =
            role === 'system'
              ? 'text-amber-700 bg-amber-50/50'
              : role === 'assistant'
                ? 'text-green-700 bg-green-50/30'
                : 'text-blue-700 bg-blue-50/30';
          const open = openMsgIdx === idx || (openMsgIdx === null && isLast);
          return (
            <div key={idx} className="border-b border-gray-100 last:border-b-0">
              <button
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${color}`}
                onClick={() => setOpenMsgIdx(open ? null : idx)}
              >
                <span className="text-[10px] font-bold font-mono flex-shrink-0 w-20">{label}</span>
                {!open && (
                  <span className="text-[11px] text-gray-500 truncate flex-1">
                    {(m.content || '').slice(0, 140).replace(/\n/g, ' ')}
                  </span>
                )}
                {open && <span className="flex-1" />}
                <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">
                  {(m.content || '').length}ch
                </span>
                {open ? (
                  <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                )}
              </button>
              {open && (
                <pre
                  className={`px-3 pb-3 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-96 overflow-y-auto ${color}`}
                >
                  {m.content || '—'}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {/* Raw response */}
      <div className="text-[11px] font-medium text-gray-500 pt-1">
        {t('scanConsole.response', '模型响应（原始输出）')}
      </div>
      <div className="rounded-lg border border-green-200 overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-green-50/50 text-green-700 bg-green-50/40"
          onClick={() => setOpenRes(o => !o)}
        >
          <Bot className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[10px] font-bold font-mono flex-shrink-0 w-20">RESPONSE</span>
          {!openRes && (
            <span className="text-[11px] text-gray-500 truncate flex-1">
              {trace.response.slice(0, 140).replace(/\n/g, ' ')}
            </span>
          )}
          {openRes && <span className="flex-1" />}
          <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">
            {trace.response.length}ch
          </span>
          {openRes ? (
            <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
          )}
        </button>
        {openRes && (
          <pre className="px-3 pb-3 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-[32rem] overflow-y-auto bg-green-50/20">
            {trace.response || '—'}
          </pre>
        )}
      </div>
    </div>
  );
};

// ================= Detail: tool call =================

const ToolDetailView: React.FC<{ entry: StreamEntry; fmtTime: (d?: Date) => string }> = ({
  entry,
  fmtTime,
}) => {
  const { t } = useTranslation();
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-900">{entry.title}</span>
        {statusBadge(entry.status)}
        <span className="ml-auto text-[10px] text-gray-300 font-mono">{fmtTime(entry.time)}</span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 divide-y divide-gray-100">
        <FieldRow label="step" value={`${entry.subId} · ${entry.stepTitle}`} />
        <FieldRow label="tool" value={entry.title} />
      </div>

      {entry.params && (
        <>
          <div className="text-[11px] font-medium text-gray-500 pt-1">
            {t('scanConsole.toolParams', '参数')}
          </div>
          <pre className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-72 overflow-y-auto">
            {entry.params}
          </pre>
        </>
      )}

      {entry.output && (
        <>
          <div className="text-[11px] font-medium text-gray-500 pt-1">
            {t('scanConsole.toolOutput', '输出')}
          </div>
          <pre className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-[32rem] overflow-y-auto">
            {entry.output}
          </pre>
        </>
      )}
      {!entry.params && !entry.output && (
        <div className="text-xs text-gray-300 text-center py-6">
          {t('scanConsole.noDetail', '无更多详情')}
        </div>
      )}
    </div>
  );
};

// ================= Target-communication trace stream =================

interface TraceCall {
  key: string; // traceId
  endpoint: string;
  phase: string;
  attackMethod?: string;
  vulnerability?: string;
  turn?: number;
  planStepId: string;
  request?: MessageTraceEntry;
  response?: MessageTraceEntry;
  error?: MessageTraceEntry;
  lastTime?: Date;
}

export const TraceStreamView: React.FC<{ traces: MessageTraceEntry[] }> = ({ traces }) => {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'request' | 'response' | 'error'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Group traces into calls by traceId (request/response/error triplets)
  const { calls, counts } = useMemo(() => {
    const map = new Map<string, TraceCall>();
    const order: string[] = [];
    const c = { request: 0, response: 0, error: 0 };
    for (const tr of [...traces].sort(
      (a, b) => a.timestamp - b.timestamp
    )) {
      c.request += tr.direction === 'request' ? 1 : 0;
      c.response += tr.direction === 'response' ? 1 : 0;
      c.error += tr.direction === 'error' ? 1 : 0;
      if (!map.has(tr.traceId)) {
        map.set(tr.traceId, {
          key: tr.traceId,
          endpoint: tr.endpoint,
          phase: tr.phase,
          attackMethod: tr.attackMethod,
          vulnerability: tr.vulnerability,
          turn: tr.turn,
          planStepId: tr.planStepId,
        });
        order.push(tr.traceId);
      }
      const call = map.get(tr.traceId)!;
      if (tr.direction === 'request') call.request = tr;
      else if (tr.direction === 'response') call.response = tr;
      else call.error = tr;
      call.lastTime = new Date(tr.timestamp * 1000);
      // Enrich context from whichever entry carries it
      call.attackMethod = call.attackMethod || tr.attackMethod;
      call.vulnerability = call.vulnerability || tr.vulnerability;
    }
    return { calls: order.map(k => map.get(k)!), counts: c };
  }, [traces]);

  const filtered = useMemo(() => {
    if (directionFilter === 'all') return calls;
    return calls.filter(
      c => (directionFilter === 'request' && c.request) ||
           (directionFilter === 'response' && c.response) ||
           (directionFilter === 'error' && (c.error || !c.response))
    );
  }, [calls, directionFilter]);

  useEffect(() => {
    if (follow && filtered.length > 0) {
      setSelectedKey(filtered[filtered.length - 1].key);
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [follow, filtered]);

  const selected = useMemo(
    () => filtered.find(c => c.key === selectedKey) || null,
    [filtered, selectedKey]
  );

  const fmtTime = (d?: Date) =>
    d ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d) : '';

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left: call list */}
      <div className="w-[46%] max-w-[46%] border-r border-gray-200 overflow-y-auto min-h-0 bg-gray-50/60 flex flex-col">
        {/* Direction filter */}
        <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center gap-1 flex-shrink-0">
          <FilterChip active={directionFilter === 'all'} label={t('scanConsole.filterAll', '全部')} onClick={() => setDirectionFilter('all')} />
          <FilterChip active={directionFilter === 'request'} label={`${t('scanConsole.traceReq', '请求')} ${counts.request}`} onClick={() => setDirectionFilter('request')} />
          <FilterChip active={directionFilter === 'response'} label={`${t('scanConsole.traceResp', '响应')} ${counts.response}`} onClick={() => setDirectionFilter('response')} />
          <FilterChip active={directionFilter === 'error'} label={`${t('scanConsole.traceErr', '异常')} ${counts.error}`} onClick={() => setDirectionFilter('error')} />
        </div>
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-10">
            {t('scanConsole.noTraces', '暂无目标通信记录（等待与受测目标交互）')}
          </div>
        )}
        {filtered.map(call => (
          <TraceCallRow
            key={call.key}
            call={call}
            selected={call.key === selectedKey}
            onClick={() => {
              setFollow(false);
              setSelectedKey(call.key);
            }}
            fmtTime={fmtTime}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Right: call detail */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-300">
            {t('scanConsole.selectTrace', '选择左侧调用查看完整往来消息')}
          </div>
        ) : (
          <TraceCallDetail call={selected} fmtTime={fmtTime} />
        )}
      </div>

      {!follow && filtered.length > 0 && (
        <button
          onClick={() => {
            setFollow(true);
            setSelectedKey(filtered[filtered.length - 1].key);
          }}
          className="absolute bottom-4 right-6 z-20 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs shadow-lg hover:bg-blue-700 transition-colors"
        >
          {t('scanConsole.followLatest', '跟随最新')} ↓
        </button>
      )}
    </div>
  );
};

const TraceCallRow: React.FC<{
  call: TraceCall;
  selected: boolean;
  onClick: () => void;
  fmtTime: (d?: Date) => string;
}> = ({ call, selected, onClick, fmtTime }) => {
  const status = call.error || !call.response ? 'error' : 'done';
  const preview =
    (call.response?.payload || call.error?.payload || call.request?.payload || '')
      .slice(0, 120)
      .replace(/\s+/g, ' ');
  const label = call.attackMethod
    ? `${call.attackMethod}${call.turn && call.turn > 1 ? ` · T${call.turn}` : ''}`
    : call.phase || 'call';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 border-l-2 transition-colors ${
        selected ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-100'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {status === 'error' ? (
          <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        )}
        <ArrowUpRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
        <ArrowDownLeft className="w-3 h-3 text-emerald-500 flex-shrink-0 -ml-2" />
        <span className="text-xs font-medium text-gray-800 truncate flex-shrink-0">{label}</span>
        <span className="text-[11px] text-gray-400 truncate flex-1">{preview}</span>
        <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">{fmtTime(call.lastTime)}</span>
      </div>
    </button>
  );
};

const TraceCallDetail: React.FC<{ call: TraceCall; fmtTime: (d?: Date) => string }> = ({
  call,
  fmtTime,
}) => {
  const { t } = useTranslation();
  const [openReq, setOpenReq] = useState(true);
  const [openResp, setOpenResp] = useState(true);

  const parseMeta = (meta?: string): Record<string, any> | null => {
    if (!meta) return null;
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  };
  const reqMeta = parseMeta(call.request?.meta);
  const respMeta = parseMeta(call.response?.meta || call.error?.meta);

  const directionBadge = (label: string, dir: 'req' | 'resp') => (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono w-24 flex-shrink-0 ${
        dir === 'req' ? 'text-blue-700' : 'text-emerald-700'
      }`}
    >
      {dir === 'req' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
      {label}
    </span>
  );

  const metaChips = (meta: Record<string, any> | null) =>
    meta ? (
      <div className="flex flex-wrap gap-1">
        {Object.entries(meta).map(([k, v]) => (
          <span key={k} className="text-[10px] font-mono text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
            {k}={String(v)}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <div className="p-4 space-y-3">
      {/* Title + meta */}
      <div className="flex items-center gap-2 flex-wrap">
        <MessagesSquare className="w-4 h-4 text-gray-700" />
        <span className="text-sm font-semibold text-gray-900">
          {call.attackMethod || call.phase || t('scanConsole.traceCall', '目标调用')}
        </span>
        {(call.attackMethod || call.error || !call.response) && call.vulnerability && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            {call.vulnerability}
          </span>
        )}
        {call.turn !== undefined && call.turn > 1 && (
          <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">turn {call.turn}</span>
        )}
        <span className="ml-auto text-[10px] text-gray-300 font-mono">{fmtTime(call.lastTime)}</span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 divide-y divide-gray-100">
        <FieldRow label="target" value={call.endpoint || '—'} />
        <FieldRow label="phase" value={call.phase || '—'} />
        {call.vulnerability && <FieldRow label="vulnerability" value={call.vulnerability} />}
      </div>

      {/* Request (sent to target) */}
      {call.request && (
        <>
          <div className="text-[11px] font-medium text-gray-500 pt-1">
            {t('scanConsole.traceRequest', '发往目标的消息')}
          </div>
          <div className="rounded-lg border border-blue-200 overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-blue-50/50 bg-blue-50/40 text-blue-700"
              onClick={() => setOpenReq(o => !o)}
            >
              {directionBadge('REQUEST', 'req')}
              {!openReq && (
                <span className="text-[11px] text-gray-500 truncate flex-1">
                  {(call.request.payload || '').slice(0, 140).replace(/\n/g, ' ')}
                </span>
              )}
              {openReq && <span className="flex-1" />}
              <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">
                {(call.request.payload || '').length}ch
              </span>
              {openReq ? (
                <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
              )}
            </button>
            {openReq && (
              <>
                <pre className="px-3 pb-3 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-96 overflow-y-auto bg-blue-50/20">
                  {call.request.payload || '—'}
                </pre>
                {reqMeta && <div className="px-3 pb-2">{metaChips(reqMeta)}</div>}
              </>
            )}
          </div>
        </>
      )}

      {/* Response (from target) */}
      {(call.response || call.error) && (
        <>
          <div className="text-[11px] font-medium text-gray-500 pt-1">
            {call.error ? t('scanConsole.traceError', '目标返回（异常）') : t('scanConsole.traceResponse', '目标返回的消息')}
          </div>
          <div
            className={`rounded-lg border overflow-hidden ${
              call.error ? 'border-red-200' : 'border-emerald-200'
            }`}
          >
            <button
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${
                call.error
                  ? 'bg-red-50/40 text-red-700 hover:bg-red-50/60'
                  : 'bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50/50'
              }`}
              onClick={() => setOpenResp(o => !o)}
            >
              {directionBadge(call.error ? 'ERROR' : 'RESPONSE', 'resp')}
              {!openResp && (
                <span className="text-[11px] text-gray-500 truncate flex-1">
                  {(call.response?.payload || call.error?.payload || '')
                    .slice(0, 140)
                    .replace(/\n/g, ' ')}
                </span>
              )}
              {openResp && <span className="flex-1" />}
              <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">
                {(call.response?.payload || call.error?.payload || '').length}ch
              </span>
              {openResp ? (
                <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
              )}
            </button>
            {openResp && (
              <>
                <pre
                  className={`px-3 pb-3 whitespace-pre-wrap font-mono text-[11px] text-gray-700 max-h-[32rem] overflow-y-auto ${
                    call.error ? 'bg-red-50/20' : 'bg-emerald-50/20'
                  }`}
                >
                  {(call.response?.payload || call.error?.payload) || '—'}
                </pre>
                {respMeta && <div className="px-3 pb-2">{metaChips(respMeta)}</div>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ScanProgressConsole;
