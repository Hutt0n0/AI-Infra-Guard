import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AppProvider, useApp } from '../context/AppContext';
import ChatArea from '../components/ChatArea';
import McpStepDetail from '../components/detailPanel/McpStepDetail';
import InfraScanDetailPanel from '../components/detailPanel/InfraScanDetailPanel';
import RedteamReportDetailPanel from '../components/detailPanel/RedteamReportDetailPanel';
import JailbreakDetailPanel from '../components/detailPanel/JailbreakDetailPanel';
import AgentScanDetailPanel from '../components/detailPanel/AgentScanDetailPanel';
import { ExecutionStep, MCPScanResult, InfraScanResult, RedteamReportResult, JailbreakResult, AgentScanResult } from '../types';
import { fetchTaskDetailRaw, assembleTaskFromDetail } from '../lib/taskApi';

// Status mapping function
function mapStatusToStepStatus(status: string): 'todo' | 'doing' | 'done' {
  if (status === 'todo') return 'todo';
  if (status === 'doing' || status === 'running' || status === 'pending') return 'doing';
  if (status === 'done' || status === 'completed' || status === 'failed') return 'done';
  return 'todo';
}

// Task type mapping function
function getTaskTypeFromTaskType(taskType: string): string {
  // Map the taskType returned by the API to the app's internal task type
  // Note: Skill-Scan must be checked before Mcp-Scan to avoid false matches
  if (taskType.includes('Skill-Scan') || taskType.includes('skill')) {
    return 'Skill-Scan';
  } else if (taskType.includes('Mcp-Scan') || taskType.includes('mcp')) {
    return 'Mcp-Scan';
  } else if (taskType.includes('AI-Infra-Scan') || taskType.includes('infra')) {
    return 'AI-Infra-Scan';
  } else if (taskType.includes('Model-Redteam-Report') || taskType.includes('redteam')) {
    return 'Model-Redteam-Report';
  } else if (taskType.includes('Model-Jailbreak') || taskType.includes('jailbreak')) {
    return 'Model-Jailbreak';
  } else if (taskType.includes('Agent-Scan') || taskType.includes('agent')) {
    return 'Agent-Scan';
  }
  // Default to Mcp-Scan
  return 'Mcp-Scan';
}

const ReportPageContent: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { state, dispatch } = useApp();
  const [taskData, setTaskData] = useState<any>(null);
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null);
  const [selectedTool, setSelectedTool] = useState<{
    step: ExecutionStep;
    subStepIndex: number;
    toolIndex: number;
  } | null>(null);
  const [mcpResult, setMcpResult] = useState<MCPScanResult | undefined>(undefined);
  const [infraScanResult, setInfraScanResult] = useState<InfraScanResult | undefined>(undefined);
  const [redteamReportResult, setRedteamReportResult] = useState<RedteamReportResult | undefined>(undefined);
  const [jailbreakResult, setJailbreakResult] = useState<JailbreakResult | undefined>(undefined);
  const [agentScanResult, setAgentScanResult] = useState<AgentScanResult | undefined>(undefined);

  // Load task data
  // Load task data
  useEffect(() => {
    if (sessionId) {
      const loadTask = async () => {
        try {
          dispatch({ type: 'SET_LOADING', payload: true });
          const raw = await fetchTaskDetailRaw(sessionId);

          // Shared assembly (same code path as AppContext.loadTask)
          const assembled = assembleTaskFromDetail(raw);
          const { planSteps, result, statusMessages, traces } = assembled;

          const parsedMessages: any[] = [];
          // 1. User message
          parsedMessages.push({
            type: 'user',
            timestamp: raw.createdAt,
            content: raw.content,
            attachments: raw.attachments || [],
          });
          // 2. Task confirmation message
          parsedMessages.push({
            type: 'task_confirmation',
            timestamp: raw.createdAt,
            executionPlan: planSteps,
            content: '',
          });
          // 3. Timeline message
          parsedMessages.push({
            type: 'task_execution',
            timestamp: raw.createdAt,
            content: '',
          });
          // 4. Result message (done only)
          if (raw.status === 'done' && result) {
            parsedMessages.push({
              type: 'result',
              timestamp: result.timestamp,
              result: result.result,
            });
          }
          // 5. Non-plan-step status messages
          parsedMessages.push(...statusMessages);

          const task = {
            id: raw.sessionId,
            title: raw.title,
            type: getTaskTypeFromTaskType(raw.taskType),
            status: raw.status,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            plan: planSteps,
            result: result?.result ?? null,
            traces,
            messages: parsedMessages,
            attachments: raw.attachments || [],
            isSubmitted: true,
          };
          // Set the task data directly without updating global state
          setTaskData(task);

        } catch (error) {
          console.error('ReportPage: 加载任务失败:', error);
          dispatch({ type: 'SET_ERROR', payload: '加载任务失败' });
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      };

      loadTask();
    }
  }, [sessionId, dispatch]);

  const handleStepSelect = (step: ExecutionStep | null) => {
    setSelectedStep(step);
    setSelectedTool(null);
    setMcpResult(undefined);
    setInfraScanResult(undefined);
    setRedteamReportResult(undefined);
    setJailbreakResult(undefined);
    setAgentScanResult(undefined);
  };

  const handleToolSelect = (step: ExecutionStep, subStepIndex: number, toolIndex: number) => {
    setSelectedTool({ step, subStepIndex, toolIndex });
    setSelectedStep(step);
    setMcpResult(undefined);
    setInfraScanResult(undefined);
    setRedteamReportResult(undefined);
    setJailbreakResult(undefined);
    setAgentScanResult(undefined);
  };

  const handleMcpResultSelect = (result: MCPScanResult | InfraScanResult | RedteamReportResult | JailbreakResult | AgentScanResult) => {
    if (taskData?.type === 'AI-Infra-Scan') {
      setInfraScanResult(result as InfraScanResult);
      setMcpResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
    } else if (taskData?.type === 'Model-Redteam-Report') {
      setRedteamReportResult(result as RedteamReportResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setJailbreakResult(undefined);
    } else if (taskData?.type === 'Model-Jailbreak') {
      setJailbreakResult(result as JailbreakResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setAgentScanResult(undefined);
    } else if (taskData?.type === 'Agent-Scan') {
      setAgentScanResult(result as AgentScanResult);
      setMcpResult(undefined);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
    } else {
      setMcpResult(result as MCPScanResult);
      setInfraScanResult(undefined);
      setRedteamReportResult(undefined);
      setJailbreakResult(undefined);
      setAgentScanResult(undefined);
    }
    setSelectedStep(null);
  };

  // On the share page, we use taskData directly
  const selectedStepIndex = selectedStep && taskData
    ? taskData.plan.findIndex(step => step.id === selectedStep.id)
    : undefined;

  // When the task status is completed or done, automatically show the risk report
  useEffect(() => {
    if (taskData && (taskData.status === 'completed' || taskData.status === 'done')) {
      const result = taskData.result;
      console.log('ReportPage: 任务结果:', result);
      if (result) {
        if (taskData.type === 'Mcp-Scan' || taskData.type === 'Skill-Scan') {
          setMcpResult(result);
          setSelectedStep(null);
        } else if (taskData.type === 'AI-Infra-Scan') {
          setInfraScanResult(result);
          setSelectedStep(null);
        } else if (taskData.type === 'Model-Redteam-Report') {
          setRedteamReportResult(result);
          setSelectedStep(null);
        } else if (taskData.type === 'Model-Jailbreak') {
          setJailbreakResult(result);
          setSelectedStep(null);
        } else if (taskData.type === 'Agent-Scan') {
          setAgentScanResult(result);
          setSelectedStep(null);
        }
      }
    }
  }, [taskData]);

  // Choose the DetailPanel component based on the task type
  const renderDetailPanel = () => {
    if (!taskData) return null;

    switch (taskData.type) {
      case 'AI-Infra-Scan':
        return (
          <InfraScanDetailPanel 
            step={selectedStep}
            stepIndex={selectedStepIndex}
            infraScanResult={infraScanResult}
            selectedTool={selectedTool}
            isFullscreen={true}
            onToggleFullscreen={() => {}}
            hideFullscreenButton={true}
            sessionId={sessionId}
          />
        );
      case 'Model-Redteam-Report':
        return (
          <RedteamReportDetailPanel 
            step={selectedStep}
            stepIndex={selectedStepIndex}
            redteamReportResult={redteamReportResult}
            selectedTool={selectedTool}
            isFullscreen={true}
            onToggleFullscreen={() => {}}
            hideFullscreenButton={true}
            sessionId={sessionId}
          />
        );
      case 'Model-Jailbreak':
        return (
          <JailbreakDetailPanel 
            step={selectedStep}
            stepIndex={selectedStepIndex}
            jailbreakResult={jailbreakResult}
            selectedTool={selectedTool}
            isFullscreen={true}
            onToggleFullscreen={() => {}}
            hideFullscreenButton={true}
            sessionId={sessionId}
          />
        );
      case 'Agent-Scan':
        return (
          <AgentScanDetailPanel 
            step={selectedStep}
            agentScanResult={agentScanResult}
            isFullscreen={true}
            onToggleFullscreen={() => {}}
            sessionId={sessionId}
          />
        );
      default:
        return (
          <McpStepDetail 
            step={selectedStep}
            stepIndex={selectedStepIndex}
            mcpResult={mcpResult}
            selectedTool={selectedTool}
            isFullscreen={true}
            onToggleFullscreen={() => {}}
            hideFullscreenButton={true}
            sessionId={sessionId}
            taskType={taskData.type}
          />
        );
    }
  };

  if (state.isLoading) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-red-600">{state.error}</div>
      </div>
    );
  }

  if (!taskData) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">任务不存在</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 text-gray-900 flex overflow-hidden">
      {/* Step detail panel - takes the entire screen */}
      <div className="w-full transition-all duration-300 ease-in-out">
        {renderDetailPanel()}
      </div>
    </div>
  );
};

const ReportPage: React.FC = () => {
  return (
    <AppProvider>
      <ReportPageContent />
    </AppProvider>
  );
};

export default ReportPage; 