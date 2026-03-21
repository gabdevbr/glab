'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER = ['Agentes', 'Modelos LLM'];

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

  // Agrupar por categoria
  const groups = agents.reduce<Record<string, typeof agents>>((acc, agent) => {
    const cat = agent.category || 'Agentes';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(agent);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groups).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const hasMultipleCategories = sortedCategories.length > 1;

  return (
    <nav className="space-y-2">
      {sortedCategories.map((category) => (
        <div key={category}>
          {hasMultipleCategories && (
            <div className="px-2 pb-0.5 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
              {category}
            </div>
          )}
          <div className="space-y-0.5">
            {groups[category].map((agent) => (
              <button
                key={agent.id}
                onClick={() => openPanel(agent)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
                  'hover:bg-sidebar-hover',
                  activeAgent?.id === agent.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <span className="text-base leading-none">{agent.emoji}</span>
                <span className="truncate">{agent.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
