'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';

export function AgentList() {
  const agents = useAgentStore((s) => s.agents);
  const activeAgent = useAgentStore((s) => s.activeAgent);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const openPanel = useAgentStore((s) => s.openPanel);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (agents.length === 0) {
    return null;
  }

  return (
    <nav className="space-y-0.5">
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => openPanel(agent)}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
            'hover:bg-slate-800/60',
            activeAgent?.id === agent.id
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-400',
          )}
        >
          <span className="text-base leading-none">{agent.emoji}</span>
          <span className="truncate">{agent.name}</span>
        </button>
      ))}
    </nav>
  );
}
