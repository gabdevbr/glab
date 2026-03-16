'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { wsClient } from '@/lib/ws';
import { Sidebar } from '@/components/sidebar/Sidebar';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const setStatus = usePresenceStore((s) => s.setStatus);
  const bulkSetStatus = usePresenceStore((s) => s.bulkSetStatus);

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
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
