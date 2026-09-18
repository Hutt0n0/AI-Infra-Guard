import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMcpServices } from '../config/mcpServices';
import { useApp } from '../context/AppContext';
import { uploadTaskAttachments, createTaskRequest } from '../lib/taskApi';
import { buildTaskParams, buildTaskCreateBody, generateSessionId } from '../lib/taskCreate';
import { CapabilitySelector } from '../components/platform/scan/CapabilitySelector';
import { ScanForm } from '../components/platform/scan/ScanForm';
import type { ScanFormSubmitArgs } from '../components/platform/scan/ScanForm';
import {
  ScanTemplates, loadScanTemplates, saveScanTemplate, removeScanTemplate,
} from '../components/platform/scan/ScanTemplates';
import type { ScanTemplate } from '../components/platform/scan/ScanTemplates';
import { toast } from 'sonner';

/** 新建扫描 — 表单化配置，与 AI 助手触发等价（同一 buildTaskParams 链路） */
export default function NewScanPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const services = useMcpServices();
  const { actions, state } = useApp();

  const requestedType = searchParams.get('type');
  const [activeType, setActiveType] = React.useState<string | null>(requestedType);
  const [submitting, setSubmitting] = React.useState(false);
  const [templates, setTemplates] = React.useState<ScanTemplate[]>(() => loadScanTemplates());
  // 待保存模板的最近提交快照
  const [lastSubmit, setLastSubmit] = React.useState<ScanFormSubmitArgs | null>(null);

  React.useEffect(() => {
    if (requestedType && services.some(s => s.id === requestedType)) {
      setActiveType(requestedType);
    }
  }, [requestedType, services]);

  const activeService = services.find(s => s.id === activeType) ?? null;

  const handleSubmit = async (args: ScanFormSubmitArgs) => {
    setSubmitting(true);
    setLastSubmit(args);
    try {
      // 1. 上传附件
      let attachmentUrls: string[] = [];
      if (args.attachmentFiles.length > 0) {
        const uploaded = await uploadTaskAttachments(args.attachmentFiles);
        attachmentUrls = uploaded.attachmentUrls;
      }

      // 2. 构造与 ChatArea 完全一致的请求体
      const sessionId = generateSessionId();
      const params = buildTaskParams(args.taskType, args.selections, services, args.content);
      const body = buildTaskCreateBody({
        sessionId,
        taskType: args.taskType,
        content: args.content,
        attachments: attachmentUrls,
        params,
        language: i18n.language,
      });

      // 3. fire-and-forget 创建（与 ChatArea 行为一致）
      const result = await createTaskRequest(body);
      if (result.status === 0) {
        // 4. ADD_TASK 占位，让轮询与 SSE 接管
        actions.createTask(
          result.data?.title || args.content || args.taskType,
          args.taskType as any,
          sessionId
        );
        toast.success('扫描已发起');
        // 询问是否保存模板（首次成功提交后显示快捷保存）
        if (lastSubmit === null) {
          const name = window.prompt('保存为扫描模板？（输入模板名，取消则跳过）');
          if (name && name.trim()) {
            setTemplates(saveScanTemplate({
              name: name.trim(),
              taskType: args.taskType,
              snapshot: {
                content: args.content,
                selections: {
                  ...args.selections,
                  // File 对象不可序列化
                  attachmentFiles: undefined,
                },
              },
            }));
            toast.success('模板已保存');
          }
        }
        navigate(`/tasks?sessionId=${sessionId}`);
      } else {
        toast.error(result.message || '创建任务失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发起扫描失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-end gap-3 mb-4">
        <h1 className="font-head font-bold text-2xl tracking-tight text-plat-ink">新建扫描</h1>
      </div>
      <p className="text-[13px] text-plat-ink-2 mb-4">
        五类检测能力 · 表单化配置（与 AI 助手触发等价，参数映射同一后端 API）
      </p>

      <div className="flex gap-3.5 items-start">
        <CapabilitySelector
          services={services}
          activeId={activeType}
          onSelect={setActiveType}
        />

        <div className="flex-1 min-w-0 flex flex-col gap-3.5">
          {activeService ? (
            <ScanForm
              key={activeService.id}
              service={activeService}
              services={services}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          ) : (
            <div
              className="bg-card border rounded-plat shadow-plat-card p-10 text-center text-[13px] text-plat-muted"
              style={{ borderColor: 'var(--outline)', borderRadius: 'var(--plat-radius)', boxShadow: 'var(--shadow-card)' }}
            >
              从左侧选择检测能力开始配置
            </div>
          )}

          <ScanTemplates
            templates={templates}
            onApply={tpl => {
              setActiveType(tpl.taskType);
              toast.success(`已选择模板「${tpl.name}」— 切换到 ${tpl.taskType} 后回填表单`);
              // 快照回填通过 key 重建 ScanForm 后由后续阶段增强（一期先提示）
            }}
            onRemove={id => setTemplates(removeScanTemplate(id))}
          />
        </div>
      </div>
    </div>
  );
}
