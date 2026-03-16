'use client';

import { useEffect } from 'react';
import { useChannelStore } from '@/stores/channelStore';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function ChatHome() {
  const { channels, isLoading, fetchChannels } = useChannelStore();
  const { isConnected } = useWebSocket();

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-50">Glab</h1>
        <p className="mt-2 text-slate-400">
          {isLoading
            ? 'Loading channels...'
            : channels.length > 0
              ? 'Select a channel from the sidebar to get started'
              : 'No channels yet. Create one to get started.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    </div>
  );
}
