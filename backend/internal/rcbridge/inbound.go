package rcbridge

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/rcbridge/ddp"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// handleChanged routes a DDP "changed" event.
func (b *Bridge) handleChanged(s *Session, msg ddp.Incoming) {
	switch msg.Collection {
	case "stream-room-messages":
		b.inboundMessage(s, msg.Fields)
	case "stream-notify-room":
		if event, ok := msg.Fields["eventName"].(string); ok {
			args, _ := msg.Fields["args"].([]any)
			b.inboundRoomNotify(s, event, args)
		}
	case "stream-notify-user":
		if event, ok := msg.Fields["eventName"].(string); ok {
			args, _ := msg.Fields["args"].([]any)
			b.inboundUserNotify(s, event, args)
		}
	}
}

func (b *Bridge) handleAdded(_ *Session, _ ddp.Incoming)   {}
func (b *Bridge) handleRemoved(_ *Session, _ ddp.Incoming) {}

// inboundMessage handles a new/edited/deleted message event from RC.
func (b *Bridge) inboundMessage(s *Session, fields map[string]any) {
	args, ok := fields["args"].([]any)
	if !ok || len(args) == 0 {
		return
	}
	rcMsg, ok := args[0].(map[string]any)
	if !ok {
		return
	}

	rcMsgID, _ := rcMsg["_id"].(string)
	rcRoomID, _ := rcMsg["rid"].(string)
	if rcMsgID == "" || rcRoomID == "" {
		return
	}

	channelID, err := b.mapper.ChannelIDForRoom(b.ctx, rcRoomID)
	if err != nil || channelID == "" {
		slog.Debug("rcbridge: unknown room, skipping message", "rc_room_id", rcRoomID)
		return
	}

	text, _ := rcMsg["msg"].(string)

	var senderUserID string
	if from, ok := rcMsg["u"].(map[string]any); ok {
		rcUID, _ := from["_id"].(string)
		if rcUID != "" {
			if id, err := b.mapper.UserIDForRCUser(b.ctx, rcUID, from); err == nil {
				senderUserID = id
			}
		}
	}
	if senderUserID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(b.ctx, 10*time.Second)
	defer cancel()

	if _, edited := rcMsg["editedAt"]; edited {
		b.inboundEdit(ctx, rcMsgID, text)
		return
	}
	if t, _ := rcMsg["t"].(string); t == "rm" {
		b.inboundDelete(ctx, rcMsgID)
		return
	}

	channelUUID, err := pgUUIDFromString(channelID)
	if err != nil {
		return
	}
	senderUUID, err := pgUUIDFromString(senderUserID)
	if err != nil {
		return
	}
	rcTs := extractTimestamp(rcMsg["ts"])

	_, err = b.queries.CreateMessageWithRCID(ctx, repository.CreateMessageWithRCIDParams{
		ChannelID:   channelUUID,
		UserID:      senderUUID,
		ThreadID:    pgtype.UUID{},
		Content:     text,
		ContentType: "text",
		Metadata:    nil,
		RcMessageID: pgtype.Text{String: rcMsgID, Valid: true},
		CreatedAt:   pgtype.Timestamptz{Time: rcTs, Valid: true},
	})
	if err != nil {
		return // duplicate or error — ignore
	}
	_ = b.queries.UpdateChannelLastMessageAt(ctx, channelUUID)

	// Broadcast
	fullMsg, err := b.queries.GetMessageByRCID(ctx, pgtype.Text{String: rcMsgID, Valid: true})
	if err == nil {
		b.broadcastNewMessage(channelID, fullMsg)
	}

	_ = b.queries.UpsertRCSyncCursor(ctx, repository.UpsertRCSyncCursorParams{
		UserID:      senderUUID,
		RcRoomID:    rcRoomID,
		LastSeenTs:  pgtype.Timestamptz{Time: rcTs, Valid: true},
	})
}

func (b *Bridge) inboundEdit(ctx context.Context, rcMsgID, text string) {
	updated, err := b.queries.UpdateMessageByRCID(ctx, repository.UpdateMessageByRCIDParams{
		RcMessageID: pgtype.Text{String: rcMsgID, Valid: true},
		Content:     text,
		EditedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return
	}
	channelID := pgUUIDToString(updated.ChannelID)
	env, err := ws.MakeEnvelope(ws.EventMessageEdited, ws.MessageEditedPayload{
		ID:        pgUUIDToString(updated.ID),
		ChannelID: channelID,
		Content:   updated.Content,
		EditedAt:  tsToString(updated.EditedAt),
	})
	if err == nil {
		b.hub.BroadcastToChannel(channelID, env)
	}
}

func (b *Bridge) inboundDelete(ctx context.Context, rcMsgID string) {
	msg, err := b.queries.GetMessageByRCID(ctx, pgtype.Text{String: rcMsgID, Valid: true})
	if err != nil {
		return
	}
	channelID := pgUUIDToString(msg.ChannelID)
	msgID := pgUUIDToString(msg.ID)

	if err := b.queries.DeleteMessageByRCID(ctx, pgtype.Text{String: rcMsgID, Valid: true}); err != nil {
		return
	}
	env, err := ws.MakeEnvelope(ws.EventMessageDeleted, ws.MessageDeletedPayload{
		ID:        msgID,
		ChannelID: channelID,
	})
	if err == nil {
		b.hub.BroadcastToChannel(channelID, env)
	}
}

func (b *Bridge) inboundRoomNotify(s *Session, event string, args []any) {
	parts := splitEvent(event)
	if len(parts) < 2 {
		return
	}
	rcRoomID, subEvent := parts[0], parts[1]
	channelID, err := b.mapper.ChannelIDForRoom(b.ctx, rcRoomID)
	if err != nil || channelID == "" {
		return
	}
	if subEvent == "deleteMessage" && len(args) > 0 {
		if m, ok := args[0].(map[string]any); ok {
			if rcMsgID, ok := m["_id"].(string); ok {
				ctx, cancel := context.WithTimeout(b.ctx, 5*time.Second)
				defer cancel()
				b.inboundDelete(ctx, rcMsgID)
			}
		}
	}
}

func (b *Bridge) inboundUserNotify(s *Session, event string, args []any) {
	parts := splitEvent(event)
	if len(parts) < 2 {
		return
	}
	if parts[1] == "rooms-changed" && len(args) >= 2 {
		action, _ := args[0].(string)
		room, _ := args[1].(map[string]any)
		if (action == "inserted" || action == "updated") && room != nil {
			rcRoomID, _ := room["_id"].(string)
			if rcRoomID == "" {
				return
			}
			name, _ := room["name"].(string)
			rcType, _ := room["t"].(string)
			ctx, cancel := context.WithTimeout(b.ctx, 5*time.Second)
			if err := b.registerRoom(ctx, rcRoomID, name, rcType, s.userID); err != nil {
				slog.Debug("rcbridge: failed to register dynamic room", "rc_room_id", rcRoomID, "error", err)
			}
			cancel()
			s.subscribeRoom(b.ctx, rcRoomID)
		}
	}
}

// broadcastNewMessage broadcasts an inbound message to Glab WS clients.
func (b *Bridge) broadcastNewMessage(channelID string, row repository.GetMessageByRCIDRow) {
	payload := ws.MessageNewPayload{
		ID:          pgUUIDToString(row.ID),
		ChannelID:   pgUUIDToString(row.ChannelID),
		UserID:      pgUUIDToString(row.UserID),
		Username:    row.Username,
		DisplayName: row.DisplayName,
		AvatarURL:   row.AvatarUrl.String,
		Content:     row.Content,
		ContentType: row.ContentType,
		ThreadID:    pgUUIDToString(row.ThreadID),
		IsBot:       row.IsBot,
		CreatedAt:   tsToString(row.CreatedAt),
	}
	env, err := ws.MakeEnvelope(ws.EventMessageNew, payload)
	if err == nil {
		b.hub.BroadcastToChannel(channelID, env)
	}
}

func extractTimestamp(v any) time.Time {
	if v == nil {
		return time.Now()
	}
	switch t := v.(type) {
	case map[string]any:
		if ms, ok := t["$date"].(float64); ok {
			return time.UnixMilli(int64(ms)).UTC()
		}
	case float64:
		return time.UnixMilli(int64(t)).UTC()
	}
	return time.Now()
}

func tsToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339Nano)
}

func splitEvent(event string) []string {
	for i := 0; i < len(event); i++ {
		if event[i] == '/' {
			return []string{event[:i], event[i+1:]}
		}
	}
	return []string{event}
}
