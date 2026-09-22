import React from 'react';
import { ideApi, type IdeRunMeta, type IdeRunOutput } from '../../lib/ideApi';

/**
 * 运行输出轮询 hook:700ms 增量拉取(offset 字节),终态且追平后停止。
 * 切换历史 run 时 offset 归零重放到追平。
 */
export function useRunPolling() {
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<IdeRunMeta | null>(null);
  const [lines, setLines] = React.useState<string[]>([]);
  const offsetRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const terminalRef = React.useRef(false);

  const stopTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const applyOutput = (d: IdeRunOutput) => {
    setRun({
      run_id: d.run_id,
      kind: d.kind,
      script: d.script,
      status: d.status,
      exit_code: d.exit_code,
      message: d.message,
      created_at: d.created_at,
      finished_at: d.finished_at,
      duration_ms: d.duration_ms,
      output_size: d.size,
      output_truncated: d.output_truncated,
    });
    if (d.output) {
      // 增量文本按行合并(保留最后一段未换行的内容)
      setLines(prev => {
        const merged = [...prev];
        const parts = d.output.split('\n');
        if (merged.length > 0 && parts.length > 0) {
          // 最后一行可能是未完成的行:拼接
          const last = merged.pop() as string;
          parts[0] = last + parts[0];
        }
        return [...merged, ...parts];
      });
    }
    offsetRef.current = d.next_offset;
    return d.status !== 'running';
  };

  const pollOnce = React.useCallback(async (runId: string) => {
    try {
      const d = await ideApi.getRunOutput(runId, offsetRef.current);
      const terminal = applyOutput(d);
      if (terminal && offsetRef.current >= d.size) {
        // 终态且已追平 → 停止轮询
        stopTimer();
        terminalRef.current = true;
      }
    } catch {
      // 瞬时错误忽略,下轮重试
    }
  }, []);

  const follow = React.useCallback((runId: string, reset: boolean) => {
    stopTimer();
    terminalRef.current = false;
    setActiveRunId(runId);
    if (reset) {
      offsetRef.current = 0;
      setLines([]);
      setRun(null);
    }
    // 立即拉一次,然后 700ms 间隔
    pollOnce(runId);
    timerRef.current = window.setInterval(() => pollOnce(runId), 700);
  }, [pollOnce]);

  const startRun = React.useCallback(async (runId: string) => {
    follow(runId, true);
  }, [follow]);

  const viewHistorical = React.useCallback((runId: string) => {
    follow(runId, true);
  }, [follow]);

  React.useEffect(() => stopTimer, []);

  return { activeRunId, run, lines, startRun, viewHistorical, setRun };
}
