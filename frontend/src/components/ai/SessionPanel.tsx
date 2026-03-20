'use client';

import { useAgentStore } from '@/stores/agentStore';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHrs < 24) return `${diffHrs}h`;
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function truncatePreview(text: string, maxLen = 80): string {
  if (!text) return '';
  const firstLine = text.split('\n')[0];
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen) + '...';
}

interface SessionPanelProps {
  agentSlug: string;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export function SessionPanel({
  agentSlug,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: SessionPanelProps) {
  const sessions = useAgentStore((s) => s.sessions);
  const isLoading = useAgentStore((s) => s.isLoadingSessions);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
          Sessoes
        </h3>
        <button
          onClick={onNewSession}
          className="flex items-center gap-1 rounded-md bg-accent-primary px-2.5 py-1 text-xs font-semibold text-accent-primary-text hover:bg-accent-primary-hover transition-colors"
        >
          <Plus className="size-3" />
          Nova
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && sessions.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Carregando...
          </p>
        )}

        {!isLoading && sessions.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhuma sessao ainda
          </p>
        )}

        <ul className="space-y-0.5">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <li key={session.id}>
                <button
                  onClick={() => onSelectSession(session.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-accent-primary-subtle border-l-2 border-accent-primary'
                      : 'hover:bg-sidebar-hover',
                  )}
                >
                  <div className={cn(
                    'text-sm truncate',
                    isActive ? 'font-semibold text-foreground' : 'text-foreground',
                  )}>
                    {session.title || 'Nova conversa'}
                  </div>
                  {session.last_agent_message && (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {truncatePreview(session.last_agent_message)}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {formatRelativeDate(session.updated_at)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
