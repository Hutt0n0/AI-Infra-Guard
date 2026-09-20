import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../primitives';
import type { DataTableColumn } from '../primitives';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';

/**
 * 后端 PromptCollection（common/websocket/knowledge2_api.go）— GET 列表返回全量。
 * 阶段 9 已修复 DELETE 路由（原 DELETE("") 无 :id 导致恒 400），删除已可用。
 */
interface PromptCollection {
  id: string;
  product: string;
  prompt: string;
  model_version: string;
  update_date: string;
  code_exec: boolean;
  upload_file: boolean;
  multi_modal: boolean;
  web_search: boolean;
  sec_policies: boolean;
  affiliation: string;
}

const API = '/api/v1/knowledge/prompt_collections';

const CAP_KEYS = [
  { key: 'code_exec', labelKey: 'platform.ruleLibrary.capCodeExec', fallback: '代码执行' },
  { key: 'upload_file', labelKey: 'platform.ruleLibrary.capUploadFile', fallback: '文件上传' },
  { key: 'multi_modal', labelKey: 'platform.ruleLibrary.capMultiModal', fallback: '多模态' },
  { key: 'web_search', labelKey: 'platform.ruleLibrary.capWebSearch', fallback: '联网搜索' },
  { key: 'sec_policies', labelKey: 'platform.ruleLibrary.capSecPolicies', fallback: '安全策略' },
] as const;

/**
 * 规则库 · 提示词集 Tab — 真实对接 /knowledge/prompt_collections（GET 全量 + POST 新建 + PUT 编辑）。
 * 当前后端数据目录无预置集合（total=0 为真实空态）。
 * 已知后端缺陷：DELETE 路由参数缺失导致删除恒 400（前端禁用删除并标注）。
 */
export default function PromptSetTabContent() {
  const { t, ready } = useTranslation();
  const [rows, setRows] = React.useState<PromptCollection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchDraft, setSearchDraft] = React.useState('');
  const [detail, setDetail] = React.useState<PromptCollection | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PromptCollection | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // 新建表单（仅 id/product/prompt 三个核心字段；能力开关默认 false，编辑走 PUT）
  const [formId, setFormId] = React.useState('');
  const [formProduct, setFormProduct] = React.useState('');
  const [formPrompt, setFormPrompt] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (data.status === 0) {
        // 过滤 null/无效项（后端 HandleList 对非匹配文件可能产出 null 条目）
        setRows((Array.isArray(data.data?.items) ? data.data.items : []).filter((r: any) => r && typeof r === 'object' && r.id));
      } else {
        toast.error(data.message || label('platform.ruleLibrary.promptLoadFailed', '获取提示词集失败'));
      }
    } catch {
      toast.error(label('platform.ruleLibrary.promptLoadFailed', '获取提示词集失败'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    const q = searchDraft.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      `${r.id}`.toLowerCase().includes(q) ||
      `${r.product}`.toLowerCase().includes(q) ||
      `${r.prompt}`.toLowerCase().includes(q)
    );
  }, [rows, searchDraft]);

  const handleCreate = async () => {
    const id = formId.trim();
    if (!id) {
      toast.error(label('platform.ruleLibrary.promptIdRequired', '请填写集合 ID'));
      return;
    }
    setCreating(true);
    try {
      const payload: PromptCollection = {
        id,
        product: formProduct.trim(),
        prompt: formPrompt,
        model_version: '',
        update_date: new Date().toISOString().slice(0, 10),
        code_exec: false, upload_file: false, multi_modal: false,
        web_search: false, sec_policies: false, affiliation: '',
      };
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify(payload) }),
      });
      const data = await res.json();
      if (data.status === 0) {
        toast.success(label('platform.ruleLibrary.promptCreated', '提示词集已创建'));
        setCreateOpen(false);
        setFormId(''); setFormProduct(''); setFormPrompt('');
        load();
      } else {
        toast.error(data.message || label('platform.ruleLibrary.promptCreateFailed', '创建失败'));
      }
    } catch {
      toast.error(label('platform.ruleLibrary.promptCreateFailed', '创建失败'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 0) {
        toast.success(label('platform.ruleLibrary.promptDeleted', '提示词集已删除'));
        setDeleteTarget(null);
        load();
      } else {
        toast.error(data.message || label('platform.ruleLibrary.promptDeleteFailed', '删除失败'));
      }
    } catch {
      toast.error(label('platform.ruleLibrary.promptDeleteFailed', '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<PromptCollection>[] = [
    {
      key: 'id',
      header: label('platform.ruleLibrary.promptColId', '集合 ID'),
      width: '22%',
      cell: r => (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-plat-ink truncate font-mono">{r.id}</div>
          {r.product && <div className="text-[11.5px] text-plat-muted truncate">{r.product}</div>}
        </div>
      ),
    },
    {
      key: 'prompt',
      header: label('platform.ruleLibrary.promptColPrompt', '提示词摘要'),
      cell: r => <span className="text-[12.5px] text-plat-ink-2 line-clamp-2">{(r.prompt || '—').slice(0, 120)}</span>,
    },
    {
      key: 'caps',
      header: label('platform.ruleLibrary.promptColCaps', '能力开关'),
      cell: r => (
        <div className="flex flex-wrap gap-1">
          {CAP_KEYS.filter(c => (r as any)[c.key]).map(c => (
            <span
              key={c.key}
              className="inline-flex rounded-full px-2 py-px text-[10.5px] font-semibold"
              style={{ background: 'var(--surface-mid)', color: 'var(--brand-deep)' }}
            >
              {label(c.labelKey, c.fallback)}
            </span>
          ))}
          {!CAP_KEYS.some(c => (r as any)[c.key]) && <span className="text-plat-muted text-xs">—</span>}
        </div>
      ),
    },
    {
      key: 'version',
      header: label('platform.ruleLibrary.promptColVersion', '模型版本'),
      cell: r => <span className="text-[12px] text-plat-ink-2">{r.model_version || '—'}</span>,
    },
    {
      key: 'updated',
      header: label('platform.ruleLibrary.promptColUpdated', '更新日期'),
      cell: r => <span className="text-[12px] text-plat-muted font-mono">{r.update_date || '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: r => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setDetail(r); }}
            className="text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--brand-deep)' }}
          >
            {label('platform.ruleLibrary.promptView', '查看')}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setDeleteTarget(r); }}
            className="text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--st-crit-t)' }}
          >
            {label('platform.ruleLibrary.promptDelete', '删除')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* 工具行：搜索 + 新建 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5" style={{ borderColor: 'var(--outline)' }}>
          <Search className="w-3.5 h-3.5 text-plat-muted" />
          <input
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            placeholder={label('platform.ruleLibrary.promptSearch', '搜索集合 ID / 产品 / 提示词…')}
            className="bg-transparent outline-none text-[12.5px] text-plat-ink w-56 placeholder:text-plat-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="ml-auto inline-flex items-center gap-[7px] rounded-[11px] px-[15px] py-2 text-[13px] font-semibold text-white cursor-pointer hover:opacity-90"
          style={{ background: 'var(--brand)' }}
        >
          <Plus className="w-[15px] h-[15px]" />
          {label('platform.ruleLibrary.promptNew', '新建集合')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-plat-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          {label('platform.ruleLibrary.promptLoading', '加载提示词集…')}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={r => r.id}
            onRowClick={r => setDetail(r)}
            empty={searchDraft
              ? label('platform.ruleLibrary.promptSearchEmpty', '无匹配的提示词集')
              : label('platform.ruleLibrary.promptEmpty', '暂无提示词集 — 点击「新建集合」创建')}
          />
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderTopColor: 'var(--plat-grid)' }}>
            <span className="text-[11.5px] text-plat-muted">
              {label('platform.ruleLibrary.promptTotal', '共 {{count}} 个集合').replace('{{count}}', String(rows.length))}
            </span>
          </div>
        </>
      )}

      {/* 详情查看 */}
      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-w-[640px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail?.product || label('platform.ruleLibrary.promptDetailSub', '提示词集合详情')}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-[13px]">
              <div className="flex flex-wrap gap-1.5">
                {CAP_KEYS.filter(c => (detail as any)[c.key]).map(c => (
                  <span
                    key={c.key}
                    className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: 'var(--brand-fixed)', color: 'var(--brand-deep)' }}
                  >
                    {label(c.labelKey, c.fallback)}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div><span className="text-plat-muted">{label('platform.ruleLibrary.promptColVersion', '模型版本')}：</span>{detail.model_version || '—'}</div>
                <div><span className="text-plat-muted">{label('platform.ruleLibrary.promptColUpdated', '更新日期')}：</span>{detail.update_date || '—'}</div>
                {detail.affiliation && (
                  <div><span className="text-plat-muted">{label('platform.ruleLibrary.promptAffiliation', '归属')}：</span>{detail.affiliation}</div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-plat-ink-2 mb-1">{label('platform.ruleLibrary.promptColPrompt', '提示词')}</div>
                <pre
                  className="whitespace-pre-wrap text-[12px] leading-relaxed bg-plat-surface-low rounded-[10px] p-3 max-h-[300px] overflow-y-auto scrollbar-thin font-mono"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {detail.prompt || '—'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建集合 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label('platform.ruleLibrary.promptNew', '新建集合')}</DialogTitle>
            <DialogDescription>
              {label('platform.ruleLibrary.promptNewDesc', '创建一个提示词集合（数据存于 data/prompt_collections）')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-plat-ink-2 block mb-1">
                {label('platform.ruleLibrary.promptFormId', '集合 ID *')}
              </label>
              <input
                value={formId}
                onChange={e => setFormId(e.target.value)}
                placeholder="e.g. my-prompt-set"
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-plat-brand font-mono"
                style={{ borderColor: 'var(--outline)' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-plat-ink-2 block mb-1">
                {label('platform.ruleLibrary.promptFormProduct', '产品名称')}
              </label>
              <input
                value={formProduct}
                onChange={e => setFormProduct(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-plat-brand"
                style={{ borderColor: 'var(--outline)' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-plat-ink-2 block mb-1">
                {label('platform.ruleLibrary.promptFormPrompt', '提示词')}
              </label>
              <textarea
                value={formPrompt}
                onChange={e => setFormPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-plat-brand resize-none font-mono"
                style={{ borderColor: 'var(--outline)' }}
              />
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11.5px] text-plat-muted">
              <FileText className="w-3.5 h-3.5" />
              {label('platform.ruleLibrary.promptNewHint', '能力开关等高级字段创建后可在数据文件中调整')}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {label('common.cancel', '取消')}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {label('platform.ruleLibrary.promptCreate', '创建')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label('platform.ruleLibrary.promptDeleteTitle', '删除提示词集')}</DialogTitle>
            <DialogDescription>
              {label('platform.ruleLibrary.promptDeleteDesc', '确定删除「{{id}}」吗？该操作不可恢复。').replace('{{id}}', deleteTarget?.id || '')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {label('common.cancel', '取消')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {label('common.delete', '删除')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
