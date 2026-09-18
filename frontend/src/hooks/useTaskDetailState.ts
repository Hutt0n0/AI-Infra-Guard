import { useState, useEffect, useCallback } from 'react';
import {
  ExecutionStep,
  MCPScanResult,
  InfraScanResult,
  RedteamReportResult,
  JailbreakResult,
  AgentScanResult,
} from '../types';
import { useApp } from '../context/AppContext';

export interface SelectedToolRef {
  step: ExecutionStep;
  subStepIndex: number;
  toolIndex: number;
}

/**
 * 任务详情选中态 — 从 App.tsx AppContent 抽取的 6 个 result state + 3 个 handler + 同步 effect。
 * AppContext 之外可复用（AssistantDock / TaskCenter 都用它喂 5 类 DetailPanel）。
 */
export function useTaskDetailState() {
  const { state } = useApp();
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null);
  const [selectedTool, setSelectedTool] = useState<SelectedToolRef | null>(null);
  const [mcpResult, setMcpResult] = useState<MCPScanResult | undefined>(undefined);
  const [infraScanResult, setInfraScanResult] = useState<InfraScanResult | undefined>(undefined);
  const [redteamReportResult, setRedteamReportResult] = useState<RedteamReportResult | undefined>(undefined);
  const [jailbreakResult, setJailbreakResult] = useState<JailbreakResult | undefined>(undefined);
  const [agentScanResult, setAgentScanResult] = useState<AgentScanResult | undefined>(undefined);

  const currentTask = state.tasks.find(task => task.id === state.currentTaskId);

  const clearResults = useCallback(() => {
    setMcpResult(undefined);
    setInfraScanResult(undefined);
    setRedteamReportResult(undefined);
    setJailbreakResult(undefined);
    setAgentScanResult(undefined);
  }, []);

  const handleStepSelect = useCallback((step: ExecutionStep | null) => {
    setSelectedStep(step);
    setSelectedTool(null);
    clearResults();
  }, [clearResults]);

  const handleToolSelect = useCallback((step: ExecutionStep, subStepIndex: number, toolIndex: number) => {
    setSelectedTool({ step, subStepIndex, toolIndex });
    setSelectedStep(step);
    clearResults();
  }, [clearResults]);

  const handleMcpResultSelect = useCallback((
    result: MCPScanResult | InfraScanResult | RedteamReportResult | JailbreakResult | AgentScanResult
  ) => {
    // Determine the result type based on the current task type
    if (currentTask?.type === 'AI-Infra-Scan') {
      setInfraScanResult(result as InfraScanResult);
      setMcpResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
      setAgentScanResult(undefined);
    } else if (currentTask?.type === 'Model-Redteam-Report') {
      setRedteamReportResult(result as RedteamReportResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setJailbreakResult(undefined);
      setAgentScanResult(undefined);
    } else if (currentTask?.type === 'Model-Jailbreak') {
      setJailbreakResult(result as JailbreakResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setAgentScanResult(undefined);
    } else if (currentTask?.type === 'Agent-Scan') {
      setAgentScanResult(result as AgentScanResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
    } else {
      // Other task types default to MCP scan result
      setMcpResult(result as MCPScanResult);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
      setAgentScanResult(undefined);
    }
    setSelectedStep(null);
  }, [currentTask?.type]);

  // When currentTask changes, clear the selected data
  useEffect(() => {
    setSelectedStep(null);
    clearResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentTaskId]);

  // Sync selectedStep / selectedTool when the underlying step data updates
  useEffect(() => {
    if (selectedStep && currentTask) {
      const updatedStep = currentTask.plan.find(step => step.id === selectedStep.id);
      if (updatedStep && updatedStep !== selectedStep) {
        setSelectedStep(updatedStep);
      }
    }
    if (selectedTool && currentTask) {
      const updatedStep = currentTask.plan.find(step => step.id === selectedTool.step.id);
      if (updatedStep && updatedStep !== selectedTool.step) {
        setSelectedTool({
          ...selectedTool,
          step: updatedStep,
        });
      }
    }
  }, [currentTask, selectedStep, selectedTool]);

  // When the task status is completed or done, automatically show the risk report
  useEffect(() => {
    if (currentTask && (currentTask.status === 'completed' || currentTask.status === 'done')) {
      // Prefer looking up the exact match by task type
      if (currentTask.type === 'Agent-Scan') {
        const agentResultMsg = currentTask.messages.find(msg => msg.type === 'result' && msg.agentScanResult);
        if (agentResultMsg?.agentScanResult) {
          setAgentScanResult(agentResultMsg.agentScanResult);
          setSelectedStep(null);
          return;
        }
      }

      // Generic logic: look up various result types in the result message
      const resultMessage = currentTask.messages.find(msg => msg.type === 'result');
      if (resultMessage) {
        if (resultMessage.mcpResult) {
          setMcpResult(resultMessage.mcpResult);
          setSelectedStep(null);
        } else if (resultMessage.infraScanResult) {
          setInfraScanResult(resultMessage.infraScanResult);
          setSelectedStep(null);
        } else if (resultMessage.redteamReportResult) {
          setRedteamReportResult(resultMessage.redteamReportResult);
          setSelectedStep(null);
        } else if (resultMessage.jailbreakResult) {
          setJailbreakResult(resultMessage.jailbreakResult);
          setSelectedStep(null);
        } else if (resultMessage.agentScanResult) {
          setAgentScanResult(resultMessage.agentScanResult);
          setSelectedStep(null);
        }
      }
    }
  }, [currentTask]);

  return {
    currentTask,
    selectedStep,
    selectedTool,
    mcpResult,
    infraScanResult,
    redteamReportResult,
    jailbreakResult,
    agentScanResult,
    handleStepSelect,
    handleToolSelect,
    handleMcpResultSelect,
  };
}
