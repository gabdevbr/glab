package rcbridge

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

// Mapper resolves RC IDs ↔ Glab UUIDs with an in-memory LRU-style cache.
type Mapper struct {
	queries *repository.Queries

	roomCache sync.Map // rcRoomID → channelID string
	userCache sync.Map // rcUserID → glabUserID string
}

func newMapper(q *repository.Queries) *Mapper {
	return &Mapper{queries: q}
}

// ChannelIDForRoom returns the Glab channel UUID for a RC room ID.
func (m *Mapper) ChannelIDForRoom(ctx context.Context, rcRoomID string) (string, error) {
	if v, ok := m.roomCache.Load(rcRoomID); ok {
		return v.(string), nil
	}
	ch, err := m.queries.GetChannelByRCRoomID(ctx, pgtype.Text{String: rcRoomID, Valid: true})
	if err != nil {
		return "", fmt.Errorf("mapper: room %s not found: %w", rcRoomID, err)
	}
	id := pgUUIDToString(ch.ID)
	m.roomCache.Store(rcRoomID, id)
	return id, nil
}

// RCRoomIDForChannel returns the RC room ID for a Glab channel UUID.
func (m *Mapper) RCRoomIDForChannel(ctx context.Context, channelID string) (string, error) {
	uid, err := pgUUIDFromString(channelID)
	if err != nil {
		return "", err
	}
	ch, err := m.queries.GetChannelByID(ctx, uid)
	if err != nil {
		return "", err
	}
	if !ch.RcRoomID.Valid {
		return "", nil
	}
	return ch.RcRoomID.String, nil
}

// UserIDForRCUser returns the Glab user UUID for a RC user, creating a shadow user if needed.
func (m *Mapper) UserIDForRCUser(ctx context.Context, rcUserID string, rcUserData map[string]any) (string, error) {
	if v, ok := m.userCache.Load(rcUserID); ok {
		return v.(string), nil
	}

	user, err := m.queries.GetUserByRCUserID(ctx, pgtype.Text{String: rcUserID, Valid: true})
	if err == nil {
		id := pgUUIDToString(user.ID)
		m.userCache.Store(rcUserID, id)
		return id, nil
	}

	// Create shadow user from RC data
	username, _ := rcUserData["username"].(string)
	name, _ := rcUserData["name"].(string)
	if username == "" {
		username = "rc_" + rcUserID[:8]
	}
	if name == "" {
		name = username
	}
	email := username + "@rc.bridge"

	created, err := m.queries.UpsertUserByRCLogin(ctx, repository.UpsertUserByRCLoginParams{
		Username:    username,
		Email:       email,
		DisplayName: name,
		PasswordHash: "!rc-shadow",
		RcUserID:    pgtype.Text{String: rcUserID, Valid: true},
	})
	if err != nil {
		return "", fmt.Errorf("mapper: create shadow user for %s: %w", rcUserID, err)
	}

	id := pgUUIDToString(created.ID)
	m.userCache.Store(rcUserID, id)
	slog.Info("rcbridge: created shadow user", "rc_user_id", rcUserID, "username", username)
	return id, nil
}

// RegisterRoom stores a RC room → Glab channel mapping in the DB.
func (m *Mapper) RegisterRoom(ctx context.Context, rcRoomID, channelID string) {
	m.roomCache.Store(rcRoomID, channelID)
	// The DB column is updated by UpsertChannelByRCRoomID; this just warms the cache.
}
