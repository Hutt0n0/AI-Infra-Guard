import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from '../ui/command';
import { useApp } from '../../context/AppContext';

/**
 * ⌘K 命令面板 — 数据源=当前任务列表（跳任务中心）+ 平台导航跳转
 */
export default function CommandSearch({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, ready } = useTranslation();
  const navigate = useNavigate();
  const { state } = useApp();

  const navItems = [
    { key: 'dashboard', to: '/' },
    { key: 'tasks', to: '/tasks' },
    { key: 'agentScan', to: '/scan/agent' },
    { key: 'skillScan', to: '/scan/skill' },
    { key: 'mcpScan', to: '/scan/mcp' },
    { key: 'modelRedteamReport', to: '/scan/redteam' },
    { key: 'aiInfraScan', to: '/scan/infra' },
    { key: 'poisonDetect', to: '/poison-detect' },
    { key: 'knowledge', to: '/knowledge' },
    { key: 'agents', to: '/agents' },
    { key: 'logs', to: '/logs' },
  ];

  const run = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const recentTasks = state.tasks.slice(0, 8);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={ready ? t('platform.search.placeholder', '搜索任务、页面…') : '搜索任务、页面…'}
      />
      <CommandList>
        <CommandEmpty>
          {ready ? t('platform.search.empty', '没有匹配结果') : '没有匹配结果'}
        </CommandEmpty>
        <CommandGroup heading={ready ? t('platform.search.groupNav', '页面导航') : '页面导航'}>
          {navItems.map(item => (
            <CommandItem key={item.key} onSelect={() => run(item.to)}>
              {ready ? t(`platform.nav.${item.key}`, item.key) : item.key}
            </CommandItem>
          ))}
        </CommandGroup>
        {recentTasks.length > 0 && (
          <CommandGroup heading={ready ? t('platform.search.groupTasks', '最近任务') : '最近任务'}>
            {recentTasks.map(task => (
              <CommandItem
                key={task.id}
                value={`${task.title} ${task.id} ${task.type}`}
                onSelect={() => run(`/task/${task.id}`)}
              >
                <span className="truncate">{task.title || task.id}</span>
                <span className="ml-auto text-xs text-plat-muted">{task.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
