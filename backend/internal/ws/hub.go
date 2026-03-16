package ws

import (
	"log/slog"
	"sync"
)

// Hub maintains the set of active clients and broadcasts messages to them.
type Hub struct {
	clients    map[*Client]bool
	channels   map[string]map[*Client]bool // channelID -> set of clients
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		channels:   make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub's event loop. Must be called as a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			slog.Info("ws: client registered", "user_id", client.userID, "username", client.username)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				// Remove from all channel subscriptions.
				for chID, members := range h.channels {
					delete(members, client)
					if len(members) == 0 {
						delete(h.channels, chID)
					}
				}
			}
			h.mu.Unlock()
			slog.Info("ws: client unregistered", "user_id", client.userID, "username", client.username)
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Subscribe adds a client to the given channel rooms.
func (h *Hub) Subscribe(client *Client, channelIDs []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, chID := range channelIDs {
		if h.channels[chID] == nil {
			h.channels[chID] = make(map[*Client]bool)
		}
		h.channels[chID][client] = true

		client.mu.Lock()
		client.subscriptions[chID] = true
		client.mu.Unlock()
	}
}

// Unsubscribe removes a client from the given channel rooms.
func (h *Hub) Unsubscribe(client *Client, channelIDs []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, chID := range channelIDs {
		if members, ok := h.channels[chID]; ok {
			delete(members, client)
			if len(members) == 0 {
				delete(h.channels, chID)
			}
		}
		client.mu.Lock()
		delete(client.subscriptions, chID)
		client.mu.Unlock()
	}
}

// BroadcastToChannel sends an envelope to all clients subscribed to the channel.
func (h *Hub) BroadcastToChannel(channelID string, envelope Envelope) {
	data, err := marshalEnvelope(envelope)
	if err != nil {
		slog.Error("ws: failed to marshal envelope for broadcast", "error", err)
		return
	}

	h.mu.RLock()
	members := h.channels[channelID]
	// Copy to avoid holding the lock while writing to channels.
	targets := make([]*Client, 0, len(members))
	for c := range members {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- data:
		default:
			// Client's send buffer is full; drop the message.
			slog.Warn("ws: dropping message for slow client", "user_id", c.userID)
		}
	}
}

// SendToUser sends an envelope to all connections belonging to a specific user.
func (h *Hub) SendToUser(userID string, envelope Envelope) {
	data, err := marshalEnvelope(envelope)
	if err != nil {
		slog.Error("ws: failed to marshal envelope for user send", "error", err)
		return
	}

	h.mu.RLock()
	targets := make([]*Client, 0)
	for c := range h.clients {
		if c.userID == userID {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- data:
		default:
			slog.Warn("ws: dropping message for slow client", "user_id", c.userID)
		}
	}
}

// BroadcastToAdmins sends an envelope to all connected admin clients.
func (h *Hub) BroadcastToAdmins(envelope Envelope) {
	data, err := marshalEnvelope(envelope)
	if err != nil {
		slog.Error("ws: failed to marshal envelope for admin broadcast", "error", err)
		return
	}

	h.mu.RLock()
	targets := make([]*Client, 0)
	for c := range h.clients {
		if c.role == "admin" {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- data:
		default:
			slog.Warn("ws: dropping message for slow admin client", "user_id", c.userID)
		}
	}
}

// BroadcastToAll sends an envelope to every connected client.
func (h *Hub) BroadcastToAll(envelope Envelope) {
	data, err := marshalEnvelope(envelope)
	if err != nil {
		slog.Error("ws: failed to marshal envelope for broadcast all", "error", err)
		return
	}

	h.mu.RLock()
	targets := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- data:
		default:
			slog.Warn("ws: dropping message for slow client", "user_id", c.userID)
		}
	}
}
