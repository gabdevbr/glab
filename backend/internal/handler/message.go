package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

// MessageHandler handles message endpoints.
type MessageHandler struct {
	queries *repository.Queries
}

// NewMessageHandler creates a MessageHandler.
func NewMessageHandler(q *repository.Queries) *MessageHandler {
	return &MessageHandler{queries: q}
}

// listChannelMessagesRowToResponse converts a ListChannelMessagesRow to MessageResponse.
func listChannelMessagesRowToResponse(m repository.ListChannelMessagesRow) MessageResponse {
	return MessageResponse{
		ID:          uuidToString(m.ID),
		ChannelID:   uuidToString(m.ChannelID),
		UserID:      uuidToString(m.UserID),
		ThreadID:    uuidToString(m.ThreadID),
		Content:     m.Content,
		ContentType: m.ContentType,
		EditedAt:    timestampToString(m.EditedAt),
		IsPinned:    m.IsPinned,
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
		Username:    m.Username,
		DisplayName: m.DisplayName,
		AvatarURL:   m.AvatarUrl.String,
		IsBot:       m.IsBot,
	}
}

// pinnedMessageRowToResponse converts a ListPinnedMessagesRow to MessageResponse.
func pinnedMessageRowToResponse(m repository.ListPinnedMessagesRow) MessageResponse {
	return MessageResponse{
		ID:          uuidToString(m.ID),
		ChannelID:   uuidToString(m.ChannelID),
		UserID:      uuidToString(m.UserID),
		ThreadID:    uuidToString(m.ThreadID),
		Content:     m.Content,
		ContentType: m.ContentType,
		EditedAt:    timestampToString(m.EditedAt),
		IsPinned:    m.IsPinned,
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
		Username:    m.Username,
		DisplayName: m.DisplayName,
		AvatarURL:   m.AvatarUrl.String,
		IsBot:       m.IsBot,
	}
}

// threadMessageRowToResponse converts a ListThreadMessagesRow to MessageResponse.
func threadMessageRowToResponse(m repository.ListThreadMessagesRow) MessageResponse {
	return MessageResponse{
		ID:          uuidToString(m.ID),
		ChannelID:   uuidToString(m.ChannelID),
		UserID:      uuidToString(m.UserID),
		ThreadID:    uuidToString(m.ThreadID),
		Content:     m.Content,
		ContentType: m.ContentType,
		EditedAt:    timestampToString(m.EditedAt),
		IsPinned:    m.IsPinned,
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
		Username:    m.Username,
		DisplayName: m.DisplayName,
		AvatarURL:   m.AvatarUrl.String,
		IsBot:       m.IsBot,
	}
}

// ListChannelMessages handles GET /api/v1/channels/{id}/messages.
func (h *MessageHandler) ListChannelMessages(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	if status, err := requireChannelMember(r.Context(), h.queries, cid, claims.UserID); err != nil {
		respondError(w, status, err.Error())
		return
	}

	limit := int32(50)
	offset := int32(0)

	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = int32(n)
		}
	}

	messages, err := h.queries.ListChannelMessages(r.Context(), repository.ListChannelMessagesParams{
		ChannelID: cid,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	items := make([]MessageResponse, len(messages))
	for i, m := range messages {
		items[i] = listChannelMessagesRowToResponse(m)
	}

	enrichMessagesWithFiles(r.Context(), h.queries, items)
	respondJSON(w, http.StatusOK, items)
}

// ListPinnedMessages handles GET /api/v1/channels/{id}/messages/pinned.
func (h *MessageHandler) ListPinnedMessages(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	if status, err := requireChannelMember(r.Context(), h.queries, cid, claims.UserID); err != nil {
		respondError(w, status, err.Error())
		return
	}

	messages, err := h.queries.ListPinnedMessages(r.Context(), cid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list pinned messages")
		return
	}

	items := make([]MessageResponse, len(messages))
	for i, m := range messages {
		items[i] = pinnedMessageRowToResponse(m)
	}

	enrichMessagesWithFiles(r.Context(), h.queries, items)
	respondJSON(w, http.StatusOK, items)
}

// ListThreadMessages handles GET /api/v1/messages/{id}/thread.
func (h *MessageHandler) ListThreadMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	mid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	// Validate parent message exists
	parent, err := h.queries.GetMessageByID(r.Context(), mid)
	if err != nil {
		respondError(w, http.StatusNotFound, "message not found")
		return
	}

	messages, err := h.queries.ListThreadMessages(r.Context(), mid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list thread messages")
		return
	}

	// Build parent message response
	parentResp := MessageResponse{
		ID:          uuidToString(parent.ID),
		ChannelID:   uuidToString(parent.ChannelID),
		UserID:      uuidToString(parent.UserID),
		ThreadID:    uuidToString(parent.ThreadID),
		Content:     parent.Content,
		ContentType: parent.ContentType,
		EditedAt:    timestampToString(parent.EditedAt),
		IsPinned:    parent.IsPinned,
		CreatedAt:   timestampToString(parent.CreatedAt),
		UpdatedAt:   timestampToString(parent.UpdatedAt),
		Username:    parent.Username,
		DisplayName: parent.DisplayName,
		AvatarURL:   parent.AvatarUrl.String,
		IsBot:       parent.IsBot,
	}

	replies := make([]MessageResponse, len(messages))
	for i, m := range messages {
		replies[i] = threadMessageRowToResponse(m)
	}

	// Enrich parent + replies with file data in a single batch
	all := append([]MessageResponse{parentResp}, replies...)
	enrichMessagesWithFiles(r.Context(), h.queries, all)
	parentResp = all[0]
	copy(replies, all[1:])

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"parent":  parentResp,
		"replies": replies,
	})
}
