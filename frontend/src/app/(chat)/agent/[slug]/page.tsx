'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAgentStore } from '@/stores/agentStore';
import { useMessageStore } from '@/stores/messageStore';
import { useAuthStore } from '@/stores/authStore';
import { useWSStore } from '@/stores/wsStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { wsClient } from '@/lib/ws';
import { Message } from '@/lib/types';
import { MessageList } from '@/components/chat/MessageList';
import { SessionPanel } from '@/components/ai/SessionPanel';
import { StreamingMessage } from '@/components/chat/StreamingMessage';
import { Send, Square } from 'lucide-react';
import { KeyboardEvent, FormEvent } from 'react';

export default function AgentPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const sessions = useAgentStore((s) => s.sessions);
  const fetchSessions = useAgentStore((s) => s.fetchSessions);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const addMessage = useMessageStore((s) => s.addMessage);
  const appendChunk = useAIStreamStore((s) => s.appendChunk);
  const clearStream = useAIStreamStore((s) => s.clearStream);
  const isConnected = useWSStore((s) => s.isConnected);
  const user = useAuthStore((s) => s.user);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track the stream key for new sessions that don't have a channelId yet
  const streamKeyRef = useRef<string>('pending-new');

  const clearAgentUnread = useAgentStore((s) => s.clearAgentUnread);
  const agent = agents.find((a) => a.slug === slug);

  // Clear agent unread badge when navigating to this agent
  useEffect(() => {
    if (slug) clearAgentUnread(slug);
  }, [slug, clearAgentUnread]);

  // Fetch agent data on mount
  useEffect(() => {
    if (agents.length === 0) fetchAgents();
  }, [agents.length, fetchAgents]);

  // Fetch sessions when agent is available
  useEffect(() => {
    if (slug) fetchSessions(slug);
  }, [slug, fetchSessions]);

  // Load messages when channelId changes
  useEffect(() => {
    if (channelId) fetchMessages(channelId);
  }, [channelId, fetchMessages]);

  // The stream key is the channelId if we have one, otherwise a pending key
  const streamKey = channelId || streamKeyRef.current;
  const activeStream = useAIStreamStore((s) => s.channelStreams[streamKey]);

  // Wire ai.panel.chunk events for this agent
  useEffect(() => {
    if (!agent) return;

    const unsub = wsClient.on('ai.panel.chunk', (payload: unknown) => {
      const data = payload as {
        agent_slug: string;
        session_id: string;
        content: string;
        done: boolean;
        message_id?: string;
      };

      if (data.agent_slug !== agent.slug) return;

      const currentChannelId = channelId;
      const currentStreamKey = currentChannelId || streamKeyRef.current;

      if (data.done) {
        setIsStreaming(false);
        clearStream(currentStreamKey);

        if (data.session_id) {
          // Refetch sessions to get the updated list with channel_id
          fetchSessions(slug).then(() => {
            // After sessions load, find the session and set channelId
            const updatedSessions = useAgentStore.getState().sessions;
            const session = updatedSessions.find((s) => s.id === data.session_id);
            if (session?.channel_id) {
              setChannelId(session.channel_id);
              setActiveSessionId(data.session_id);
              setPendingMessages([]);
              fetchMessages(session.channel_id);
            }
          });
        }
      } else {
        setIsStreaming(true);
        appendChunk(
          currentStreamKey,
          agent.slug,
          agent.name,
          agent.emoji,
          data.content,
        );
      }
    });

    return unsub;
  }, [agent, slug, channelId, appendChunk, clearStream, fetchSessions, fetchMessages]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsStreaming(false);
    setContent('');
    setPendingMessages([]);
    const session = sessions.find((s) => s.id === sessionId);
    if (session?.channel_id) {
      setChannelId(session.channel_id);
    } else {
      setChannelId(null);
    }
  }, [sessions]);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setChannelId(null);
    setIsStreaming(false);
    setContent('');
    setPendingMessages([]);
    streamKeyRef.current = `pending-${Date.now()}`;
  }, []);

  function sendMessage() {
    const trimmed = content.trim();
    if (!trimmed || isStreaming || !agent) return;

    const tempMsg: Message = {
      id: 'temp-' + Date.now(),
      channel_id: channelId || '',
      user_id: user?.id || '',
      username: user?.username || '',
      display_name: user?.display_name || '',
      is_bot: false,
      content: trimmed,
      content_type: 'text',
      is_pinned: false,
      created_at: new Date().toISOString(),
    };

    if (channelId) {
      addMessage(channelId, tempMsg);
    } else {
      // No channel yet (new session) — show in pending messages
      setPendingMessages((prev) => [...prev, tempMsg]);
    }

    wsClient.send('ai.prompt', {
      agent_slug: agent.slug,
      session_id: activeSessionId || undefined,
      content: trimmed,
    });

    setContent('');
    setIsStreaming(true);

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
    if (!agent) return;
    wsClient.send('ai.stop', { agent_slug: agent.slug });
    setIsStreaming(false);
  }

  if (!agent) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-chat-bg">
        <p className="text-sm text-muted-foreground">Carregando agente...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col bg-chat-bg">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-lg">{agent.emoji}</span>
          <h2 className="text-[15px] font-bold text-foreground">{agent.name}</h2>
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none bg-bot-badge-bg text-bot-badge-text">
            BOT
          </span>
          {agent.description && (
            <span className="ml-2 text-xs text-muted-foreground truncate">{agent.description}</span>
          )}
        </header>

        {/* Messages */}
        {channelId ? (
          <MessageList channelId={channelId} />
        ) : pendingMessages.length > 0 || activeStream ? (
          /* New session: show pending user messages + streaming response */
          <div className="flex-1 overflow-y-auto">
            {pendingMessages.map((msg) => (
              <div key={msg.id} className="group flex items-start gap-3 px-5 pt-5 pb-1">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-primary-text">
                  {msg.display_name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">{msg.display_name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {activeStream && (
              <StreamingMessage
                agentName={activeStream.agentName}
                agentEmoji={activeStream.agentEmoji}
                content={activeStream.content}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="text-5xl">{agent.emoji}</span>
            <p className="mt-3 text-sm font-medium text-foreground">{agent.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {agent.description || 'Comece uma conversa!'}
            </p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-4 py-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                const ta = e.target;
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Mensagem para ${agent.name}...`}
              rows={1}
              disabled={isStreaming || !isConnected}
              className="flex-1 resize-none rounded-lg border border-chat-input-border bg-chat-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-chat-input-focus focus:outline-none focus:ring-1 focus:ring-chat-input-focus disabled:cursor-not-allowed disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="shrink-0 rounded-lg bg-destructive p-2 text-foreground hover:bg-destructive/90"
                title="Parar"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!content.trim() || !isConnected}
                className="shrink-0 rounded-lg bg-accent-primary p-2 text-accent-primary-text hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Session panel on the right */}
      <SessionPanel
        agentSlug={slug}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />
    </div>
  );
}
