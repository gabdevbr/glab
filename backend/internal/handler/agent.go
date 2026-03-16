package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

// AgentHandler handles agent-related REST endpoints.
type AgentHandler struct {
	queries *repository.Queries
}

// NewAgentHandler creates a new AgentHandler.
func NewAgentHandler(q *repository.Queries) *AgentHandler {
	return &AgentHandler{queries: q}
}

// AgentResponse is the safe JSON representation of an agent (no gateway_token).
type AgentResponse struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Emoji       string `json:"emoji"`
	Description string `json:"description,omitempty"`
	Scope       string `json:"scope,omitempty"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

func agentToResponse(a repository.Agent) AgentResponse {
	return AgentResponse{
		ID:          uuidToString(a.ID),
		UserID:      uuidToString(a.UserID),
		Slug:        a.Slug,
		Name:        a.Name,
		Emoji:       a.Emoji.String,
		Description: a.Description.String,
		Scope:       a.Scope.String,
		Status:      a.Status,
		CreatedAt:   timestampToString(a.CreatedAt),
	}
}

// AgentSessionResponse is the JSON representation of an agent session.
type AgentSessionResponse struct {
	ID        string `json:"id"`
	AgentID   string `json:"agent_id"`
	UserID    string `json:"user_id"`
	Title     string `json:"title"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func sessionToResponse(s repository.AgentSession) AgentSessionResponse {
	return AgentSessionResponse{
		ID:        uuidToString(s.ID),
		AgentID:   uuidToString(s.AgentID),
		UserID:    uuidToString(s.UserID),
		Title:     s.Title.String,
		IsActive:  s.IsActive,
		CreatedAt: timestampToString(s.CreatedAt),
		UpdatedAt: timestampToString(s.UpdatedAt),
	}
}

// List handles GET /api/v1/agents — list active agents.
func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	agents, err := h.queries.ListAgents(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list agents")
		return
	}

	items := make([]AgentResponse, len(agents))
	for i, a := range agents {
		items[i] = agentToResponse(a)
	}

	respondJSON(w, http.StatusOK, items)
}

// GetBySlug handles GET /api/v1/agents/{slug} — get agent by slug.
func (h *AgentHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	agent, err := h.queries.GetAgentBySlug(r.Context(), slug)
	if err != nil {
		respondError(w, http.StatusNotFound, "agent not found")
		return
	}

	respondJSON(w, http.StatusOK, agentToResponse(agent))
}

// ListSessions handles GET /api/v1/agents/{slug}/sessions — list user's sessions.
func (h *AgentHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	slug := chi.URLParam(r, "slug")
	agent, err := h.queries.GetAgentBySlug(r.Context(), slug)
	if err != nil {
		respondError(w, http.StatusNotFound, "agent not found")
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	sessions, err := h.queries.ListAgentSessions(r.Context(), repository.ListAgentSessionsParams{
		AgentID: agent.ID,
		UserID:  userUUID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}

	items := make([]AgentSessionResponse, len(sessions))
	for i, s := range sessions {
		items[i] = sessionToResponse(s)
	}

	respondJSON(w, http.StatusOK, items)
}

// GetSessionMessages handles GET /api/v1/agents/{slug}/sessions/{id}/messages.
func (h *AgentHandler) GetSessionMessages(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	sessionIDStr := chi.URLParam(r, "id")
	sessionUUID, err := parseUUID(sessionIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}

	session, err := h.queries.GetAgentSession(r.Context(), sessionUUID)
	if err != nil {
		respondError(w, http.StatusNotFound, "session not found")
		return
	}

	// Verify session belongs to the requesting user
	if uuidToString(session.UserID) != claims.UserID {
		respondError(w, http.StatusForbidden, "forbidden")
		return
	}

	// Find the session channel
	slug := chi.URLParam(r, "slug")
	sessionChannelSlug := "agent-session-" + sessionIDStr
	_ = slug // validated via route

	ch, err := h.queries.GetChannelBySlug(r.Context(), sessionChannelSlug)
	if err != nil {
		// No channel means no messages yet
		respondJSON(w, http.StatusOK, []MessageResponse{})
		return
	}

	msgs, err := h.queries.GetSessionMessages(r.Context(), ch.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	items := make([]MessageResponse, len(msgs))
	for i, m := range msgs {
		items[i] = MessageResponse{
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

	respondJSON(w, http.StatusOK, items)
}
