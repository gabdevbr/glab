type WSEventHandler = (payload: unknown) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private token: string | null = null;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080').replace(/\/+$/, '');
    this.ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

    this.ws.onopen = () => {
      console.log('[WS] connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        const handlers = this.handlers.get(envelope.type);
        handlers?.forEach((h) => h(envelope.payload));
      } catch (e) {
        console.error('[WS] parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] disconnected');
      if (!this.intentionalClose) this.reconnect();
    };

    this.ws.onerror = (e) => {
      console.error('[WS] error:', e);
    };
  }

  private reconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    const jitter = delay * (0.75 + Math.random() * 0.5);
    this.reconnectAttempts++;
    console.log(
      `[WS] reconnecting in ${Math.round(jitter)}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) this.connect(this.token);
    }, jitter);
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(type: string, payload?: unknown, id?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, id, payload }));
    }
  }

  on(type: string, handler: WSEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WSClient();
