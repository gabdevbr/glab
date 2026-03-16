package ws

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Auth is done via query param token.
	},
}

// AIDispatcher is the interface the WS handler needs from the AI dispatcher.
type AIDispatcher interface {
	HandleChannelMention(ctx context.Context, agentSlug string, channelID, userID, username, content string)
	HandlePanelChat(ctx context.Context, agentSlug, sessionID, userID, username, content string)
	CancelStream(agentSlug, channelOrUserID string)
}

// MessageHandler dispatches incoming WebSocket messages to the correct business logic.
type MessageHandler struct {
	hub          *Hub
	queries      *repository.Queries
	presence     *PresenceService
	jwtSecret    string
	aiDispatcher AIDispatcher
	agentSlugs   map[string]bool // cached set of known agent slugs
}

// NewMessageHandler creates a new MessageHandler.
func NewMessageHandler(hub *Hub, queries *repository.Queries, presence *PresenceService, jwtSecret string) *MessageHandler {
	return &MessageHandler{
		hub:        hub,
		queries:    queries,
		presence:   presence,
		jwtSecret:  jwtSecret,
		agentSlugs: make(map[string]bool),
	}
}

// SetAIDispatcher sets the AI dispatcher and loads agent slugs.
func (h *MessageHandler) SetAIDispatcher(d AIDispatcher) {
	h.aiDispatcher = d
	h.refreshAgentSlugs()
}

// refreshAgentSlugs loads all active agent slugs from the DB.
func (h *MessageHandler) refreshAgentSlugs() {
	ctx := context.Background()
	agents, err := h.queries.ListAgents(ctx)
	if err != nil {
		slog.Error("ws: failed to load agent slugs", "error", err)
		return
	}
	slugs := make(map[string]bool, len(agents))
	for _, a := range agents {
		slugs[a.Slug] = true
	}
	h.agentSlugs = slugs
	slog.Info("ws: loaded agent slugs", "count", len(slugs))
}

// ServeWS handles the HTTP upgrade to WebSocket.
func (h *MessageHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateToken(token, h.jwtSecret)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws: upgrade failed", "error", err)
		return
	}

	// Look up user to get display_name.
	ctx := context.Background()
	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		slog.Error("ws: invalid user_id in claims", "user_id", claims.UserID, "error", err)
		conn.Close()
		return
	}

	user, err := h.queries.GetUserByID(ctx, userUUID)
	if err != nil {
		slog.Error("ws: failed to get user", "user_id", claims.UserID, "error", err)
		conn.Close()
		return
	}

	client := newClient(h.hub, conn, claims.UserID, claims.Username, user.DisplayName, claims.Role)

	h.hub.Register(client)

	// Load user's channels and auto-subscribe.
	channels, err := h.queries.ListChannelsForUser(ctx, userUUID)
	if err != nil {
		slog.Error("ws: failed to list channels for user", "user_id", claims.UserID, "error", err)
	} else {
		channelIDs := make([]string, len(channels))
		for i, ch := range channels {
			channelIDs[i] = uuidToString(ch.ID)
		}
		h.hub.Subscribe(client, channelIDs)
	}

	// Send hello.
	helloEnv, err := MakeEnvelope(EventHello, HelloPayload{
		UserID:   claims.UserID,
		Username: claims.Username,
	})
	if err == nil {
		client.sendEnvelope(helloEnv)
	}

	// Send initial presence snapshot.
	onlineUsers := h.presence.GetOnlineUsers()
	for uid, status := range onlineUsers {
		env, err := MakeEnvelope(EventPresence, PresenceBroadcast{
			UserID: uid,
			Status: status,
		})
		if err == nil {
			client.sendEnvelope(env)
		}
	}

	// Set user online.
	h.presence.SetOnline(claims.UserID, claims.Username)

	// Start pumps.
	go client.writePump()
	go client.readPump(h)
}

// onDisconnect is called when a client disconnects.
func (h *MessageHandler) onDisconnect(c *Client) {
	h.presence.SetOffline(c.userID, c.username)
}

// HandleMessage dispatches an incoming WebSocket message to the correct handler.
func (h *MessageHandler) HandleMessage(client *Client, env Envelope) {
	switch env.Type {
	case EventMessageSend:
		h.handleMessageSend(client, env)
	case EventMessageEdit:
		h.handleMessageEdit(client, env)
	case EventMessageDelete:
		h.handleMessageDelete(client, env)
	case EventMessagePin:
		h.handleMessagePin(client, env)
	case EventMessageUnpin:
		h.handleMessageUnpin(client, env)
	case EventSubscribe:
		h.handleSubscribe(client, env)
	case EventUnsubscribe:
		h.handleUnsubscribe(client, env)
	case EventChannelRead:
		h.handleChannelRead(client, env)
	case EventTypingStart:
		h.handleTypingStart(client, env)
	case EventTypingStop:
		h.handleTypingStop(client, env)
	case EventPresenceUpdate:
		h.handlePresenceUpdate(client, env)
	case EventAIPrompt:
		h.handleAIPrompt(client, env)
	case EventAIStop:
		h.handleAIStop(client, env)
	case EventReactionAdd:
		h.handleReactionAdd(client, env)
	case EventReactionRemove:
		h.handleReactionRemove(client, env)
	default:
		slog.Warn("ws: unknown event type", "type", env.Type, "user_id", client.userID)
		h.sendAck(client, env.ID, false, "unknown event type", nil)
	}
}

func (h *MessageHandler) handleMessageSend(client *Client, env Envelope) {
	var payload MessageSendPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.Content == "" || payload.ChannelID == "" {
		h.sendAck(client, env.ID, false, "content and channel_id are required", nil)
		return
	}

	// Verify client is subscribed to the channel.
	if !client.IsSubscribed(payload.ChannelID) {
		h.sendAck(client, env.ID, false, "not subscribed to channel", nil)
		return
	}

	ctx := context.Background()
	channelUUID, err := parseUUID(payload.ChannelID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid channel_id", nil)
		return
	}

	userUUID, err := parseUUID(client.userID)
	if err != nil {
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}

	// Parse optional thread ID.
	var threadUUID pgtype.UUID
	if payload.ThreadID != "" {
		threadUUID, err = parseUUID(payload.ThreadID)
		if err != nil {
			h.sendAck(client, env.ID, false, "invalid thread_id", nil)
			return
		}
	}

	msg, err := h.queries.CreateMessage(ctx, repository.CreateMessageParams{
		ChannelID:   channelUUID,
		UserID:      userUUID,
		ThreadID:    threadUUID,
		Content:     payload.Content,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("ws: failed to create message", "error", err)
		h.sendAck(client, env.ID, false, "failed to create message", nil)
		return
	}

	// Fetch full message with user info for broadcast.
	fullMsg, err := h.queries.GetMessageByID(ctx, msg.ID)
	if err != nil {
		slog.Error("ws: failed to fetch created message", "error", err)
		h.sendAck(client, env.ID, false, "message created but failed to fetch", nil)
		return
	}

	newPayload := messageRowToNewPayload(fullMsg)

	broadcastEnv, err := MakeEnvelope(EventMessageNew, newPayload)
	if err != nil {
		slog.Error("ws: failed to make broadcast envelope", "error", err)
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}
	h.hub.BroadcastToChannel(payload.ChannelID, broadcastEnv)

	// If this is a thread reply, update the thread summary.
	if payload.ThreadID != "" {
		parentUUID, err := parseUUID(payload.ThreadID)
		if err == nil {
			_ = h.queries.UpsertThreadSummary(ctx, repository.UpsertThreadSummaryParams{
				MessageID: parentUUID,
				UserID:    userUUID,
			})

			// Broadcast thread.updated so clients can update thread badges.
			summary, err := h.queries.GetThreadSummary(ctx, parentUUID)
			if err == nil {
				threadEnv, err := MakeEnvelope(EventThreadUpdated, ThreadUpdatedPayload{
					MessageID:   payload.ThreadID,
					ChannelID:   payload.ChannelID,
					ReplyCount:  summary.ReplyCount,
					LastReplyAt: timestampToString(summary.LastReplyAt),
				})
				if err == nil {
					h.hub.BroadcastToChannel(payload.ChannelID, threadEnv)
				}
			}
		}
	}

	// Parse @user mentions and create mention records.
	mentionedUserIDs := h.parseUserMentions(ctx, payload.Content, channelUUID)
	for _, mentionUID := range mentionedUserIDs {
		_ = h.queries.CreateMention(ctx, repository.CreateMentionParams{
			MessageID: msg.ID,
			UserID:    mentionUID,
			ChannelID: channelUUID,
		})
		// Notify mentioned user via WS.
		mentionEnv, err := MakeEnvelope(EventNotification, map[string]string{
			"type":       "mention",
			"message_id": uuidToString(msg.ID),
			"channel_id": payload.ChannelID,
			"from":       client.username,
			"content":    payload.Content,
		})
		if err == nil {
			h.hub.SendToUser(uuidToString(mentionUID), mentionEnv)
		}
	}

	// Send ack with the new message ID.
	ackData, _ := json.Marshal(map[string]string{"message_id": uuidToString(msg.ID)})
	h.sendAck(client, env.ID, true, "", ackData)

	// Check for @agent mentions and dispatch AI responses.
	if h.aiDispatcher != nil {
		mentions := h.parseAgentMentions(payload.Content)
		for _, slug := range mentions {
			agentSlug := slug
			go h.aiDispatcher.HandleChannelMention(
				context.Background(),
				agentSlug,
				payload.ChannelID,
				client.userID,
				client.username,
				payload.Content,
			)
		}
	}
}

func (h *MessageHandler) handleMessageEdit(client *Client, env Envelope) {
	var payload MessageEditPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.MessageID == "" || payload.Content == "" {
		h.sendAck(client, env.ID, false, "message_id and content are required", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	// Verify sender owns the message.
	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if uuidToString(existing.UserID) != client.userID {
		h.sendAck(client, env.ID, false, "cannot edit another user's message", nil)
		return
	}

	updated, err := h.queries.UpdateMessageContent(ctx, repository.UpdateMessageContentParams{
		ID:      msgUUID,
		Content: payload.Content,
	})
	if err != nil {
		slog.Error("ws: failed to update message", "error", err)
		h.sendAck(client, env.ID, false, "failed to update message", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	editedEnv, err := MakeEnvelope(EventMessageEdited, MessageEditedPayload{
		ID:        payload.MessageID,
		ChannelID: channelID,
		Content:   payload.Content,
		EditedAt:  timestampToString(updated.EditedAt),
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, editedEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleMessageDelete(client *Client, env Envelope) {
	var payload MessageDeletePayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.MessageID == "" {
		h.sendAck(client, env.ID, false, "message_id is required", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	// Verify ownership or admin role.
	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if uuidToString(existing.UserID) != client.userID && client.role != "admin" {
		h.sendAck(client, env.ID, false, "not authorized to delete this message", nil)
		return
	}

	if err := h.queries.DeleteMessage(ctx, msgUUID); err != nil {
		slog.Error("ws: failed to delete message", "error", err)
		h.sendAck(client, env.ID, false, "failed to delete message", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	deletedEnv, err := MakeEnvelope(EventMessageDeleted, MessageDeletedPayload{
		ID:        payload.MessageID,
		ChannelID: channelID,
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, deletedEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleMessagePin(client *Client, env Envelope) {
	var payload PinPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if err := h.queries.PinMessage(ctx, msgUUID); err != nil {
		slog.Error("ws: failed to pin message", "error", err)
		h.sendAck(client, env.ID, false, "failed to pin message", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	pinnedEnv, err := MakeEnvelope(EventMessagePinned, MessageDeletedPayload{
		ID:        payload.MessageID,
		ChannelID: channelID,
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, pinnedEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleMessageUnpin(client *Client, env Envelope) {
	var payload PinPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if err := h.queries.UnpinMessage(ctx, msgUUID); err != nil {
		slog.Error("ws: failed to unpin message", "error", err)
		h.sendAck(client, env.ID, false, "failed to unpin message", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	unpinnedEnv, err := MakeEnvelope(EventMessageUnpinned, MessageDeletedPayload{
		ID:        payload.MessageID,
		ChannelID: channelID,
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, unpinnedEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleSubscribe(client *Client, env Envelope) {
	var payload SubscribePayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	ctx := context.Background()
	userUUID, err := parseUUID(client.userID)
	if err != nil {
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}

	// Verify membership for each channel before subscribing.
	verified := make([]string, 0, len(payload.ChannelIDs))
	for _, chID := range payload.ChannelIDs {
		chUUID, err := parseUUID(chID)
		if err != nil {
			continue
		}
		isMember, err := h.queries.IsChannelMember(ctx, repository.IsChannelMemberParams{
			ChannelID: chUUID,
			UserID:    userUUID,
		})
		if err != nil || !isMember {
			continue
		}
		verified = append(verified, chID)
	}

	h.hub.Subscribe(client, verified)
	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleUnsubscribe(client *Client, env Envelope) {
	var payload UnsubscribePayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	h.hub.Unsubscribe(client, payload.ChannelIDs)
	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleChannelRead(client *Client, env Envelope) {
	var payload ChannelReadPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	ctx := context.Background()
	chUUID, err := parseUUID(payload.ChannelID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid channel_id", nil)
		return
	}

	userUUID, err := parseUUID(client.userID)
	if err != nil {
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}

	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	if err := h.queries.UpdateLastRead(ctx, repository.UpdateLastReadParams{
		ChannelID:     chUUID,
		UserID:        userUUID,
		LastReadMsgID: msgUUID,
	}); err != nil {
		slog.Error("ws: failed to update last read", "error", err)
		h.sendAck(client, env.ID, false, "failed to update last read", nil)
		return
	}

	// Also mark mentions in this channel as read.
	_ = h.queries.MarkMentionsRead(ctx, repository.MarkMentionsReadParams{
		UserID:    userUUID,
		ChannelID: chUUID,
	})

	h.sendAck(client, env.ID, true, "", nil)
}

func (h *MessageHandler) handleTypingStart(client *Client, env Envelope) {
	var payload TypingPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		return
	}
	h.presence.SetTyping(payload.ChannelID, client.userID, client.username, client.displayName)
}

func (h *MessageHandler) handleTypingStop(client *Client, env Envelope) {
	var payload TypingPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		return
	}
	h.presence.StopTyping(payload.ChannelID, client.userID, client.username, client.displayName)
}

func (h *MessageHandler) handlePresenceUpdate(client *Client, env Envelope) {
	var payload PresenceUpdatePayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	// Also update DB status.
	ctx := context.Background()
	userUUID, err := parseUUID(client.userID)
	if err == nil {
		_ = h.queries.UpdateUserStatus(ctx, repository.UpdateUserStatusParams{
			ID:     userUUID,
			Status: payload.Status,
		})
	}

	h.presence.SetStatus(client.userID, client.username, payload.Status)
	h.sendAck(client, env.ID, true, "", nil)
}

// sendAck sends an acknowledgment envelope to a client.
func (h *MessageHandler) sendAck(client *Client, id string, ok bool, errMsg string, data json.RawMessage) {
	ack := AckPayload{
		OK:    ok,
		Error: errMsg,
		Data:  data,
	}
	env, err := MakeEnvelope(EventAck, ack)
	if err != nil {
		return
	}
	env.ID = id
	client.sendEnvelope(env)
}

// handleAIPrompt processes an ai.prompt event from the client (panel chat).
func (h *MessageHandler) handleAIPrompt(client *Client, env Envelope) {
	if h.aiDispatcher == nil {
		h.sendAck(client, env.ID, false, "AI not available", nil)
		return
	}

	var payload AIPromptPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.AgentSlug == "" || payload.Content == "" {
		h.sendAck(client, env.ID, false, "agent_slug and content are required", nil)
		return
	}

	h.sendAck(client, env.ID, true, "", nil)

	go h.aiDispatcher.HandlePanelChat(
		context.Background(),
		payload.AgentSlug,
		payload.SessionID,
		client.userID,
		client.username,
		payload.Content,
	)
}

// handleAIStop processes an ai.stop event to cancel an active AI stream.
func (h *MessageHandler) handleAIStop(client *Client, env Envelope) {
	if h.aiDispatcher == nil {
		h.sendAck(client, env.ID, false, "AI not available", nil)
		return
	}

	var payload AIStopPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.AgentSlug == "" {
		h.sendAck(client, env.ID, false, "agent_slug is required", nil)
		return
	}

	// Cancel by channel if provided, otherwise by user
	target := payload.ChannelID
	if target == "" {
		target = client.userID
	}
	h.aiDispatcher.CancelStream(payload.AgentSlug, target)
	h.sendAck(client, env.ID, true, "", nil)
}

// parseAgentMentions extracts @slug mentions from message content that match known agents.
func (h *MessageHandler) parseAgentMentions(content string) []string {
	var mentions []string
	seen := make(map[string]bool)

	words := splitMentions(content)
	for _, word := range words {
		if len(word) < 2 || word[0] != '@' {
			continue
		}
		slug := word[1:]
		// Clean trailing punctuation
		slug = trimTrailingPunct(slug)
		if slug == "" {
			continue
		}
		if h.agentSlugs[slug] && !seen[slug] {
			mentions = append(mentions, slug)
			seen[slug] = true
		}
	}
	return mentions
}

// splitMentions splits content into words, preserving @ prefixes.
func splitMentions(s string) []string {
	var words []string
	word := ""
	for _, r := range s {
		if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
			if word != "" {
				words = append(words, word)
				word = ""
			}
		} else {
			word += string(r)
		}
	}
	if word != "" {
		words = append(words, word)
	}
	return words
}

// trimTrailingPunct removes common trailing punctuation from a slug.
func trimTrailingPunct(s string) string {
	for len(s) > 0 {
		last := s[len(s)-1]
		if last == '.' || last == ',' || last == '!' || last == '?' || last == ':' || last == ';' {
			s = s[:len(s)-1]
		} else {
			break
		}
	}
	return s
}

// handleReactionAdd processes a reaction.add event.
func (h *MessageHandler) handleReactionAdd(client *Client, env Envelope) {
	var payload ReactionPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.MessageID == "" || payload.Emoji == "" {
		h.sendAck(client, env.ID, false, "message_id and emoji are required", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	userUUID, err := parseUUID(client.userID)
	if err != nil {
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}

	// Get message to find channel.
	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if err := h.queries.AddReaction(ctx, repository.AddReactionParams{
		MessageID: msgUUID,
		UserID:    userUUID,
		Emoji:     payload.Emoji,
	}); err != nil {
		slog.Error("ws: failed to add reaction", "error", err)
		h.sendAck(client, env.ID, false, "failed to add reaction", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	broadcastEnv, err := MakeEnvelope(EventReactionUpdated, ReactionUpdatedPayload{
		MessageID: payload.MessageID,
		ChannelID: channelID,
		Emoji:     payload.Emoji,
		UserID:    client.userID,
		Username:  client.username,
		Action:    "add",
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, broadcastEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

// handleReactionRemove processes a reaction.remove event.
func (h *MessageHandler) handleReactionRemove(client *Client, env Envelope) {
	var payload ReactionPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.sendAck(client, env.ID, false, "invalid payload", nil)
		return
	}

	if payload.MessageID == "" || payload.Emoji == "" {
		h.sendAck(client, env.ID, false, "message_id and emoji are required", nil)
		return
	}

	ctx := context.Background()
	msgUUID, err := parseUUID(payload.MessageID)
	if err != nil {
		h.sendAck(client, env.ID, false, "invalid message_id", nil)
		return
	}

	userUUID, err := parseUUID(client.userID)
	if err != nil {
		h.sendAck(client, env.ID, false, "internal error", nil)
		return
	}

	existing, err := h.queries.GetMessageByID(ctx, msgUUID)
	if err != nil {
		h.sendAck(client, env.ID, false, "message not found", nil)
		return
	}

	if err := h.queries.RemoveReaction(ctx, repository.RemoveReactionParams{
		MessageID: msgUUID,
		UserID:    userUUID,
		Emoji:     payload.Emoji,
	}); err != nil {
		slog.Error("ws: failed to remove reaction", "error", err)
		h.sendAck(client, env.ID, false, "failed to remove reaction", nil)
		return
	}

	channelID := uuidToString(existing.ChannelID)
	broadcastEnv, err := MakeEnvelope(EventReactionUpdated, ReactionUpdatedPayload{
		MessageID: payload.MessageID,
		ChannelID: channelID,
		Emoji:     payload.Emoji,
		UserID:    client.userID,
		Username:  client.username,
		Action:    "remove",
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, broadcastEnv)
	}

	h.sendAck(client, env.ID, true, "", nil)
}

// parseUserMentions extracts @username mentions from message content that match real users.
// Returns a list of user UUIDs to mention.
func (h *MessageHandler) parseUserMentions(ctx context.Context, content string, channelUUID pgtype.UUID) []pgtype.UUID {
	words := splitMentions(content)
	seen := make(map[string]bool)
	var userIDs []pgtype.UUID

	for _, word := range words {
		if len(word) < 2 || word[0] != '@' {
			continue
		}
		username := word[1:]
		username = trimTrailingPunct(username)
		if username == "" || seen[username] {
			continue
		}
		// Skip agent mentions (handled separately).
		if h.agentSlugs[username] {
			continue
		}
		seen[username] = true

		user, err := h.queries.GetUserByUsername(ctx, username)
		if err != nil {
			continue
		}
		userIDs = append(userIDs, user.ID)
	}
	return userIDs
}

// --- UUID/Timestamp helpers (duplicated from handler to avoid circular deps) ---

func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	clean := ""
	for _, c := range s {
		if c != '-' {
			clean += string(c)
		}
	}
	if len(clean) != 32 {
		return u, fmt.Errorf("invalid UUID: %s", s)
	}
	b, err := hex.DecodeString(clean)
	if err != nil {
		return u, fmt.Errorf("invalid UUID hex: %w", err)
	}
	copy(u.Bytes[:], b)
	u.Valid = true
	return u, nil
}

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func timestampToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.Format(time.RFC3339)
}

// messageRowToNewPayload converts a GetMessageByIDRow to a MessageNewPayload.
func messageRowToNewPayload(m repository.GetMessageByIDRow) MessageNewPayload {
	return MessageNewPayload{
		ID:          uuidToString(m.ID),
		ChannelID:   uuidToString(m.ChannelID),
		UserID:      uuidToString(m.UserID),
		Username:    m.Username,
		DisplayName: m.DisplayName,
		AvatarURL:   m.AvatarUrl.String,
		Content:     m.Content,
		ContentType: m.ContentType,
		ThreadID:    uuidToString(m.ThreadID),
		IsBot:       m.IsBot,
		CreatedAt:   timestampToString(m.CreatedAt),
	}
}
