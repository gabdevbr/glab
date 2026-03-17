'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { wsClient } from '@/lib/ws';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { AgentPanel } from '@/components/ai/AgentPanel';
import { QuickSwitcher } from '@/components/chat/QuickSwitcher';
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

  // Quick Switcher state
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const openQuickSwitcher = useCallback(() => setQuickSwitcherOpen(true), []);

  // Global keyboard shortcuts
  useKeyboardShortcuts({ openQuickSwitcher });

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

  // Request notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

  // Wire notification events (mentions) — browser notification when tab not focused
  useEffect(() => {
    const unsub = wsClient.on('notification', (payload: unknown) => {
      const data = payload as {
        type: string;
        message_id: string;
        channel_id: string;
        from: string;
        content: string;
      };

      // Play notification sound
      try {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {
        // ignore
      }

      // Show browser notification when tab is not focused
      if (
        document.hidden &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const channelName =
          useChannelStore.getState().channels.find((c) => c.id === data.channel_id)?.name || 'a channel';
        const truncated = data.content.length > 80 ? data.content.slice(0, 80) + '...' : data.content;

        const notif = new Notification(`@${data.from} in #${channelName}`, {
          body: truncated,
          icon: '/favicon.ico',
          tag: data.message_id,
        });

        notif.onclick = () => {
          window.focus();
          router.push(`/channel/${data.channel_id}`);
          notif.close();
        };
      }
    });
    return unsub;
  }, [router]);

  // Update document.title with total unread count
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) Glab` : 'Glab';
  }, [unreadCounts]);

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
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar onOpenSearch={openQuickSwitcher} />
      <main className="flex flex-1 overflow-hidden">{children}</main>
      {isPanelOpen && <AgentPanel />}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
    </div>
  );
}
