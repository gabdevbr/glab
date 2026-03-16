'use client';

import { useState, useRef, useEffect, KeyboardEvent, FormEvent } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { wsClient } from '@/lib/ws';
import { X, Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export function AgentPanel() {
  const activeAgent = useAgentStore((s) => s.activeAgent);
  const isPanelOpen = useAgentStore((s) => s.isPanelOpen);
  const closePanel = useAgentStore((s) => s.closePanel);
  const panelMessages = useAgentStore((s) => s.panelMessages);
  const streamingContent = useAgentStore((s) => s.streamingContent);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const sessions = useAgentStore((s) => s.sessions);
  const fetchSessionMessages = useAgentStore((s) => s.fetchSessionMessages);
  const user = useAuthStore((s) => s.user);

  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [panelMessages, streamingContent]);

  // Wire ai.panel.chunk events
  useEffect(() => {
    if (!activeAgent) return;

    const unsub = wsClient.on('ai.panel.chunk', (payload: unknown) => {
      const data = payload as {
        agent_slug: string;
        session_id: string;
        content: string;
        done: boolean;
        message_id?: string;
      };

      if (data.agent_slug !== activeAgent.slug) return;

      if (data.done) {
        setIsStreaming(false);
        if (data.message_id) {
          const store = useAgentStore.getState();
          store.finalizeStreaming(data.message_id, activeAgent.user_id);
          // Update session ID if this was a new session
          if (data.session_id && !store.activeSessionId) {
            store.setActiveSessionId(data.session_id);
          }
        }
      } else {
        setIsStreaming(true);
        useAgentStore.getState().appendStreamingContent(data.content);
      }
    });

    return unsub;
  }, [activeAgent]);

  if (!isPanelOpen || !activeAgent) return null;

  function sendMessage() {
    const trimmed = content.trim();
    if (!trimmed || isStreaming || !activeAgent) return;

    // Add user message to panel immediately
    useAgentStore.getState().addPanelMessage({
      id: 'temp-' + Date.now(),
      channel_id: '',
      user_id: user?.id || '',
      username: user?.username || '',
      display_name: user?.display_name || '',
      is_bot: false,
      content: trimmed,
      content_type: 'text',
      is_pinned: false,
      created_at: new Date().toISOString(),
    });

    // Clear streaming content
    useAgentStore.getState().clearStreaming();

    // Send via WS
    wsClient.send('ai.prompt', {
      agent_slug: activeAgent.slug,
      session_id: activeSessionId || undefined,
      content: trimmed,
    });

    setContent('');
    setIsStreaming(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  function handleStop() {
    if (!activeAgent) return;
    wsClient.send('ai.stop', { agent_slug: activeAgent.slug });
    setIsStreaming(false);
  }

  function handleSessionClick(sessionId: string) {
    if (!activeAgent) return;
    fetchSessionMessages(activeAgent.slug, sessionId);
    useAgentStore.getState().clearStreaming();
    setIsStreaming(false);
  }

  function handleNewChat() {
    useAgentStore.getState().setActiveSessionId(null);
    useAgentStore.setState({ panelMessages: [], streamingContent: '' });
    setIsStreaming(false);
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-chat-bg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-lg">{activeAgent.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {activeAgent.name}
          </h3>
          {activeAgent.description && (
            <p className="truncate text-[11px] text-muted-foreground">
              {activeAgent.description}
            </p>
          )}
        </div>
        <button
          onClick={handleNewChat}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="New chat"
        >
          <MessageSquare className="size-3.5" />
        </button>
        <button
          onClick={closePanel}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Session list (collapsible) */}
      {sessions.length > 0 && !activeSessionId && panelMessages.length === 0 && (
        <div className="border-b border-border px-3 py-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent sessions
          </p>
          <div className="max-h-32 space-y-0.5 overflow-y-auto">
            {sessions.slice(0, 5).map((s) => (
              <button
                key={s.id}
                onClick={() => handleSessionClick(s.id)}
                className="w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {s.title || 'Untitled session'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {panelMessages.length === 0 && !streamingContent && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-3xl">{activeAgent.emoji}</span>
            <p className="mt-2 text-sm font-medium text-foreground">
              {activeAgent.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeAgent.description || 'Ask me anything!'}
            </p>
          </div>
        )}

        {panelMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn('mb-3', msg.is_bot ? 'pr-6' : 'pl-6')}
          >
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                msg.is_bot
                  ? 'bg-secondary text-foreground'
                  : 'bg-accent-primary text-accent-primary-text',
              )}
            >
              {msg.is_bot ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingContent && (
          <div className="mb-3 pr-6">
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm text-foreground">
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{streamingContent}</ReactMarkdown>
              </div>
              <span className="inline-block h-4 w-0.5 animate-pulse bg-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              // Auto-resize
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${activeAgent.name}...`}
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-lg border border-chat-input-border bg-chat-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-chat-input-focus focus:outline-none focus:ring-1 focus:ring-chat-input-focus disabled:cursor-not-allowed disabled:opacity-50"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 rounded-lg bg-destructive p-2 text-foreground hover:bg-destructive/90"
              title="Stop generating"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!content.trim()}
              className="shrink-0 rounded-lg bg-accent-primary p-2 text-accent-primary-text hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
