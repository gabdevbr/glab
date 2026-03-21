'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function AgentList() {
  const router = useRouter();
  const params = useParams();
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const activeSlug = params.slug as string | undefined;

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof agents>();
    for (const agent of agents) {
      const cat = agent.category || '';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(agent);
    }
    return map;
  }, [agents]);

  if (agents.length === 0) {
    return null;
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((s) => ({ ...s, [cat]: !s[cat] }));
  };

  const hasCategories = grouped.size > 1 || (grouped.size === 1 && !grouped.has(''));

  return (
    <nav className="space-y-0.5">
      {Array.from(grouped.entries()).map(([category, categoryAgents]) => (
        <div key={category}>
          {hasCategories && category !== '' && (
            <button
              onClick={() => toggleCategory(category)}
              className="mt-1 mb-0.5 flex w-full items-center gap-1 px-4 py-1 hover:bg-sidebar-hover rounded-md transition-colors"
            >
              {collapsedCategories[category] ? (
                <ChevronRight className="size-2.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-2.5 text-muted-foreground" />
              )}
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {category}
              </span>
            </button>
          )}
          {!(hasCategories && collapsedCategories[category]) &&
            categoryAgents.map((agent) => (
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
        </div>
      ))}
    </nav>
  );
}
