package ws

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	presencePrefix = "presence:"
	typingPrefix   = "typing:"
	presenceTTL    = 120 * time.Second
	typingTTL      = 5 * time.Second
)

// PresenceService manages user presence and typing indicators via Redis.
type PresenceService struct {
	rdb *redis.Client
	hub *Hub
}

// NewPresenceService creates a new PresenceService.
func NewPresenceService(rdb *redis.Client, hub *Hub) *PresenceService {
	return &PresenceService{rdb: rdb, hub: hub}
}

// SetOnline marks a user as online in Redis with a TTL.
func (p *PresenceService) SetOnline(userID, username string) {
	ctx := context.Background()
	key := presencePrefix + userID
	if err := p.rdb.Set(ctx, key, "online", presenceTTL).Err(); err != nil {
		slog.Error("presence: failed to set online", "user_id", userID, "error", err)
		return
	}

	env, err := MakeEnvelope(EventPresence, PresenceBroadcast{
		UserID:   userID,
		Username: username,
		Status:   "online",
	})
	if err != nil {
		slog.Error("presence: failed to make envelope", "error", err)
		return
	}
	p.hub.BroadcastToAll(env)
}

// SetStatus updates a user's status in Redis and broadcasts the change.
func (p *PresenceService) SetStatus(userID, username, status string) {
	ctx := context.Background()
	key := presencePrefix + userID
	if err := p.rdb.Set(ctx, key, status, presenceTTL).Err(); err != nil {
		slog.Error("presence: failed to set status", "user_id", userID, "error", err)
		return
	}

	env, err := MakeEnvelope(EventPresence, PresenceBroadcast{
		UserID:   userID,
		Username: username,
		Status:   status,
	})
	if err != nil {
		slog.Error("presence: failed to make envelope", "error", err)
		return
	}
	p.hub.BroadcastToAll(env)
}

// SetOffline removes the user's presence from Redis and broadcasts offline.
func (p *PresenceService) SetOffline(userID, username string) {
	ctx := context.Background()
	key := presencePrefix + userID
	if err := p.rdb.Del(ctx, key).Err(); err != nil {
		slog.Error("presence: failed to delete presence", "user_id", userID, "error", err)
	}

	env, err := MakeEnvelope(EventPresence, PresenceBroadcast{
		UserID:   userID,
		Username: username,
		Status:   "offline",
	})
	if err != nil {
		slog.Error("presence: failed to make envelope", "error", err)
		return
	}
	p.hub.BroadcastToAll(env)
}

// RefreshPresence extends the TTL of a user's presence key.
func (p *PresenceService) RefreshPresence(userID string) {
	ctx := context.Background()
	key := presencePrefix + userID
	if err := p.rdb.Expire(ctx, key, presenceTTL).Err(); err != nil {
		slog.Error("presence: failed to refresh TTL", "user_id", userID, "error", err)
	}
}

// GetOnlineUsers returns a map of userID -> status for all online users.
func (p *PresenceService) GetOnlineUsers() map[string]string {
	ctx := context.Background()
	result := make(map[string]string)

	var cursor uint64
	for {
		keys, nextCursor, err := p.rdb.Scan(ctx, cursor, presencePrefix+"*", 100).Result()
		if err != nil {
			slog.Error("presence: failed to scan keys", "error", err)
			return result
		}

		for _, key := range keys {
			userID := strings.TrimPrefix(key, presencePrefix)
			status, err := p.rdb.Get(ctx, key).Result()
			if err != nil {
				continue
			}
			result[userID] = status
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return result
}

// SetTyping marks a user as typing in a channel and broadcasts the event.
func (p *PresenceService) SetTyping(channelID, userID, username, displayName string) {
	ctx := context.Background()
	key := typingPrefix + channelID + ":" + userID
	if err := p.rdb.Set(ctx, key, "1", typingTTL).Err(); err != nil {
		slog.Error("presence: failed to set typing", "user_id", userID, "error", err)
		return
	}

	env, err := MakeEnvelope(EventTyping, TypingBroadcast{
		ChannelID:   channelID,
		UserID:      userID,
		Username:    username,
		DisplayName: displayName,
		IsTyping:    true,
	})
	if err != nil {
		slog.Error("presence: failed to make typing envelope", "error", err)
		return
	}
	p.hub.BroadcastToChannel(channelID, env)
}

// StopTyping removes the typing indicator and broadcasts the stop event.
func (p *PresenceService) StopTyping(channelID, userID, username, displayName string) {
	ctx := context.Background()
	key := typingPrefix + channelID + ":" + userID
	if err := p.rdb.Del(ctx, key).Err(); err != nil {
		slog.Error("presence: failed to delete typing", "user_id", userID, "error", err)
	}

	env, err := MakeEnvelope(EventTyping, TypingBroadcast{
		ChannelID:   channelID,
		UserID:      userID,
		Username:    username,
		DisplayName: displayName,
		IsTyping:    false,
	})
	if err != nil {
		slog.Error("presence: failed to make typing envelope", "error", err)
		return
	}
	p.hub.BroadcastToChannel(channelID, env)
}
