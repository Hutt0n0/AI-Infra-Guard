import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCircle2, XCircle, PlayCircle, Trash2, FileBarChart2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * 通知中心 — Topbar 铃铛下拉。
 * 数据源：AppContext 轮询触发的 window 'taskStatusChanged' CustomEvent
 * （detail: {taskId, taskTitle, oldStatus, newStatus, timestamp}，AppContext.tsx）。
 * 本地持久化 sessionStorage（会话内保留，刷新清空——后端无通知表，不伪造历史）。
 */

export interface NotificationItem {
  id: string;
  taskId: string;
  taskTitle: string;
  newStatus: 'completed' | 'error' | 'running' | 'terminated' | string;
  timestamp: number;
  read: boolean;
}

const STORAGE_KEY = 'aig.notifications';
const MAX_ITEMS = 30;

function loadStored(): NotificationItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotificationItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: NotificationItem[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch { /* 空间满静默 */ }
}

const STATUS_STYLE: Record<string, { icon: React.ElementType; color: string; labelKey: string; fallback: string }> = {
  completed: { icon: CheckCircle2, color: 'var(--st-good-t)', labelKey: 'platform.notify.completed', fallback: '已完成' },
  error: { icon: XCircle, color: 'var(--st-crit-t)', labelKey: 'platform.notify.failed', fallback: '失败' },
  running: { icon: PlayCircle, color: 'var(--st-info-t)', labelKey: 'platform.notify.started', fallback: '已开始' },
  terminated: { icon: XCircle, color: 'var(--ink-2)', labelKey: 'platform.notify.terminated', fallback: '已终止' },
};

export default function NotificationBell() {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[]>(loadStored);
  const popRef = React.useRef<HTMLDivElement>(null);
  const bellRef = React.useRef<HTMLButtonElement>(null);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  // 监听任务状态变化事件（AppContext 轮询触发）
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.taskId) return;
      setItems(prev => {
        const item: NotificationItem = {
          id: `${detail.taskId}-${detail.newStatus}-${detail.timestamp ?? Date.now()}`,
          taskId: detail.taskId,
          taskTitle: detail.taskTitle || detail.taskId,
          newStatus: detail.newStatus,
          timestamp: detail.timestamp instanceof Date ? detail.timestamp.getTime() : (detail.timestamp ?? Date.now()),
          read: false,
        };
        const next = [item, ...prev.filter(x => x.taskId !== item.taskId || x.newStatus !== item.newStatus)].slice(0, MAX_ITEMS);
        persist(next);
        return next;
      });
    };
    window.addEventListener('taskStatusChanged', handler);
    return () => window.removeEventListener('taskStatusChanged', handler);
  }, []);

  // 点击外部关闭
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = items.filter(i => !i.read).length;

  const markAllRead = () => {
    setItems(prev => {
      const next = prev.map(i => ({ ...i, read: true }));
      persist(next);
      return next;
    });
  };

  const clearAll = () => {
    setItems([]);
    persist([]);
  };

  const openTask = (item: NotificationItem) => {
    setItems(prev => {
      const next = prev.map(i => (i.id === item.id ? { ...i, read: true } : i));
      persist(next);
      return next;
    });
    setOpen(false);
    if (item.newStatus === 'completed') {
      navigate(`/task/${item.taskId}`);
    } else {
      navigate(`/tasks?sessionId=${item.taskId}`);
    }
  };

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative w-[34px] h-[34px] rounded-[10px] border bg-white grid place-items-center text-plat-ink-2 hover:bg-plat-surface-low transition-colors cursor-pointer"
        style={{ borderColor: 'var(--outline)' }}
        aria-label="notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full text-[10px] font-bold text-white grid place-items-center px-1"
            style={{ background: 'var(--st-crit)', border: '1.5px solid #fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-[42px] w-[360px] bg-card border rounded-[14px] shadow-plat-card overflow-hidden z-50"
          style={{ borderColor: 'var(--outline)', boxShadow: 'var(--shadow-card), 0 12px 32px rgba(11,28,48,.12)' }}
        >
          <div className="flex items-center px-4 py-2.5 border-b" style={{ borderColor: 'var(--plat-grid)' }}>
            <span className="font-head font-semibold text-[13.5px] text-plat-ink">
              {label('platform.notify.title', '通知中心')}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-[11px] font-semibold cursor-pointer" style={{ color: 'var(--brand-deep)' }}>
                  {label('platform.notify.markAllRead', '全部已读')}
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-6 h-6 rounded-[7px] grid place-items-center text-plat-muted hover:bg-plat-surface-low cursor-pointer"
                  aria-label="clear"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] text-plat-muted">
                {label('platform.notify.empty', '暂无通知 — 任务状态变化时会在这里提醒')}
              </div>
            ) : (
              items.map(item => {
                const style = STATUS_STYLE[item.newStatus] ?? STATUS_STYLE.running;
                const Icon = style.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openTask(item)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-4 py-2.5 border-b last:border-b-0 text-left transition-colors cursor-pointer hover:bg-plat-surface-low',
                      !item.read && 'bg-plat-surface-low/50'
                    )}
                    style={{ borderBottomColor: 'var(--plat-grid)' }}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: style.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-plat-ink truncate">
                        {item.taskTitle}
                        <span className="ml-1.5 font-semibold" style={{ color: style.color }}>
                          {label(style.labelKey, style.fallback)}
                        </span>
                      </div>
                      <div className="text-[11px] text-plat-muted font-mono mt-0.5">{fmtTime(item.timestamp)}</div>
                    </div>
                    {item.newStatus === 'completed' && (
                      <FileBarChart2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-plat-muted" />
                    )}
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--brand)' }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
