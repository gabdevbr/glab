package handler

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

// SearchHandler handles search endpoints.
type SearchHandler struct {
	queries *repository.Queries
}

// NewSearchHandler creates a SearchHandler.
func NewSearchHandler(q *repository.Queries) *SearchHandler {
	return &SearchHandler{queries: q}
}

// Search handles GET /api/v1/search?q=term&channel_id=&limit=20&offset=0.
func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		respondError(w, http.StatusBadRequest, "q parameter is required")
		return
	}

	limit := int32(20)
	offset := int32(0)

	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = int32(n)
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = int32(n)
		}
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	var channelUUID pgtype.UUID
	if cidStr := r.URL.Query().Get("channel_id"); cidStr != "" {
		parsed, err := parseUUID(cidStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid channel_id")
			return
		}
		channelUUID = parsed
	}

	results, err := h.queries.SearchMessagesForUser(r.Context(), repository.SearchMessagesForUserParams{
		Unaccent: q,
		Column2:  channelUUID,
		UserID:   uid,
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "search failed")
		return
	}

	items := make([]SearchResultResponse, len(results))
	for i, m := range results {
		items[i] = searchResultForUserToResponse(m)
	}

	respondJSON(w, http.StatusOK, items)
}

// SearchResultResponse is the JSON representation of a search result.
type SearchResultResponse struct {
	ID          string  `json:"id"`
	ChannelID   string  `json:"channel_id"`
	UserID      string  `json:"user_id"`
	Content     string  `json:"content"`
	ContentType string  `json:"content_type"`
	CreatedAt   string  `json:"created_at"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   string  `json:"avatar_url,omitempty"`
	IsBot       bool    `json:"is_bot"`
	Rank        float32 `json:"rank"`
}

func searchResultForUserToResponse(m repository.SearchMessagesForUserRow) SearchResultResponse {
	uid := uuidToString(m.UserID)
	return SearchResultResponse{
		ID:          uuidToString(m.ID),
		ChannelID:   uuidToString(m.ChannelID),
		UserID:      uid,
		Content:     m.Content,
		ContentType: m.ContentType,
		CreatedAt:   timestampToString(m.CreatedAt),
		Username:    m.Username,
		DisplayName: m.DisplayName,
		AvatarURL:   resolveAvatarURL(m.AvatarUrl.String, uid),
		IsBot:       m.IsBot,
		Rank:        m.Rank,
	}
}
