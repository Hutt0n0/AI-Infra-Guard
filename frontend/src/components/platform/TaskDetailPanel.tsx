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
}

/**
 * 任务详情面板分发 — App.tsx renderDetailPanel switch 的组件化。
 * 运行中且无结果时优先展示 ScanProgressConsole。
 */
export function TaskDetailPanel({
  task, state, isFullscreen, onToggleFullscreen, consoleStageFilter, onStageFilterChange,
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

  // While a task is running and no step/report is selected, show the live progress console
  const hasResultMessage = task.messages.some(msg => msg.type === 'result');
  if (!selectedStep && !hasResultMessage && task.status === 'running') {
    return (
      <ScanProgressConsole
        task={task}
        stageFilter={consoleStageFilter}
        onStageFilterChange={onStageFilterChange}
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
