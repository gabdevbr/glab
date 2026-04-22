package ddp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Handler is called for each inbound DDP message.
type Handler func(msg Incoming)

// Client is a minimal Meteor DDP WebSocket client.
type Client struct {
	url     string
	conn    *websocket.Conn
	mu      sync.Mutex
	counter atomic.Int64

	pending map[string]chan Incoming
	pendMu  sync.Mutex

	handler Handler

	ctx    context.Context
	cancel context.CancelFunc
}

// NewClient creates a DDP client for the given WebSocket URL.
func NewClient(url string, handler Handler) *Client {
	return &Client{
		url:     url,
		pending: make(map[string]chan Incoming),
		handler: handler,
	}
}

// Connect establishes the WebSocket connection and performs the DDP handshake.
func (c *Client) Connect(ctx context.Context) error {
	c.ctx, c.cancel = context.WithCancel(ctx)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.DialContext(ctx, c.url, http.Header{})
	if err != nil {
		return fmt.Errorf("ddp dial: %w", err)
	}
	c.conn = conn

	// Send DDP connect frame
	if err := c.send(Connect{
		Msg:     MsgConnect,
		Version: "1",
		Support: []string{"1"},
	}); err != nil {
		conn.Close()
		return fmt.Errorf("ddp connect send: %w", err)
	}

	// Wait for "connected" acknowledgment
	if err := c.waitConnected(); err != nil {
		conn.Close()
		return err
	}

	// Start read loop in background
	go c.readLoop()

	// Start ping loop in background
	go c.pingLoop()

	return nil
}

// Close tears down the connection.
func (c *Client) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()
}

// Call invokes a server method and returns the result envelope.
func (c *Client) Call(ctx context.Context, method string, params ...any) (Incoming, error) {
	id := fmt.Sprintf("%d", c.counter.Add(1))
	ch := make(chan Incoming, 1)

	c.pendMu.Lock()
	c.pending[id] = ch
	c.pendMu.Unlock()

	defer func() {
		c.pendMu.Lock()
		delete(c.pending, id)
		c.pendMu.Unlock()
	}()

	if params == nil {
		params = []any{}
	}
	if err := c.send(Method{
		Msg:    MsgMethod,
		ID:     id,
		Method: method,
		Params: params,
	}); err != nil {
		return Incoming{}, err
	}

	select {
	case <-ctx.Done():
		return Incoming{}, ctx.Err()
	case result := <-ch:
		if result.Error != nil {
			return result, fmt.Errorf("ddp method %s: %s", method, result.Error.GoError())
		}
		return result, nil
	}
}

// Subscribe subscribes to a named publication with given parameters.
// Returns the subscription ID (use to Unsubscribe later).
func (c *Client) Subscribe(id, name string, params ...any) error {
	if params == nil {
		params = []any{}
	}
	return c.send(Sub{
		Msg:    MsgSub,
		ID:     id,
		Name:   name,
		Params: params,
	})
}

// Unsubscribe cancels a subscription.
func (c *Client) Unsubscribe(id string) error {
	return c.send(Unsub{Msg: MsgUnsub, ID: id})
}

// send serializes and writes a message to the WebSocket.
func (c *Client) send(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("ddp marshal: %w", err)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("ddp: not connected")
	}
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// waitConnected reads the first message and verifies it's "connected".
func (c *Client) waitConnected() error {
	c.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	defer c.conn.SetReadDeadline(time.Time{})

	_, raw, err := c.conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("ddp: waiting for connected: %w", err)
	}
	var msg Incoming
	if err := json.Unmarshal(raw, &msg); err != nil {
		return fmt.Errorf("ddp: parse connected: %w", err)
	}
	if msg.Msg == MsgFailed {
		return fmt.Errorf("ddp: server rejected connection (version mismatch)")
	}
	if msg.Msg != MsgConnected {
		return fmt.Errorf("ddp: expected 'connected', got %q", msg.Msg)
	}
	return nil
}

// readLoop continuously reads messages and dispatches them.
func (c *Client) readLoop() {
	defer c.Close()
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if c.ctx.Err() != nil {
				return // graceful shutdown
			}
			slog.Warn("ddp: read error, closing", "error", err)
			return
		}

		var msg Incoming
		if err := json.Unmarshal(raw, &msg); err != nil {
			slog.Warn("ddp: failed to parse message", "raw", string(raw), "error", err)
			continue
		}

		switch msg.Msg {
		case MsgPing:
			_ = c.send(Pong{Msg: MsgPong})
		case MsgResult:
			c.pendMu.Lock()
			ch, ok := c.pending[msg.ID]
			c.pendMu.Unlock()
			if ok {
				select {
				case ch <- msg:
				default:
				}
			}
		default:
			if c.handler != nil {
				c.handler(msg)
			}
		}
	}
}

// pingLoop sends a DDP ping every 25 seconds to keep the connection alive.
func (c *Client) pingLoop() {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			if err := c.send(Ping{Msg: MsgPing}); err != nil {
				slog.Warn("ddp: ping failed", "error", err)
				return
			}
		}
	}
}
