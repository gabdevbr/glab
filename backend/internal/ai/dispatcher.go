package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/ws"
)

const maxConcurrentPerAgent = 3

// Dispatcher orchestrates AI agent interactions.
type Dispatcher struct {
	bridge  *BridgeClient
	queries *repository.Queries
	hub     *ws.Hub

	// Per-agent concurrency limiter
	mu   sync.Mutex
	sema map[string]chan struct{}

	// Active stream cancellations: key = "agentSlug:channelID" or "agentSlug:userID"
	cancelMu sync.Mutex
	cancels  map[string]context.CancelFunc
}

// NewDispatcher creates a new Dispatcher.
func NewDispatcher(bridge *BridgeClient, queries *repository.Queries, hub *ws.Hub) *Dispatcher {
	return &Dispatcher{
		bridge:  bridge,
		queries: queries,
		hub:     hub,
		sema:    make(map[string]chan struct{}),
		cancels: make(map[string]context.CancelFunc),
	}
}

// acquireSema gets or creates a semaphore for the given agent and acquires a slot.
func (d *Dispatcher) acquireSema(agentSlug string) {
	d.mu.Lock()
	sem, ok := d.sema[agentSlug]
	if !ok {
		sem = make(chan struct{}, maxConcurrentPerAgent)
		d.sema[agentSlug] = sem
	}
	d.mu.Unlock()
	sem <- struct{}{}
}

// releaseSema releases a slot on the agent's semaphore.
func (d *Dispatcher) releaseSema(agentSlug string) {
	d.mu.Lock()
	sem := d.sema[agentSlug]
	d.mu.Unlock()
	if sem != nil {
		<-sem
	}
}

// registerCancel stores a cancel func for an active stream.
func (d *Dispatcher) registerCancel(key string, cancel context.CancelFunc) {
	d.cancelMu.Lock()
	d.cancels[key] = cancel
	d.cancelMu.Unlock()
}

// removeCancel removes a cancel func.
func (d *Dispatcher) removeCancel(key string) {
	d.cancelMu.Lock()
	delete(d.cancels, key)
	d.cancelMu.Unlock()
}

// CancelStream cancels an active stream by key.
func (d *Dispatcher) CancelStream(agentSlug, channelOrUserID string) {
	key := agentSlug + ":" + channelOrUserID
	d.cancelMu.Lock()
	cancel, ok := d.cancels[key]
	d.cancelMu.Unlock()
	if ok {
		cancel()
	}
}

// HandleChannelMention processes an @agent mention in a channel message.
func (d *Dispatcher) HandleChannelMention(ctx context.Context, agentSlug string, channelID, userID, username, content string) {
	d.acquireSema(agentSlug)
	defer d.releaseSema(agentSlug)

	startTime := time.Now()

	agent, err := d.queries.GetAgentBySlug(ctx, agentSlug)
	if err != nil {
		slog.Error("ai: agent not found", "slug", agentSlug, "error", err)
		return
	}

	// Build message context
	channelUUID, err := parseUUID(channelID)
	if err != nil {
		slog.Error("ai: invalid channel_id", "channel_id", channelID, "error", err)
		return
	}

	limit := agent.MaxContextMessages
	if limit <= 0 {
		limit = 20
	}

	recentMsgs, err := d.queries.ListChannelMessages(ctx, repository.ListChannelMessagesParams{
		ChannelID: channelUUID,
		Limit:     limit,
		Offset:    0,
	})
	if err != nil {
		slog.Error("ai: failed to load channel messages", "error", err)
		return
	}

	// Build chat messages: system + recent history
	var chatMessages []ChatMessage
	if agent.SystemPrompt.Valid && agent.SystemPrompt.String != "" {
		chatMessages = append(chatMessages, ChatMessage{Role: "system", Content: agent.SystemPrompt.String})
	}

	// recentMsgs is newest-first, reverse for chronological order
	for i := len(recentMsgs) - 1; i >= 0; i-- {
		msg := recentMsgs[i]
		role := "user"
		if msg.UserID == agent.UserID {
			role = "assistant"
		}
		chatMessages = append(chatMessages, ChatMessage{
			Role:    role,
			Content: msg.Content,
		})
	}

	// If current content not already in the history, add it
	if len(recentMsgs) == 0 || recentMsgs[0].Content != content {
		chatMessages = append(chatMessages, ChatMessage{Role: "user", Content: content})
	}

	// Send typing indicator
	typingEnv, _ := ws.MakeEnvelope(ws.EventTyping, ws.TypingBroadcast{
		ChannelID:   channelID,
		UserID:      uuidToString(agent.UserID),
		Username:    agent.Slug,
		DisplayName: agent.Name,
		IsTyping:    true,
	})
	d.hub.BroadcastToChannel(channelID, typingEnv)

	// Create cancellable context for streaming
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	cancelKey := agentSlug + ":" + channelID
	d.registerCancel(cancelKey, cancel)
	defer d.removeCancel(cancelKey)

	// Get gateway token
	gatewayToken := ""
	if agent.GatewayToken.Valid {
		gatewayToken = agent.GatewayToken.String
	}

	// Start streaming
	chunks, err := d.bridge.Stream(streamCtx, agent.GatewayUrl, gatewayToken, agent.Model, chatMessages, int(agent.MaxTokens), agent.Temperature)
	if err != nil {
		slog.Error("ai: failed to start stream", "agent", agentSlug, "error", err)
		return
	}

	var fullContent strings.Builder

	for chunk := range chunks {
		if chunk.Content != "" {
			fullContent.WriteString(chunk.Content)

			// Broadcast chunk to channel
			chunkEnv, _ := ws.MakeEnvelope(ws.EventAIChunk, ws.AIChunkPayload{
				ChannelID:  channelID,
				AgentSlug:  agent.Slug,
				AgentName:  agent.Name,
				AgentEmoji: agent.Emoji.String,
				Content:    chunk.Content,
				Done:       false,
			})
			d.hub.BroadcastToChannel(channelID, chunkEnv)
		}

		if chunk.Done {
			break
		}
	}

	// Stop typing
	stopTypingEnv, _ := ws.MakeEnvelope(ws.EventTyping, ws.TypingBroadcast{
		ChannelID:   channelID,
		UserID:      uuidToString(agent.UserID),
		Username:    agent.Slug,
		DisplayName: agent.Name,
		IsTyping:    false,
	})
	d.hub.BroadcastToChannel(channelID, stopTypingEnv)

	responseText := fullContent.String()
	if responseText == "" {
		return
	}

	// Persist agent's response as a message
	agentMsg, err := d.queries.CreateMessage(ctx, repository.CreateMessageParams{
		ChannelID:   channelUUID,
		UserID:      agent.UserID,
		Content:     responseText,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("ai: failed to persist agent message", "error", err)
		return
	}

	// Fetch full message for broadcast
	fullMsg, err := d.queries.GetMessageByID(ctx, agentMsg.ID)
	if err != nil {
		slog.Error("ai: failed to fetch persisted message", "error", err)
		return
	}

	// Broadcast the final message.new event
	newMsgEnv, _ := ws.MakeEnvelope(ws.EventMessageNew, ws.MessageNewPayload{
		ID:          uuidToString(fullMsg.ID),
		ChannelID:   uuidToString(fullMsg.ChannelID),
		UserID:      uuidToString(fullMsg.UserID),
		Username:    fullMsg.Username,
		DisplayName: fullMsg.DisplayName,
		AvatarURL:   fullMsg.AvatarUrl.String,
		Content:     fullMsg.Content,
		ContentType: fullMsg.ContentType,
		IsBot:       fullMsg.IsBot,
		CreatedAt:   fullMsg.CreatedAt.Time.Format(time.RFC3339),
	})
	d.hub.BroadcastToChannel(channelID, newMsgEnv)

	// Send done chunk with message ID
	doneEnv, _ := ws.MakeEnvelope(ws.EventAIChunk, ws.AIChunkPayload{
		ChannelID:  channelID,
		AgentSlug:  agent.Slug,
		AgentName:  agent.Name,
		AgentEmoji: agent.Emoji.String,
		Content:    "",
		Done:       true,
		MessageID:  uuidToString(agentMsg.ID),
	})
	d.hub.BroadcastToChannel(channelID, doneEnv)

	// Log usage
	elapsed := time.Since(startTime).Milliseconds()
	userUUID, _ := parseUUID(userID)
	_ = d.queries.CreateAgentUsage(ctx, repository.CreateAgentUsageParams{
		AgentID:        agent.ID,
		UserID:         userUUID,
		ChannelID:      channelUUID,
		MessageID:      agentMsg.ID,
		OutputTokens:   int32(len(responseText) / 4), // rough estimate
		ResponseTimeMs: int32(elapsed),
		ModelUsed:      pgtype.Text{String: agent.Model, Valid: true},
		Source:         pgtype.Text{String: "channel_mention", Valid: true},
	})

	slog.Info("ai: channel mention completed",
		"agent", agentSlug,
		"channel", channelID,
		"user", username,
		"response_len", len(responseText),
		"elapsed_ms", elapsed,
	)
}

// HandlePanelChat processes a message in the agent panel (direct chat).
func (d *Dispatcher) HandlePanelChat(ctx context.Context, agentSlug, sessionID, userID, username, content string) {
	d.acquireSema(agentSlug)
	defer d.releaseSema(agentSlug)

	startTime := time.Now()

	agent, err := d.queries.GetAgentBySlug(ctx, agentSlug)
	if err != nil {
		slog.Error("ai: agent not found for panel", "slug", agentSlug, "error", err)
		return
	}

	userUUID, err := parseUUID(userID)
	if err != nil {
		slog.Error("ai: invalid user_id", "user_id", userID, "error", err)
		return
	}

	var session repository.AgentSession
	var sessionUUID pgtype.UUID
	var sessionChannelUUID pgtype.UUID

	if sessionID != "" {
		sessionUUID, err = parseUUID(sessionID)
		if err != nil {
			slog.Error("ai: invalid session_id", "session_id", sessionID, "error", err)
			return
		}
		session, err = d.queries.GetAgentSession(ctx, sessionUUID)
		if err != nil {
			slog.Error("ai: session not found", "session_id", sessionID, "error", err)
			return
		}
	} else {
		// Create a new session
		title := content
		if len(title) > 60 {
			title = title[:60] + "..."
		}
		session, err = d.queries.CreateAgentSession(ctx, repository.CreateAgentSessionParams{
			AgentID: agent.ID,
			UserID:  userUUID,
			Title:   pgtype.Text{String: title, Valid: true},
		})
		if err != nil {
			slog.Error("ai: failed to create session", "error", err)
			return
		}
		sessionUUID = session.ID
		sessionID = uuidToString(session.ID)
	}

	// Create a private channel for this session if it doesn't exist yet
	sessionChannelSlug := fmt.Sprintf("agent-session-%s", sessionID)
	existingCh, err := d.queries.GetChannelBySlug(ctx, sessionChannelSlug)
	if err != nil {
		// Channel doesn't exist, create it
		ch, createErr := d.queries.CreateChannel(ctx, repository.CreateChannelParams{
			Name:      fmt.Sprintf("%s Session", agent.Name),
			Slug:      sessionChannelSlug,
			Type:      "private",
			CreatedBy: agent.UserID,
		})
		if createErr != nil {
			slog.Error("ai: failed to create session channel", "error", createErr)
			return
		}
		sessionChannelUUID = ch.ID

		// Add both user and agent as members
		_ = d.queries.AddChannelMember(ctx, repository.AddChannelMemberParams{
			ChannelID: ch.ID,
			UserID:    userUUID,
			Role:      "member",
		})
		_ = d.queries.AddChannelMember(ctx, repository.AddChannelMemberParams{
			ChannelID: ch.ID,
			UserID:    agent.UserID,
			Role:      "member",
		})
	} else {
		sessionChannelUUID = existingCh.ID
	}

	// Persist user message
	_, err = d.queries.CreateMessage(ctx, repository.CreateMessageParams{
		ChannelID:   sessionChannelUUID,
		UserID:      userUUID,
		Content:     content,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("ai: failed to persist user message", "error", err)
		return
	}

	// Load session history for context
	historyMsgs, err := d.queries.GetSessionMessages(ctx, sessionChannelUUID)
	if err != nil {
		slog.Error("ai: failed to load session history", "error", err)
		return
	}

	// Build chat messages
	var chatMessages []ChatMessage
	if agent.SystemPrompt.Valid && agent.SystemPrompt.String != "" {
		chatMessages = append(chatMessages, ChatMessage{Role: "system", Content: agent.SystemPrompt.String})
	}

	// Limit to max_context_messages
	maxCtx := int(agent.MaxContextMessages)
	if maxCtx <= 0 {
		maxCtx = 20
	}
	startIdx := 0
	if len(historyMsgs) > maxCtx {
		startIdx = len(historyMsgs) - maxCtx
	}

	for _, msg := range historyMsgs[startIdx:] {
		role := "user"
		if msg.UserID == agent.UserID {
			role = "assistant"
		}
		chatMessages = append(chatMessages, ChatMessage{Role: role, Content: msg.Content})
	}

	// Create cancellable context
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	cancelKey := agentSlug + ":" + userID
	d.registerCancel(cancelKey, cancel)
	defer d.removeCancel(cancelKey)

	gatewayToken := ""
	if agent.GatewayToken.Valid {
		gatewayToken = agent.GatewayToken.String
	}

	chunks, err := d.bridge.Stream(streamCtx, agent.GatewayUrl, gatewayToken, agent.Model, chatMessages, int(agent.MaxTokens), agent.Temperature)
	if err != nil {
		slog.Error("ai: failed to start panel stream", "agent", agentSlug, "error", err)
		return
	}

	var fullContent strings.Builder

	for chunk := range chunks {
		if chunk.Content != "" {
			fullContent.WriteString(chunk.Content)

			// Send chunk only to requesting user
			chunkEnv, _ := ws.MakeEnvelope(ws.EventAIPanelChunk, ws.AIPanelChunkPayload{
				AgentSlug: agent.Slug,
				SessionID: sessionID,
				Content:   chunk.Content,
				Done:      false,
			})
			d.hub.SendToUser(userID, chunkEnv)
		}

		if chunk.Done {
			break
		}
	}

	responseText := fullContent.String()
	if responseText == "" {
		return
	}

	// Persist agent's response
	agentMsg, err := d.queries.CreateMessage(ctx, repository.CreateMessageParams{
		ChannelID:   sessionChannelUUID,
		UserID:      agent.UserID,
		Content:     responseText,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("ai: failed to persist panel agent message", "error", err)
		return
	}

	// Send done with message ID
	doneEnv, _ := ws.MakeEnvelope(ws.EventAIPanelChunk, ws.AIPanelChunkPayload{
		AgentSlug: agent.Slug,
		SessionID: sessionID,
		Content:   "",
		Done:      true,
		MessageID: uuidToString(agentMsg.ID),
	})
	d.hub.SendToUser(userID, doneEnv)

	// Log usage
	elapsed := time.Since(startTime).Milliseconds()
	_ = d.queries.CreateAgentUsage(ctx, repository.CreateAgentUsageParams{
		AgentID:        agent.ID,
		UserID:         userUUID,
		SessionID:      sessionUUID,
		ChannelID:      sessionChannelUUID,
		MessageID:      agentMsg.ID,
		OutputTokens:   int32(len(responseText) / 4),
		ResponseTimeMs: int32(elapsed),
		ModelUsed:      pgtype.Text{String: agent.Model, Valid: true},
		Source:         pgtype.Text{String: "panel_chat", Valid: true},
	})

	slog.Info("ai: panel chat completed",
		"agent", agentSlug,
		"session", sessionID,
		"user", username,
		"response_len", len(responseText),
		"elapsed_ms", elapsed,
	)
}

// --- UUID helpers (duplicated to avoid circular deps) ---

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
	b, err := hexDecodeString(clean)
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

func hexDecodeString(s string) ([]byte, error) {
	if len(s)%2 != 0 {
		return nil, fmt.Errorf("odd length hex string")
	}
	b := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := unhex(s[i])
		lo := unhex(s[i+1])
		if hi == 0xff || lo == 0xff {
			return nil, fmt.Errorf("invalid hex char")
		}
		b[i/2] = hi<<4 | lo
	}
	return b, nil
}

func unhex(c byte) byte {
	switch {
	case '0' <= c && c <= '9':
		return c - '0'
	case 'a' <= c && c <= 'f':
		return c - 'a' + 10
	case 'A' <= c && c <= 'F':
		return c - 'A' + 10
	default:
		return 0xff
	}
}
