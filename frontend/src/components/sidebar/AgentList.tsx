'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';

export function AgentList() {
  const router = useRouter();
  const params = useParams();
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  const activeSlug = params.slug as string | undefined;

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
          onClick={() => router.push(`/agent/${agent.slug}`)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md mx-1 px-2 py-1.5 text-left text-sm transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5',
            activeSlug === agent.slug
              ? 'bg-accent-primary-subtle text-foreground font-semibold border-l-2 border-accent-primary'
              : 'text-muted-foreground',
          )}
        >
          <span className="text-base leading-none">{agent.emoji}</span>
          <span className="truncate">{agent.name}</span>
        </button>
      ))}
    </nav>
  );
}
