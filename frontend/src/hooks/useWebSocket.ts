'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { wsClient } from '@/lib/ws';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    wsClient.connect(token);

    const unsubHello = wsClient.on('hello', () => {
      setIsConnected(true);
    });

    // Track connection state via close
    const checkInterval = setInterval(() => {
      setIsConnected(wsClient.isConnected);
    }, 2000);

    return () => {
      unsubHello();
      clearInterval(checkInterval);
      wsClient.disconnect();
      setIsConnected(false);
    };
  }, [token]);

  return { isConnected };
}
