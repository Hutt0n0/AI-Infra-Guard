/**
 * 任务列表导出 CSV — 纯前端 Blob 下载（一期不依赖后端）。
 * 导出范围 = 当前筛选结果（rows 已由调用方过滤排序）。
 * BOM 头保证 Excel 正确识别 UTF-8。
 */

export interface TaskCsvRow {
  sessionId: string;
  title: string;
  taskType: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  target?: string;
  progress?: number;
  /** 阶段 9 后端扩展字段 */
  riskCount?: number;
  score?: number;
  agentNode?: string;
}

function csvEscape(value: string): string {
  // 引号/逗号/换行统一裹引号并转义内部引号
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function tasksToCsv(rows: TaskCsvRow[]): string {
  const header = ['sessionId', 'title', 'taskType', 'status', 'agentNode', 'riskCount', 'score', 'progress', 'createdAt', 'updatedAt'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.sessionId,
      csvEscape(r.title || ''),
      r.taskType,
      r.status,
      csvEscape(r.agentNode || ''),
      r.riskCount != null ? String(r.riskCount) : '',
      r.score != null ? String(r.score) : '',
      r.progress != null ? String(Math.round(r.progress)) : '',
      fmtTime(r.createdAt),
      fmtTime(r.updatedAt),
    ].join(','));
  }
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM 前缀保证 Excel 正确识别 UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
