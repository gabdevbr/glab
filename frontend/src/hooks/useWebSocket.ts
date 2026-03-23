'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useWSStore } from '@/stores/wsStore';
import { wsClient } from '@/lib/ws';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const setConnected = useWSStore((s) => s.setConnected);
  const setNewVersionAvailable = useWSStore((s) => s.setNewVersionAvailable);

  useEffect(() => {
    if (!token) return;

    wsClient.connect(token);

    const unsubHello = wsClient.on('hello', (payload: unknown) => {
      setConnected(true);

      const data = payload as { version?: string };
      const serverVersion = data.version;
      const clientVersion = process.env.NEXT_PUBLIC_APP_VERSION;

      if (
        serverVersion &&
        clientVersion &&
        serverVersion !== 'dev' &&
        clientVersion !== 'dev' &&
        serverVersion !== clientVersion
      ) {
        setNewVersionAvailable(true);
      }
    });

    // Track connection state via polling (WS has no close callback exposed)
    const checkInterval = setInterval(() => {
      setConnected(wsClient.isConnected);
    }, 2000);

    return () => {
      unsubHello();
      clearInterval(checkInterval);
      wsClient.disconnect();
      setConnected(false);
    };
  }, [token, setConnected, setNewVersionAvailable]);
}
