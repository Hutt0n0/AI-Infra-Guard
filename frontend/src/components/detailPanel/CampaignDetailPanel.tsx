// Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Requirement: Any integration or derivative work must explicitly attribute
// Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
// documentation or user interface, as detailed in the NOTICE file.

import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords, Maximize, Minimize, Share2, Download, Target, Layers, Flame, ShieldCheck } from 'lucide-react';
import type { CampaignResult } from '../../types';
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '../ui/tooltip';
import { useApp } from '../../context/AppContext';
import { useReportPrint } from './useReportPrint';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface CampaignDetailPanelProps {
  campaignResult?: CampaignResult;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  hideFullscreenButton?: boolean;
  sessionId?: string;
}

/** 战报状态徽章样式（对齐体检 verdict 语义） */
const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  Jailbreak: { color: 'var(--st-crit-t)', bg: 'var(--st-crit-bg)' },
  Safe: { color: 'var(--st-good-t)', bg: 'var(--st-good-bg)' },
  Exception: { color: 'var(--st-warn-t)', bg: 'var(--st-warn-bg)' },
  SimulationFailed: { color: 'var(--st-info-t)', bg: 'var(--st-info-bg)' },
};

/**
 * 对抗战役战报面板 —— KPI 条 + 每方法轮转表 + 突破 transcript 列表 + CSV 下载。
 * 组合体检报告的既有交互（分享/下载/打印/全屏），渲染针对 campaign 形状。
 */
const CampaignDetailPanel: React.FC<CampaignDetailPanelProps> = ({
  campaignResult,
  isFullscreen = false,
  onToggleFullscreen,
  hideFullscreenButton = false,
  sessionId,
}) => {
  const { t } = useTranslation();
  const { state } = useApp();
  const reportRef = useRef<HTMLDivElement>(null);
  const currentTask = state.tasks.find(task => task.id === state.currentTaskId);
  const currentSessionId = sessionId || currentTask?.id;

  const label = (key: string, fallback: string) => (t(key, fallback) as string);

  const handleShare = () => {
    if (currentSessionId) {
      window.open(`${window.location.origin}/report/${currentSessionId}`, '_blank');
    }
  };

  const handleDownloadPdf = useReportPrint(reportRef, `A.I.G ${label('platform.nav.campaign', '对抗战役')}`);

  const handleDownloadCsv = async () => {
    const url = campaignResult?.attachment;
    if (!url) return;
    try {
      const endpoint = currentSessionId
        ? `/api/v1/app/tasks/${currentSessionId}/downloadFile`
        : '/api/v1/app/tasks/downloadFile';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: url }),
      });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'campaign_results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch { /* 静默 */ }
  };

  const methodRows = useMemo(
    () => [...(campaignResult?.extraBody?.attackMethodResults ?? [])]
      .sort((a, b) => (b.asr ?? 0) - (a.asr ?? 0)),
    [campaignResult]
  );
  const breakthroughs = useMemo(
    () => (campaignResult?.results ?? []).filter(r => r.status === 'Jailbreak'),
    [campaignResult]
  );

  if (!campaignResult) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        {label('campaign.noReport', '暂无战役战报')}
      </div>
    );
  }

  const kpis = [
    { icon: Target, labelV: '突破次数', labelE: 'Breakthroughs', value: campaignResult.jailbreak, tone: 'var(--st-crit-t)' },
    { icon: Layers, labelV: '攻击方法', labelE: 'Methods', value: campaignResult.methodsRun, tone: 'var(--ink)' },
    { icon: Flame, labelV: '总轮次', labelE: 'Cases', value: `${campaignResult.roundsRun}/${campaignResult.roundsPerMethod}`, tone: 'var(--ink)' },
    { icon: ShieldCheck, labelV: '安全分', labelE: 'Safety Score', value: campaignResult.score, tone: 'var(--st-good-t)' },
  ];

  return (
    <TooltipProvider>
      <div className="bg-white border-l border-gray-200 flex flex-col w-full h-full transition-all duration-300 ease-in-out">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <Swords className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              <span className="text-sm font-medium text-gray-500 truncate">
                {label('campaign.reportTitle', '对抗战役战报')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer" type="button">
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleDownloadPdf}>
                        {label('redteam.downloadReport', '下载报告')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownloadCsv}>
                        {label('redteam.downloadDataCsv', '下载数据 (CSV)')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent><p>{label('redteam.downloadDetailedReport', '下载详细报告')}</p></TooltipContent>
              </Tooltip>
              {currentSessionId && !hideFullscreenButton && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={handleShare} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer">
                      <Share2 className="w-4 h-4 text-gray-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>{label('common.share', '分享')}</p></TooltipContent>
                </Tooltip>
              )}
              {onToggleFullscreen && !hideFullscreenButton && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={onToggleFullscreen} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer">
                      {isFullscreen ? <Minimize className="w-4 h-4 text-gray-500" /> : <Maximize className="w-4 h-4 text-gray-500" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isFullscreen ? label('common.exitFullscreen', '退出全屏') : label('common.fullscreen', '全屏')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={reportRef} className="flex-1 overflow-y-auto min-h-0 scrollbar-hover print-content-wrapper">
          <div className={`p-5 flex flex-col gap-5 ${isFullscreen ? 'max-w-[1200px] w-full mx-auto' : ''}`}>
            {/* 课题 */}
            <div>
              <div className="text-xs font-semibold text-plat-ink-2 mb-1.5">{label('campaign.topic', '战役课题')}</div>
              <div className="text-sm text-plat-ink leading-relaxed bg-plat-surface-low rounded-[11px] px-3.5 py-2.5">
                {campaignResult.topic}
              </div>
            </div>

            {/* KPI 条 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpis.map(k => (
                <div key={k.labelV} className="border rounded-[11px] px-3.5 py-3" style={{ borderColor: 'var(--outline)' }}>
                  <div className="flex items-center gap-1.5 text-xs text-plat-ink-2">
                    <k.icon className="w-3.5 h-3.5" />
                    {label('campaign.kpi.' + k.labelE, k.labelV)}
                  </div>
                  <div className="text-xl font-bold mt-1" style={{ color: k.tone }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* 每方法轮转表 */}
            <div>
              <div className="text-xs font-semibold text-plat-ink-2 mb-1.5">
                {label('campaign.perMethod', '攻击方法轮转统计')}（{methodRows.length}）
              </div>
              <div className="border rounded-[11px] overflow-hidden" style={{ borderColor: 'var(--outline)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-plat-surface-low text-plat-ink-2">
                      <th className="text-left px-3 py-2 font-semibold">{label('campaign.colMethod', '攻击方法')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{label('campaign.colRounds', '轮次')}</th>
                      <th className="text-right px-3 py-2 font-semibold">{label('campaign.colBreak', '突破')}</th>
                      <th className="text-right px-3 py-2 font-semibold">ASR</th>
                      <th className="text-right px-3 py-2 font-semibold">{label('campaign.colErrored', '异常')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {methodRows.map(row => (
                      <tr key={row.attackMethod} className="border-t" style={{ borderColor: 'var(--outline)' }}>
                        <td className="px-3 py-2 text-plat-ink">{row.attackMethod}</td>
                        <td className="px-3 py-2 text-right text-plat-ink-2">{row.rounds ?? row.total}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: row.jailbreak > 0 ? 'var(--st-crit-t)' : 'var(--plat-muted)' }}>
                          {row.jailbreak}
                        </td>
                        <td className="px-3 py-2 text-right text-plat-ink-2">{(row.asr * 100).toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right text-plat-ink-2">{row.errored}</td>
                      </tr>
                    ))}
                    {methodRows.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-plat-muted">{label('campaign.noMethodData', '无方法数据')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 突破 transcript 列表 */}
            <div>
              <div className="text-xs font-semibold text-plat-ink-2 mb-1.5">
                {label('campaign.breakthroughs', '突破记录')}（{breakthroughs.length}）
              </div>
              <div className="flex flex-col gap-3">
                {breakthroughs.map((b, i) => (
                  <div key={i} className="border rounded-[11px] overflow-hidden" style={{ borderColor: 'var(--outline)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 bg-plat-surface-low">
                      <span
                        className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                        style={{ color: STATUS_STYLES.Jailbreak.color, background: STATUS_STYLES.Jailbreak.bg }}
                      >
                        {label('campaign.verdictJailbreak', '突破')}
                      </span>
                      <span className="text-xs font-medium text-plat-ink">{b.attackMethod}</span>
                      {b.round !== undefined && (
                        <span className="text-[11px] text-plat-muted">
                          {label('campaign.roundN', '第 {{n}} 轮').replace('{{n}}', String(b.round))}
                        </span>
                      )}
                      {b.turns !== undefined && b.turns > 0 && (
                        <span className="text-[11px] text-plat-muted">{b.turns} turns</span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 text-xs">
                      {b.transcript && b.transcript.length > 0 ? (
                        b.transcript.map((turn, ti) => (
                          <div key={ti} className="flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-plat-ink-2">
                              {label('campaign.turnN', '轮 {{n}}').replace('{{n}}', String(turn.turn ?? ti + 1))}
                            </div>
                            <div className="bg-plat-surface-low rounded px-2.5 py-1.5 text-plat-ink whitespace-pre-wrap break-words">
                              {turn.attack}
                            </div>
                            <div className="bg-white border rounded px-2.5 py-1.5 text-plat-ink-2 whitespace-pre-wrap break-words" style={{ borderColor: 'var(--outline)' }}>
                              {turn.response}
                            </div>
                          </div>
                        ))
                      ) : (
                        <>
                          <div>
                            <div className="text-[11px] font-semibold text-plat-ink-2 mb-0.5">{label('campaign.attackInput', '攻击输入')}</div>
                            <div className="bg-plat-surface-low rounded px-2.5 py-1.5 text-plat-ink whitespace-pre-wrap break-words">{b.input}</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold text-plat-ink-2 mb-0.5">{label('campaign.targetOutput', '目标输出')}</div>
                            <div className="bg-white border rounded px-2.5 py-1.5 text-plat-ink-2 whitespace-pre-wrap break-words" style={{ borderColor: 'var(--outline)' }}>{b.output}</div>
                          </div>
                        </>
                      )}
                      {b.reason && (
                        <div className="text-plat-muted">{label('campaign.judgeReason', '判定理由')}：{b.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
                {breakthroughs.length === 0 && (
                  <div className="text-xs text-plat-muted border rounded-[11px] px-3 py-4 text-center" style={{ borderColor: 'var(--outline)' }}>
                    {label('campaign.noBreakthroughs', '本轮战役未突破目标 — 目标抵御了全部攻击轮次')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default CampaignDetailPanel;
