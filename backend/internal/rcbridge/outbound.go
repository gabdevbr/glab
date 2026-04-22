package rcbridge

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// OutboundEvent is sent by the bridge when a Glab event should be forwarded to RC.
type OutboundEvent struct {
	Type      string
	ChannelID string
	UserID    string
	Payload   ws.Envelope
}

// processOutbound reads from the outbound channel and forwards events to RC.
func (b *Bridge) processOutbound() {
	for {
		select {
		case <-b.ctx.Done():
			return
		case ev, ok := <-b.outboundCh:
			if !ok {
				return
			}
			b.dispatchOutbound(ev)
		}
	}
}

// dispatchOutbound forwards a Glab event to RC via the sender's DDP session.
func (b *Bridge) dispatchOutbound(ev OutboundEvent) {
	s := b.pool.Get(ev.UserID)
	if s == nil {
		return // no active RC session for this user
	}

	ctx, cancel := context.WithTimeout(b.ctx, 10*time.Second)
	defer cancel()

	switch ev.Type {
	case ws.EventMessageNew:
		b.outboundSend(ctx, s, ev)
	case ws.EventMessageEdited:
		b.outboundEdit(ctx, s, ev)
	case ws.EventMessageDeleted:
		b.outboundDelete(ctx, s, ev)
	case ws.EventReactionUpdated:
		b.outboundReaction(ctx, s, ev)
	}
}

func (b *Bridge) outboundSend(ctx context.Context, s *Session, ev OutboundEvent) {
	// ev.Payload.Payload is json.RawMessage — we need to parse it
	var p ws.MessageNewPayload
	if err := parsePayload(ev.Payload, &p); err != nil {
		return
	}
	if p.ID == "" || p.Content == "" {
		return
	}

	// Only forward messages that didn't come from RC (no rc_message_id set yet)
	// We detect this via the absence of RcMessageID — which we check by looking it up
	msgUUID, err := pgUUIDFromString(p.ID)
	if err != nil {
		return
	}
	row, err := b.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		return
	}
	if row.RcMessageID.Valid && row.RcMessageID.String != "" {
		return // already came from RC
	}

	rcRoomID, err := b.mapper.RCRoomIDForChannel(ctx, ev.ChannelID)
	if err != nil || rcRoomID == "" {
		return // channel not bridged
	}

	rcMsgID, err := s.SendMessage(ctx, rcRoomID, p.Content)
	if err != nil {
		slog.Warn("rcbridge: outbound send failed", "error", err, "user_id", ev.UserID)
		return
	}

	_ = b.queries.UpdateMessageRCID(ctx, repository.UpdateMessageRCIDParams{
		ID:          msgUUID,
		RcMessageID: pgtype.Text{String: rcMsgID, Valid: true},
	})
}

func (b *Bridge) outboundEdit(ctx context.Context, s *Session, ev OutboundEvent) {
	var p ws.MessageEditedPayload
	if err := parsePayload(ev.Payload, &p); err != nil {
		return
	}
	if p.ID == "" {
		return
	}
	msgUUID, err := pgUUIDFromString(p.ID)
	if err != nil {
		return
	}
	row, err := b.queries.GetMessageByID(ctx, msgUUID)
	if err != nil || !row.RcMessageID.Valid {
		return
	}
	if err := s.UpdateMessage(ctx, row.RcMessageID.String, p.Content); err != nil {
		slog.Warn("rcbridge: outbound edit failed", "error", err)
	}
}

func (b *Bridge) outboundDelete(ctx context.Context, s *Session, ev OutboundEvent) {
	var p ws.MessageDeletedPayload
	if err := parsePayload(ev.Payload, &p); err != nil {
		return
	}
	if p.ID == "" {
		return
	}
	msgUUID, err := pgUUIDFromString(p.ID)
	if err != nil {
		return
	}
	row, err := b.queries.GetMessageByID(ctx, msgUUID)
	if err != nil || !row.RcMessageID.Valid {
		return
	}
	if err := s.DeleteMessage(ctx, row.RcMessageID.String); err != nil {
		slog.Warn("rcbridge: outbound delete failed", "error", err)
	}
}

func (b *Bridge) outboundReaction(ctx context.Context, s *Session, ev OutboundEvent) {
	var p ws.ReactionUpdatedPayload
	if err := parsePayload(ev.Payload, &p); err != nil {
		return
	}
	if p.MessageID == "" || p.Emoji == "" {
		return
	}
	msgUUID, err := pgUUIDFromString(p.MessageID)
	if err != nil {
		return
	}
	row, err := b.queries.GetMessageByID(ctx, msgUUID)
	if err != nil || !row.RcMessageID.Valid {
		return
	}
	if err := s.SetReaction(ctx, row.RcMessageID.String, p.Emoji, p.Action == "add"); err != nil {
		slog.Warn("rcbridge: outbound reaction failed", "error", err, "action", p.Action)
	}
}
