'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useWSStore } from '@/stores/wsStore';
import { wsClient } from '@/lib/ws';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const setConnected = useWSStore((s) => s.setConnected);

  useEffect(() => {
    if (!token) return;

    wsClient.connect(token);

    const unsubHello = wsClient.on('hello', () => {
      setConnected(true);
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
  }, [token, setConnected]);
}
