package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// Valid API token scopes.
var validScopes = map[string]bool{
	"read:messages":  true,
	"write:messages": true,
	"read:channels":  true,
	"read:users":     true,
	"read:search":    true,
	"admin":          true,
}

// APITokenHandler handles API token management endpoints.
type APITokenHandler struct {
	queries *repository.Queries
	hub     *ws.Hub
}

// NewAPITokenHandler creates an APITokenHandler.
func NewAPITokenHandler(q *repository.Queries, hub *ws.Hub) *APITokenHandler {
	return &APITokenHandler{queries: q, hub: hub}
}

// generateAPIToken creates a new random API token string.
func generateAPIToken() (string, error) {
	b := make([]byte, 20) // 20 bytes = 40 hex chars
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return auth.APITokenPrefix + hex.EncodeToString(b), nil
}

// hashToken returns the SHA-256 hex hash of a token.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// TokenResponse is the JSON representation of an API token (without hash).
type TokenResponse struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Prefix     string   `json:"token_prefix"`
	Scopes     []string `json:"scopes"`
	ExpiresAt  string   `json:"expires_at,omitempty"`
	LastUsedAt string   `json:"last_used_at,omitempty"`
	IsRevoked  bool     `json:"is_revoked"`
	CreatedAt  string   `json:"created_at"`
}

func tokenToResponse(t repository.ApiToken) TokenResponse {
	return TokenResponse{
		ID:         uuidToString(t.ID),
		Name:       t.Name,
		Prefix:     t.TokenPrefix,
		Scopes:     t.Scopes,
		ExpiresAt:  timestampToString(t.ExpiresAt),
		LastUsedAt: timestampToString(t.LastUsedAt),
		IsRevoked:  t.IsRevoked,
		CreatedAt:  timestampToString(t.CreatedAt),
	}
}

// List handles GET /api/v1/tokens.
func (h *APITokenHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	tokens, err := h.queries.ListAPITokensByUser(r.Context(), uid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list tokens")
		return
	}

	items := make([]TokenResponse, len(tokens))
	for i, t := range tokens {
		items[i] = tokenToResponse(t)
	}

	respondJSON(w, http.StatusOK, items)
}

// Create handles POST /api/v1/tokens.
func (h *APITokenHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		ExpiresIn *int     `json:"expires_in"` // seconds, nil = never
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(body.Scopes) == 0 {
		respondError(w, http.StatusBadRequest, "at least one scope is required")
		return
	}
	for _, s := range body.Scopes {
		if !validScopes[s] {
			respondError(w, http.StatusBadRequest, "invalid scope: "+s)
			return
		}
	}
	// Only admins can create tokens with admin scope
	if claims.Role != "admin" {
		for _, s := range body.Scopes {
			if s == "admin" {
				respondError(w, http.StatusForbidden, "only admins can create tokens with admin scope")
				return
			}
		}
	}

	token, err := generateAPIToken()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	var expiresAt pgtype.Timestamptz
	if body.ExpiresIn != nil && *body.ExpiresIn > 0 {
		expiresAt = pgtype.Timestamptz{
			Time:  time.Now().Add(time.Duration(*body.ExpiresIn) * time.Second),
			Valid: true,
		}
	}

	prefix := token[:12] // "glb_" + first 8 hex chars

	dbToken, err := h.queries.CreateAPIToken(r.Context(), repository.CreateAPITokenParams{
		UserID:      uid,
		Name:        body.Name,
		TokenHash:   hashToken(token),
		TokenPrefix: prefix,
		Scopes:      body.Scopes,
		ExpiresAt:   expiresAt,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	// Return token plaintext once + metadata
	resp := tokenToResponse(dbToken)
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"token": token, // plaintext — shown only this once
		"data":  resp,
	})
}

// Revoke handles DELETE /api/v1/tokens/{id}.
func (h *APITokenHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tokenID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid token id")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	if err := h.queries.RevokeAPIToken(r.Context(), repository.RevokeAPITokenParams{
		ID:     tokenID,
		UserID: uid,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to revoke token")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// SendMessage handles POST /api/v1/channels/{id}/messages.
func (h *APITokenHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if !requireScope(r, "write:messages") {
		respondError(w, http.StatusForbidden, "scope write:messages required")
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelUUID, err := parseUUID(channelIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Check membership
	if status, err := requireChannelMember(r.Context(), h.queries, channelUUID, claims.UserID); err != nil {
		respondError(w, status, err.Error())
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Content == "" {
		respondError(w, http.StatusBadRequest, "content is required")
		return
	}

	msg, err := h.queries.CreateMessage(r.Context(), repository.CreateMessageParams{
		ChannelID:   channelUUID,
		UserID:      userUUID,
		Content:     body.Content,
		ContentType: "text",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Broadcast via WebSocket
	fullMsg, err := h.queries.GetMessageByID(r.Context(), msg.ID)
	if err == nil {
		payload := ws.MessageNewPayload{
			ID:          uuidToString(fullMsg.ID),
			ChannelID:   uuidToString(fullMsg.ChannelID),
			UserID:      uuidToString(fullMsg.UserID),
			Username:    fullMsg.Username,
			DisplayName: fullMsg.DisplayName,
			AvatarURL:   resolveAvatarURL(fullMsg.AvatarUrl.String, uuidToString(fullMsg.UserID)),
			Content:     fullMsg.Content,
			ContentType: fullMsg.ContentType,
			ThreadID:    uuidToString(fullMsg.ThreadID),
			IsBot:       fullMsg.IsBot,
			CreatedAt:   timestampToString(fullMsg.CreatedAt),
		}
		env, err := ws.MakeEnvelope(ws.EventMessageNew, payload)
		if err == nil {
			h.hub.BroadcastToChannel(channelIDStr, env)
		}
	}

	respondJSON(w, http.StatusCreated, map[string]string{
		"id":         uuidToString(msg.ID),
		"channel_id": uuidToString(msg.ChannelID),
		"content":    msg.Content,
		"created_at": timestampToString(msg.CreatedAt),
	})
}
