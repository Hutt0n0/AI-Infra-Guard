import * as React from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { modelApi } from '../../../lib/modelApi';
import { agentApi } from '../../../lib/agentApi';
import { evaluationApi } from '../../../lib/evaluationApi';
import AttackMethodSelector from '../../floatingInputArea/AttackMethodSelector';
import { shouldShowModelButton, shouldShowEvalModelButton } from '../../../utils/taskUtils';
import { buildTaskParams } from '../../../lib/taskCreate';
import { SectionCard } from '../primitives';
import { cn } from '../../../lib/utils';
import type { ModelItem } from '../../../types/model';
import type { MCPService } from '../../../config/mcpServices';
import type { ScanSelections } from '../../../lib/taskCreate';

/** 字段框统一样式 */
function FieldBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-white border rounded-[11px] px-3.5 py-2.5 flex items-center gap-2',
        className
      )}
      style={{ borderColor: 'var(--outline)' }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-plat-ink-2 mb-1.5">{children}</div>;
}

export interface ScanFormSubmitArgs {
  taskType: string;
  content: string;
  selections: ScanSelections;
  attachmentFiles: File[];
}

/**
 * 扫描表单 — 按类型渲染字段组；提交时构造与 AI 助手一致的
 * buildTaskParams（同一后端 API 链路）。
 */
export function ScanForm({
  service,
  services,
  onSubmit,
  submitting,
}: {
  service: MCPService;
  services: MCPService[];
  onSubmit: (args: ScanFormSubmitArgs) => void;
  submitting: boolean;
}) {
  const [content, setContent] = React.useState('');
  const [models, setModels] = React.useState<ModelItem[]>([]);
  const [evaluations, setEvaluations] = React.useState<Array<{ name: string; isCustom?: boolean; promptColumn?: string }>>([]);
  const [agentNames, setAgentNames] = React.useState<string[]>([]);
  const [attachmentFiles, setAttachmentFiles] = React.useState<File[]>([]);

  // 表单选中态
  const [selectedModel, setSelectedModel] = React.useState<ModelItem | undefined>();
  const [selectedEvalModel, setSelectedEvalModel] = React.useState<ModelItem | undefined>();
  const [selectedAttackMethods, setSelectedAttackMethods] = React.useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string | undefined>();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // 切换类型时清空状态
  React.useEffect(() => {
    setContent('');
    setSelectedModel(undefined);
    setSelectedEvalModel(undefined);
    setSelectedAttackMethods([]);
    setSelectedAgent(undefined);
    setAttachmentFiles([]);
    setSubmitError(null);
  }, [service.id]);

  // 加载模型/数据集/Agent 配置列表
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modelsRes] = await Promise.all([
          modelApi.getModels(),
        ]);
        if (!cancelled && modelsRes.status === 0) setModels(modelsRes.data ?? []);
      } catch { /* 静默：表单仍可用 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (service.id !== 'Agent-Scan') return;
    let cancelled = false;
    agentApi.getAgentNames().then(res => {
      if (!cancelled && res.status === 0) setAgentNames(res.data ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [service.id]);

  React.useEffect(() => {
    if (service.id !== 'Model-Redteam-Report') return;
    let cancelled = false;
    evaluationApi.getEvaluations().then(res => {
      if (!cancelled && res.status === 0) {
        setEvaluations((res.data?.items ?? []).map((ev: any) => ({ name: ev.name })));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [service.id]);

  const showModel = shouldShowModelButton(service.id) && service.model !== 'no';
  const showEvalModel = shouldShowEvalModelButton(service.id);
  const showAgent = service.id === 'Agent-Scan';
  const showEvaluations = service.id === 'Model-Redteam-Report';
  const showAttachments = service.attachmentTypes.length > 0;
  const needsContent = service.id !== 'Model-Redteam-Report' && service.id !== 'Agent-Scan';

  const canSubmit =
    !submitting &&
    (needsContent ? (content.trim().length > 0 || attachmentFiles.length > 0) : true) &&
    (!showAgent || !!selectedAgent) &&
    (!showModel || service.model === 'multi' ? true : true); // multi 模式允许空（后端可默认）

  const handleSubmit = () => {
    if (!canSubmit) {
      setSubmitError(needsContent && !content.trim() && attachmentFiles.length === 0
        ? '请输入扫描目标或上传附件'
        : '请完成必填项');
      return;
    }
    setSubmitError(null);
    onSubmit({
      taskType: service.id,
      content: content.trim(),
      selections: {
        selectedModel,
        selectedModels: selectedModel ? [selectedModel] : [],
        selectedEvalModel,
        httpHeaders: [],
        selectedEvaluations: evaluations.filter(ev => (ev as any).selected),
        maxEvaluationCount: -1,
        selectedAttackMethods,
        selectedAgent,
        selectedSkills: [],
        selectedTargetAgent: undefined,
      },
      attachmentFiles,
    });
  };

  return (
    <SectionCard
      title={`${service.name} 配置`}
      subtitle="与 AI 助手触发等价 · 参数映射同一后端 API"
    >
      <div className="flex flex-col gap-4">
        {/* 目标输入 */}
        {needsContent && (
          <div>
            <FieldLabel>扫描目标</FieldLabel>
            <FieldBox>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={service.placeholderPrefix || '输入目标 URL / IP / 描述…'}
                rows={2}
                className="flex-1 bg-transparent outline-none resize-none text-[13px] text-plat-ink placeholder:text-plat-muted"
              />
            </FieldBox>
            {showAttachments && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <label
                  className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer rounded-full border px-3 py-1.5 bg-white text-plat-ink-2 hover:bg-plat-surface-low"
                  style={{ borderColor: 'var(--outline)' }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  上传附件（{service.attachmentTypes.join(' / ')}）
                  <input
                    type="file"
                    className="hidden"
                    accept={service.attachmentTypes.join(',')}
                    onChange={e => {
                      const files = Array.from(e.target.files ?? []);
                      if (files[0]) setAttachmentFiles([files[0]]);
                    }}
                  />
                </label>
                {attachmentFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs text-plat-ink-2 bg-plat-surface-low rounded-full px-2.5 py-1">
                    {f.name}
                    <button type="button" onClick={() => setAttachmentFiles([])} className="cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 分析模型（单选） */}
        {showModel && service.model !== 'multi' && (
          <div>
            <FieldLabel>分析模型</FieldLabel>
            <FieldBox>
              <select
                value={selectedModel?.model_id ?? ''}
                onChange={e => setSelectedModel(models.find(m => m.model_id === e.target.value))}
                className="flex-1 bg-transparent outline-none text-[13px] text-plat-ink"
              >
                <option value="">选择模型…</option>
                {models.map(m => (
                  <option key={m.model_id} value={m.model_id}>{m.model?.model || m.model_id}</option>
                ))}
              </select>
            </FieldBox>
          </div>
        )}

        {/* 评分模型 */}
        {showEvalModel && (
          <div>
            <FieldLabel>评分模型（可选）</FieldLabel>
            <FieldBox>
              <select
                value={selectedEvalModel?.model_id ?? ''}
                onChange={e => setSelectedEvalModel(models.find(m => m.model_id === e.target.value))}
                className="flex-1 bg-transparent outline-none text-[13px] text-plat-ink"
              >
                <option value="">不使用</option>
                {models.map(m => (
                  <option key={m.model_id} value={m.model_id}>{m.model?.model || m.model_id}</option>
                ))}
              </select>
            </FieldBox>
          </div>
        )}

        {/* Agent 配置（Agent-Scan） */}
        {showAgent && (
          <div>
            <FieldLabel>Agent 配置</FieldLabel>
            <FieldBox>
              <select
                value={selectedAgent ?? ''}
                onChange={e => setSelectedAgent(e.target.value || undefined)}
                className="flex-1 bg-transparent outline-none text-[13px] text-plat-ink"
              >
                <option value="">选择 Agent 配置…</option>
                {agentNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </FieldBox>
          </div>
        )}

        {/* 评测数据集（Model-Redteam-Report） */}
        {showEvaluations && evaluations.length > 0 && (
          <div>
            <FieldLabel>评测数据集（不选则使用输入内容）</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {evaluations.map(ev => {
                const selected = !!(ev as any).selected;
                return (
                  <button
                    key={ev.name}
                    type="button"
                    onClick={() => setEvaluations(prev => prev.map(e2 =>
                      e2.name === ev.name ? { ...e2, ...{ selected: !selected } } : e2
                    ))}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer',
                      selected ? 'text-white border-transparent' : 'bg-white text-plat-ink-2 hover:bg-plat-surface-low'
                    )}
                    style={selected ? { background: 'var(--brand)' } : { borderColor: 'var(--outline)' }}
                  >
                    {ev.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 攻击方法（Model-Redteam-Report） */}
        {showEvaluations && (
          <div>
            <FieldLabel>攻击方法</FieldLabel>
            <AttackMethodSelector
              selectedMethods={selectedAttackMethods}
              onMethodsSelect={setSelectedAttackMethods}
              taskType={service.id}
            />
          </div>
        )}

        {/* 提交 */}
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-[7px] rounded-[11px] px-[22px] py-2.5 text-[13px] font-semibold text-white cursor-pointer disabled:opacity-60 hover:opacity-90"
            style={{ background: 'var(--brand)', boxShadow: '0 6px 16px rgba(93,95,239,.32)' }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            发起扫描
          </button>
          {submitError && (
            <span className="text-xs" style={{ color: 'var(--st-crit-t)' }}>{submitError}</span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
