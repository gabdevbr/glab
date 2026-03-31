'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { useSectionStore } from '@/stores/sectionStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { wsClient } from '@/lib/ws';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { QuickSwitcher } from '@/components/chat/QuickSwitcher';
import { Message } from '@/lib/types';
import { UpdateBanner } from '@/components/UpdateBanner';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const fetchSections = useSectionStore((s) => s.fetchSections);
  const incrementUnread = useChannelStore((s) => s.incrementUnread);
  const setStatus = usePresenceStore((s) => s.setStatus);
  const bulkSetStatus = usePresenceStore((s) => s.bulkSetStatus);
  const appendChunk = useAIStreamStore((s) => s.appendChunk);
  const clearStream = useAIStreamStore((s) => s.clearStream);
  const fetchAgentUnreads = useAgentStore((s) => s.fetchAgentUnreads);
  const incrementAgentUnread = useAgentStore((s) => s.incrementAgentUnread);
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
      fetchSections();
      fetchAgentUnreads();
    }
  }, [user, fetchChannels, fetchSections, fetchAgentUnreads]);

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

  // Helper: play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('/notification.wav');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  // Helper: show browser notification
  const showBrowserNotification = useCallback(
    (title: string, body: string, channelId: string, tag: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag,
        });
        notif.onclick = () => {
          window.focus();
          router.push(`/channel/${channelId}`);
          notif.close();
        };
      }
    },
    [router],
  );

  // Wire global unread tracking + notifications for new messages
  useEffect(() => {
    const unsub = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      const currentUserId = useAuthStore.getState().user?.id;
      const currentChannelId = useChannelStore.getState().activeChannelId;

      // Skip own messages
      if (msg.user_id === currentUserId) return;

      // Only notify for channels not currently being viewed
      if (msg.channel_id !== currentChannelId || document.hidden) {
        if (msg.channel_id !== currentChannelId) {
          incrementUnread(msg.channel_id);
          incrementAgentUnread(msg.channel_id);
        }

        // Play sound + browser notification
        playNotificationSound();

        const channelName =
          useChannelStore.getState().channels.find((c) => c.id === msg.channel_id)?.name || 'a channel';
        const truncated = msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content;
        const displayName = msg.display_name || msg.username || 'Someone';

        showBrowserNotification(
          `${displayName} in ${channelName}`,
          truncated,
          msg.channel_id,
          msg.id,
        );
      }
    });
    return unsub;
  }, [incrementUnread, incrementAgentUnread, playNotificationSound, showBrowserNotification]);

  // Wire mention notification events (for @mentions specifically)
  useEffect(() => {
    const unsub = wsClient.on('notification', (payload: unknown) => {
      const data = payload as {
        type: string;
        message_id: string;
        channel_id: string;
        from: string;
        content: string;
      };

      const currentChannelId = useChannelStore.getState().activeChannelId;
      const isViewingChannel = data.channel_id === currentChannelId && !document.hidden;

      // Skip sound if user is actively viewing the channel
      if (!isViewingChannel) {
        playNotificationSound();
      }

      const channelName =
        useChannelStore.getState().channels.find((c) => c.id === data.channel_id)?.name || 'a channel';
      const truncated = data.content.length > 80 ? data.content.slice(0, 80) + '...' : data.content;

      showBrowserNotification(
        `@${data.from} mentioned you in ${channelName}`,
        truncated,
        data.channel_id,
        `mention-${data.message_id}`,
      );
    });
    return unsub;
  }, [playNotificationSound, showBrowserNotification]);

  // Update document.title and favicon badge with total unread count
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) Glab` : 'Glab';
  }, [totalUnread]);
  useFaviconBadge(totalUnread);

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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onOpenSearch={openQuickSwitcher} />
        <main className="flex flex-1 overflow-hidden">{children}</main>
      </div>
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
    </div>
  );
}
