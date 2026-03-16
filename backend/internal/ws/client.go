package ws

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 54 * time.Second
	maxMessageSize = 65536 // 64KB
)

// Client represents a single WebSocket connection.
type Client struct {
	hub           *Hub
	conn          *websocket.Conn
	send          chan []byte
	userID        string
	username      string
	displayName   string
	role          string
	subscriptions map[string]bool
	mu            sync.RWMutex
}

// newClient creates a new Client.
func newClient(hub *Hub, conn *websocket.Conn, userID, username, displayName, role string) *Client {
	return &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		userID:        userID,
		username:      username,
		displayName:   displayName,
		role:          role,
		subscriptions: make(map[string]bool),
	}
}

// readPump pumps messages from the WebSocket connection to the handler.
// It runs in its own goroutine per client.
func (c *Client) readPump(handler *MessageHandler) {
	defer func() {
		handler.onDisconnect(c)
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Error("ws: unexpected close", "user_id", c.userID, "error", err)
			}
			return
		}

		var env Envelope
		if err := json.Unmarshal(message, &env); err != nil {
			slog.Warn("ws: invalid envelope", "user_id", c.userID, "error", err)
			continue
		}

		handler.HandleMessage(c, env)
	}
}

// writePump pumps messages from the send channel to the WebSocket connection.
// It runs in its own goroutine per client.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// sendEnvelope marshals and queues an envelope to be sent to this client.
func (c *Client) sendEnvelope(env Envelope) {
	data, err := marshalEnvelope(env)
	if err != nil {
		slog.Error("ws: failed to marshal envelope", "error", err)
		return
	}
	select {
	case c.send <- data:
	default:
		slog.Warn("ws: send buffer full, dropping message", "user_id", c.userID)
	}
}

// marshalEnvelope serializes an Envelope to JSON bytes.
func marshalEnvelope(env Envelope) ([]byte, error) {
	return json.Marshal(env)
}

// IsSubscribed checks if the client is subscribed to a channel.
func (c *Client) IsSubscribed(channelID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.subscriptions[channelID]
}
