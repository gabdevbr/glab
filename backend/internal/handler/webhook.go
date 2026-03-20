package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// WebhookHandler handles inbound webhook endpoints.
type WebhookHandler struct {
	queries *repository.Queries
	hub     *ws.Hub
}

// NewWebhookHandler creates a new WebhookHandler.
func NewWebhookHandler(q *repository.Queries, hub *ws.Hub) *WebhookHandler {
	return &WebhookHandler{queries: q, hub: hub}
}

// WebhookResponse is the safe JSON representation of a channel webhook.
type WebhookResponse struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
	AgentSlug string `json:"agent_slug,omitempty"`
	AgentName string `json:"agent_name,omitempty"`
	Name      string `json:"name"`
	Token     string `json:"token"`
	CreatedAt string `json:"created_at"`
}

// --- Admin endpoints ---

// ListChannelWebhooks handles GET /api/v1/admin/channels/{id}/webhooks
func (h *WebhookHandler) ListChannelWebhooks(w http.ResponseWriter, r *http.Request) {
	channelIDStr := chi.URLParam(r, "id")
	channelUUID, err := parseUUID(channelIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	rows, err := h.queries.ListChannelWebhooks(r.Context(), channelUUID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list webhooks")
		return
	}

	items := make([]WebhookResponse, len(rows))
	for i, row := range rows {
		items[i] = WebhookResponse{
			ID:        uuidToString(row.ID),
			ChannelID: uuidToString(row.ChannelID),
			AgentSlug: row.AgentSlug.String,
			AgentName: row.AgentName.String,
			Name:      row.Name,
			Token:     row.Token,
			CreatedAt: timestampToString(row.CreatedAt),
		}
	}

	respondJSON(w, http.StatusOK, items)
}

// CreateChannelWebhookRequest is the request body for creating a webhook.
type CreateChannelWebhookRequest struct {
	Name      string `json:"name"`
	AgentSlug string `json:"agent_slug,omitempty"`
}

// CreateChannelWebhook handles POST /api/v1/admin/channels/{id}/webhooks
func (h *WebhookHandler) CreateChannelWebhook(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelUUID, err := parseUUID(channelIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	var req CreateChannelWebhookRequest
	if err := parseBody(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	createdByUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	// Resolve optional agent
	var agentUUID pgtype.UUID
	if req.AgentSlug != "" {
		agent, err := h.queries.GetAgentBySlug(r.Context(), req.AgentSlug)
		if err != nil {
			respondError(w, http.StatusBadRequest, "agent not found")
			return
		}
		agentUUID = agent.ID
	}

	webhook, err := h.queries.CreateChannelWebhook(r.Context(), repository.CreateChannelWebhookParams{
		ChannelID: channelUUID,
		AgentID:   agentUUID,
		Name:      req.Name,
		CreatedBy: createdByUUID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create webhook")
		return
	}

	respondJSON(w, http.StatusCreated, WebhookResponse{
		ID:        uuidToString(webhook.ID),
		ChannelID: uuidToString(webhook.ChannelID),
		Name:      webhook.Name,
		Token:     webhook.Token,
		CreatedAt: timestampToString(webhook.CreatedAt),
	})
}

// DeleteChannelWebhook handles DELETE /api/v1/admin/channels/{id}/webhooks/{webhookId}
func (h *WebhookHandler) DeleteChannelWebhook(w http.ResponseWriter, r *http.Request) {
	channelIDStr := chi.URLParam(r, "id")
	channelUUID, err := parseUUID(channelIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	webhookIDStr := chi.URLParam(r, "webhookId")
	webhookUUID, err := parseUUID(webhookIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid webhook id")
		return
	}

	if err := h.queries.DeleteChannelWebhook(r.Context(), repository.DeleteChannelWebhookParams{
		ID:        webhookUUID,
		ChannelID: channelUUID,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete webhook")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Inbound webhook endpoint (no JWT, token-only auth) ---

// InboundWebhookPayload is the request body for an inbound webhook POST.
type InboundWebhookPayload struct {
	Content  string `json:"content"`
	Username string `json:"username,omitempty"` // optional display name override
}

// Trigger handles POST /webhooks/{token} — public endpoint, authenticated by token only.
func (h *WebhookHandler) Trigger(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		respondError(w, http.StatusBadRequest, "missing token")
		return
	}

	wh, err := h.queries.GetWebhookByToken(r.Context(), token)
	if err != nil {
		respondError(w, http.StatusNotFound, "webhook not found")
		return
	}

	var payload InboundWebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Content == "" {
		respondError(w, http.StatusBadRequest, "content is required")
		return
	}

	// Determine poster: agent user or webhook creator
	var posterID pgtype.UUID
	var username, displayName string

	if wh.AgentUserID.Valid {
		posterID = wh.AgentUserID
		displayName = wh.AgentName.String
		username = wh.AgentSlug.String
	} else {
		posterID = wh.CreatedBy
		displayName = wh.Name
		username = wh.Name
	}
	if payload.Username != "" {
		displayName = payload.Username
	}

	// Persist message
	msg, err := h.queries.CreateMessage(r.Context(), repository.CreateMessageParams{
		ChannelID:   wh.ChannelID,
		UserID:      posterID,
		Content:     payload.Content,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("webhook: failed to persist message", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to post message")
		return
	}

	// Broadcast to all channel subscribers via WebSocket hub
	channelIDStr := uuidToString(wh.ChannelID)
	env, _ := ws.MakeEnvelope(ws.EventMessageNew, ws.MessageNewPayload{
		ID:          uuidToString(msg.ID),
		ChannelID:   channelIDStr,
		UserID:      uuidToString(posterID),
		Username:    username,
		DisplayName: displayName,
		Content:     payload.Content,
		ContentType: "text",
		IsBot:       true,
		CreatedAt:   msg.CreatedAt.Time.Format(time.RFC3339),
	})
	h.hub.BroadcastToChannel(channelIDStr, env)

	slog.Info("webhook: message posted",
		"webhook", wh.Name,
		"channel", wh.ChannelSlug,
		"content_len", len(payload.Content),
	)

	respondJSON(w, http.StatusOK, map[string]string{
		"ok":         "true",
		"message_id": uuidToString(msg.ID),
	})
}
