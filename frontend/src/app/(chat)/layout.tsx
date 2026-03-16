'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { wsClient } from '@/lib/ws';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { AgentPanel } from '@/components/ai/AgentPanel';
import { Message } from '@/lib/types';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const incrementUnread = useChannelStore((s) => s.incrementUnread);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setStatus = usePresenceStore((s) => s.setStatus);
  const bulkSetStatus = usePresenceStore((s) => s.bulkSetStatus);
  const appendChunk = useAIStreamStore((s) => s.appendChunk);
  const clearStream = useAIStreamStore((s) => s.clearStream);
  const isPanelOpen = useAgentStore((s) => s.isPanelOpen);

  // Connect WebSocket
  useWebSocket();

  // Load auth from storage
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  // Fetch channels on mount
  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user, fetchChannels]);

  // Wire global WS event handlers for presence
  useEffect(() => {
    const unsubPresence = wsClient.on('presence', (payload: unknown) => {
      const data = payload as { user_id: string; status: string };
      setStatus(data.user_id, data.status);
    });

    const unsubSnapshot = wsClient.on('presence.snapshot', (payload: unknown) => {
      const data = payload as { users: Record<string, string> };
      bulkSetStatus(data.users);
    });

    return () => {
      unsubPresence();
      unsubSnapshot();
    };
  }, [setStatus, bulkSetStatus]);

  // Wire global unread tracking for messages arriving in non-active channels
  useEffect(() => {
    const unsub = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      // Only increment unread for channels not currently being viewed
      // (The channel page handles its own channel)
      if (msg.channel_id !== activeChannelId) {
        incrementUnread(msg.channel_id);
      }
    });
    return unsub;
  }, [activeChannelId, incrementUnread]);

  // Wire AI channel stream events
  useEffect(() => {
    const unsubAIChunk = wsClient.on('ai.chunk', (payload: unknown) => {
      const data = payload as {
        channel_id: string;
        agent_slug: string;
        agent_name: string;
        agent_emoji: string;
        content: string;
        done: boolean;
        message_id?: string;
      };

      if (data.done) {
        clearStream(data.channel_id);
      } else {
        appendChunk(
          data.channel_id,
          data.agent_slug,
          data.agent_name,
          data.agent_emoji,
          data.content,
        );
      }
    });

    return () => {
      unsubAIChunk();
    };
  }, [appendChunk, clearStream]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <main className="flex flex-1 overflow-hidden">{children}</main>
      {isPanelOpen && <AgentPanel />}
    </div>
  );
}
