import * as React from 'react';
import { ExecutionStep } from '../../types';
import McpStepDetail from '../detailPanel/McpStepDetail';
import InfraScanDetailPanel from '../detailPanel/InfraScanDetailPanel';
import RedteamReportDetailPanel from '../detailPanel/RedteamReportDetailPanel';
import JailbreakDetailPanel from '../detailPanel/JailbreakDetailPanel';
import AgentScanDetailPanel from '../detailPanel/AgentScanDetailPanel';
import ScanProgressConsole from '../detailPanel/ScanProgressConsole';
import type { useTaskDetailState } from '../../hooks/useTaskDetailState';

type DetailState = ReturnType<typeof useTaskDetailState>;

export interface TaskDetailPanelProps {
  task: NonNullable<DetailState['currentTask']>;
  state: DetailState;
  /** 全屏切换（BaseDetailPanel 骨架） */
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** 实时进度控制台的阶段筛选（运行中任务） */
  consoleStageFilter: string | null;
  onStageFilterChange: (filter: string | null) => void;
  /**
   * 执行控制台显式打开（dev ac3053a6 语义组件化）：
   * 任意任务状态（含已完成/已终止/失败）都可查看执行流与目标通信记录；
   * 关闭/返回由调用方置 false。运行中且无结果时控制台始终是默认视图。
   */
  consoleOpen?: boolean;
  onConsoleOpenChange?: (open: boolean) => void;
}

/**
 * 任务详情面板分发 — App.tsx renderDetailPanel switch 的组件化。
 * 运行中且无结果时优先展示 ScanProgressConsole；consoleOpen=true 时
 * 任意状态都展示控制台（onBack 返回报告视图）。
 */
export function TaskDetailPanel({
  task, state, isFullscreen, onToggleFullscreen, consoleStageFilter, onStageFilterChange,
  consoleOpen = false, onConsoleOpenChange,
}: TaskDetailPanelProps) {
  const {
    selectedStep, selectedTool,
    mcpResult, infraScanResult, redteamReportResult, jailbreakResult, agentScanResult,
    handleStepSelect,
  } = state;

  const selectedStepIndex = selectedStep
    ? task.plan.findIndex(step => step.id === selectedStep.id)
    : undefined;

  // Whether the task is still running without a final report (console-visible state)
  const runningWithoutResult = task.status === 'running' &&
    !task.messages.some(msg => msg.type === 'result');

  // Console visibility: explicit open (any status) or running-with-no-result default
  const hasResultMessage = task.messages.some(msg => msg.type === 'result');
  const consoleVisible = (consoleOpen && !selectedStep) ||
    (!selectedStep && !hasResultMessage && task.status === 'running');
  if (consoleVisible) {
    return (
      <ScanProgressConsole
        task={task}
        stageFilter={consoleStageFilter}
        onStageFilterChange={onStageFilterChange}
        onBack={hasResultMessage && onConsoleOpenChange ? () => onConsoleOpenChange(false) : undefined}
      />
    );
  }

  // Choose a different DetailPanel component based on the task type
  switch (task.type) {
    case 'AI-Infra-Scan':
      return (
        <InfraScanDetailPanel
          step={selectedStep}
          stepIndex={selectedStepIndex}
          infraScanResult={infraScanResult}
          selectedTool={selectedTool}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      );
    case 'Model-Redteam-Report':
      return (
        <RedteamReportDetailPanel
          step={selectedStep}
          stepIndex={selectedStepIndex}
          redteamReportResult={redteamReportResult}
          selectedTool={selectedTool}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onBack={runningWithoutResult ? () => handleStepSelect(null) : undefined}
        />
      );
    case 'Model-Jailbreak':
      return (
        <JailbreakDetailPanel
          step={selectedStep}
          stepIndex={selectedStepIndex}
          jailbreakResult={jailbreakResult}
          selectedTool={selectedTool}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onBack={runningWithoutResult ? () => handleStepSelect(null) : undefined}
        />
      );
    case 'Agent-Scan':
      return (
        <AgentScanDetailPanel
          step={selectedStep}
          agentScanResult={agentScanResult}
          selectedTool={selectedTool}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onBack={runningWithoutResult ? () => handleStepSelect(null) : undefined}
        />
      );
    default:
      // Other task types use McpStepDetail (shared by Mcp-Scan / Skill-Scan)
      return (
        <McpStepDetail
          step={selectedStep}
          stepIndex={selectedStepIndex}
          mcpResult={mcpResult}
          selectedTool={selectedTool}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          taskType={task.type}
        />
      );
  }
}
