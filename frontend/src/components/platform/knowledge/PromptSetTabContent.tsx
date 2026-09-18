import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Info } from 'lucide-react';

/**
 * 规则库 · 提示词集 Tab — 空态说明。
 * 后端当前无独立的「提示词集」知识库源：设计稿中的提示词集合
 * （ChatGPT-Jailbreak-Prompts 等）实际归属「评测集」Tab（data/eval/*.json）。
 * 待后端增加独立提示词库端点后接入。
 */
export default function PromptSetTabContent() {
  const { t, ready } = useTranslation();
  const label = (key: string, fallback: string) => (ready ? t(key, fallback) : fallback);

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      <div
        className="w-12 h-12 rounded-[14px] grid place-items-center"
        style={{ background: 'var(--surface-mid)', color: 'var(--brand-deep)' }}
      >
        <FileText className="w-6 h-6" />
      </div>
      <div className="font-head font-semibold text-[15px] text-plat-ink">
        {label('platform.ruleLibrary.promptEmptyTitle', '提示词集独立库建设中')}
      </div>
      <p className="text-[12.5px] text-plat-muted max-w-[440px] leading-relaxed">
        {label(
          'platform.ruleLibrary.promptEmptyDesc',
          '当前版本的提示词集合（越狱提示词等）归属「评测集」分类管理，可在评测集 Tab 中查看；独立的提示词库将在后续版本提供。'
        )}
      </p>
      <div
        className="inline-flex items-center gap-1.5 text-[11.5px] rounded-full px-3 py-1 mt-1"
        style={{ background: 'var(--st-info-bg)', color: 'var(--st-info-t)' }}
      >
        <Info className="w-3.5 h-3.5" />
        {label('platform.ruleLibrary.promptEmptyHint', '评测集 Tab 已覆盖现有提示词数据')}
      </div>
    </div>
  );
}
