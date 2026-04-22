package rcbridge

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gabdevbr/glab/backend/internal/rcbridge/ddp"
)

// Session represents an active DDP connection for one Glab user.
type Session struct {
	userID    string
	rcUserID  string
	rcToken   string
	rcURL     string
	glabRooms []string // rc_room_ids this user is subscribed to

	client  *ddp.Client
	bridge  *Bridge
	mu      sync.Mutex
	cancel  context.CancelFunc
	stopped bool

	subIDs map[string]string // rcRoomID → subID
}

func newSession(userID, rcUserID, rcToken, rcURL string, b *Bridge) *Session {
	return &Session{
		userID:   userID,
		rcUserID: rcUserID,
		rcToken:  rcToken,
		rcURL:    rcURL,
		bridge:   b,
		subIDs:   make(map[string]string),
	}
}

// Start connects to RC DDP and sets up subscriptions.
func (s *Session) Start(ctx context.Context) error {
	sCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	wsURL := strings.Replace(s.rcURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	wsURL += "/websocket"

	client := ddp.NewClient(wsURL, s.handleEvent)
	s.client = client

	if err := client.Connect(sCtx); err != nil {
		cancel()
		return fmt.Errorf("session connect: %w", err)
	}

	// Authenticate with resume token
	_, err := client.Call(sCtx, "login", ddp.LoginParams{Resume: s.rcToken})
	if err != nil {
		cancel()
		client.Close()
		return fmt.Errorf("session login: %w", err)
	}

	slog.Info("rcbridge: session started", "user_id", s.userID, "rc_user_id", s.rcUserID)

	// Subscribe to personal notifications (DMs, subscription changes)
	subID := fmt.Sprintf("notify-user-%s", s.rcUserID)
	s.mu.Lock()
	s.subIDs["__user__"] = subID
	s.mu.Unlock()
	_ = client.Subscribe(subID, "stream-notify-user",
		s.rcUserID+"/rooms-changed", false,
		s.rcUserID+"/subscriptions-changed", false,
	)

	// Load user's rooms and subscribe to each
	go s.subscribeRooms(sCtx)

	return nil
}

// Stop closes the DDP connection.
func (s *Session) Stop() {
	s.mu.Lock()
	s.stopped = true
	s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	if s.client != nil {
		s.client.Close()
	}
	slog.Info("rcbridge: session stopped", "user_id", s.userID)
}

// subscribeRooms fetches the user's subscriptions from RC and subscribes to each room's messages.
func (s *Session) subscribeRooms(ctx context.Context) {
	result, err := s.client.Call(ctx, "subscriptions/get")
	if err != nil {
		slog.Warn("rcbridge: failed to get subscriptions", "user_id", s.userID, "error", err)
		return
	}

	// The result is a list of subscription objects
	rooms, ok := result.Result.([]any)
	if !ok {
		// Could be a {"update":[...],"remove":[...]} map from newer RC
		if m, ok2 := result.Result.(map[string]any); ok2 {
			if u, ok3 := m["update"].([]any); ok3 {
				rooms = u
			}
		}
	}

	for _, r := range rooms {
		rm, ok := r.(map[string]any)
		if !ok {
			continue
		}
		rid, _ := rm["rid"].(string)
		if rid == "" {
			continue
		}
		// Register RC room → Glab channel mapping before subscribing.
		name, _ := rm["name"].(string)
		rcType, _ := rm["t"].(string)
		if err := s.bridge.registerRoom(ctx, rid, name, rcType, s.userID); err != nil {
			slog.Debug("rcbridge: failed to register room", "rc_room_id", rid, "error", err)
		}
		s.subscribeRoom(ctx, rid)
	}
}

// subscribeRoom subscribes to stream-room-messages for a single room.
func (s *Session) subscribeRoom(ctx context.Context, rcRoomID string) {
	s.mu.Lock()
	if _, exists := s.subIDs[rcRoomID]; exists {
		s.mu.Unlock()
		return
	}
	subID := fmt.Sprintf("room-%s-%s", s.userID[:8], rcRoomID)
	s.subIDs[rcRoomID] = subID
	s.mu.Unlock()

	_ = s.client.Subscribe(subID, "stream-room-messages", rcRoomID, false)

	// Also subscribe to typing/delete notifications for this room
	notifySubID := fmt.Sprintf("notify-room-%s-%s", s.userID[:8], rcRoomID)
	s.mu.Lock()
	s.subIDs[rcRoomID+":notify"] = notifySubID
	s.mu.Unlock()
	_ = s.client.Subscribe(notifySubID, "stream-notify-room",
		rcRoomID+"/typing", false,
		rcRoomID+"/deleteMessage", false,
	)

	slog.Debug("rcbridge: subscribed to room", "user_id", s.userID, "rc_room_id", rcRoomID)
}

// handleEvent routes incoming DDP events to the bridge inbound handler.
func (s *Session) handleEvent(msg ddp.Incoming) {
	if s.bridge == nil {
		return
	}

	switch msg.Msg {
	case ddp.MsgChanged:
		s.bridge.handleChanged(s, msg)
	case ddp.MsgAdded:
		s.bridge.handleAdded(s, msg)
	case ddp.MsgRemoved:
		s.bridge.handleRemoved(s, msg)
	case ddp.MsgReady:
		// subscriptions ready - could resume missed messages here
	}
}

// SendMessage sends a message to an RC room on behalf of this user.
func (s *Session) SendMessage(ctx context.Context, rcRoomID, text string) (string, error) {
	msgID := fmt.Sprintf("%d", time.Now().UnixMilli())
	result, err := s.client.Call(ctx, "sendMessage", map[string]any{
		"_id": msgID,
		"rid": rcRoomID,
		"msg": text,
	})
	if err != nil {
		return "", err
	}
	// Extract returned _id from result
	if m, ok := result.Result.(map[string]any); ok {
		if id, ok := m["_id"].(string); ok {
			return id, nil
		}
	}
	return msgID, nil
}

// UpdateMessage edits a message in RC.
func (s *Session) UpdateMessage(ctx context.Context, rcMsgID, text string) error {
	_, err := s.client.Call(ctx, "updateMessage", map[string]any{
		"_id": rcMsgID,
		"msg": text,
	})
	return err
}

// DeleteMessage deletes a message from RC.
func (s *Session) DeleteMessage(ctx context.Context, rcMsgID string) error {
	_, err := s.client.Call(ctx, "deleteMessage", map[string]any{"_id": rcMsgID})
	return err
}

// SetReaction sets or removes a reaction on an RC message.
func (s *Session) SetReaction(ctx context.Context, rcMsgID, emoji string, add bool) error {
	_, err := s.client.Call(ctx, "setReaction", ":"+emoji+":", rcMsgID, add)
	return err
}
