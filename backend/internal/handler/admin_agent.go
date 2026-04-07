package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// AdminAgentHandler handles admin CRUD for agents.
type AdminAgentHandler struct {
	queries *repository.Queries
}

// NewAdminAgentHandler creates a new AdminAgentHandler.
func NewAdminAgentHandler(q *repository.Queries) *AdminAgentHandler {
	return &AdminAgentHandler{queries: q}
}

// AdminAgentResponse is the full agent representation for admins (includes gateway_token).
type AdminAgentResponse struct {
	ID                    string  `json:"id"`
	UserID                string  `json:"user_id"`
	Slug                  string  `json:"slug"`
	Name                  string  `json:"name"`
	Emoji                 string  `json:"emoji"`
	Description           string  `json:"description,omitempty"`
	Scope                 string  `json:"scope,omitempty"`
	Status                string  `json:"status"`
	GatewayURL            string  `json:"gateway_url"`
	GatewayToken          string  `json:"gateway_token,omitempty"`
	Model                 string  `json:"model"`
	SystemPrompt          string  `json:"system_prompt,omitempty"`
	MaxTokens             int32   `json:"max_tokens"`
	Temperature           float32 `json:"temperature"`
	MaxContextMessages    int32   `json:"max_context_messages"`
	RespondWithoutMention bool    `json:"respond_without_mention"`
	Category              string  `json:"category"`
	CreatedAt             string  `json:"created_at"`
	UpdatedAt             string  `json:"updated_at"`
}

func agentToAdminResponse(a repository.Agent) AdminAgentResponse {
	return AdminAgentResponse{
		ID:                    uuidToString(a.ID),
		UserID:                uuidToString(a.UserID),
		Slug:                  a.Slug,
		Name:                  a.Name,
		Emoji:                 a.Emoji.String,
		Description:           a.Description.String,
		Scope:                 a.Scope.String,
		Status:                a.Status,
		GatewayURL:            a.GatewayUrl,
		GatewayToken:          a.GatewayToken.String,
		Model:                 a.Model,
		SystemPrompt:          a.SystemPrompt.String,
		MaxTokens:             a.MaxTokens,
		Temperature:           a.Temperature,
		MaxContextMessages:    a.MaxContextMessages,
		RespondWithoutMention: a.RespondWithoutMention,
		Category:              a.Category,
		CreatedAt:             timestampToString(a.CreatedAt),
		UpdatedAt:             timestampToString(a.UpdatedAt),
	}
}

// ListAgents handles GET /api/v1/admin/agents
func (h *AdminAgentHandler) ListAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := h.queries.ListAllAgents(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list agents")
		return
	}
	items := make([]AdminAgentResponse, len(agents))
	for i, a := range agents {
		items[i] = agentToAdminResponse(a)
	}
	respondJSON(w, http.StatusOK, items)
}

// AgentCreateRequest is the request body for creating an agent.
type AgentCreateRequest struct {
	Slug                  string  `json:"slug"`
	Name                  string  `json:"name"`
	Emoji                 string  `json:"emoji"`
	Description           string  `json:"description"`
	Scope                 string  `json:"scope"`
	GatewayURL            string  `json:"gateway_url"`
	GatewayToken          string  `json:"gateway_token"`
	Model                 string  `json:"model"`
	SystemPrompt          string  `json:"system_prompt"`
	MaxTokens             int32   `json:"max_tokens"`
	Temperature           float32 `json:"temperature"`
	MaxContextMessages    int32   `json:"max_context_messages"`
	RespondWithoutMention bool    `json:"respond_without_mention"`
	Category              string  `json:"category"`
}

// CreateAgent handles POST /api/v1/admin/agents
func (h *AdminAgentHandler) CreateAgent(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req AgentCreateRequest
	if err := parseBody(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Slug == "" || req.Name == "" || req.GatewayURL == "" || req.Model == "" {
		respondError(w, http.StatusBadRequest, "slug, name, gateway_url and model are required")
		return
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 4096
	}
	if req.MaxContextMessages <= 0 {
		req.MaxContextMessages = 20
	}

	// Create a bot user for this agent
	randomSuffix := make([]byte, 4)
	rand.Read(randomSuffix)
	botEmail := fmt.Sprintf("agent-%s-%s@glab.internal", req.Slug, hex.EncodeToString(randomSuffix))
	botUser, err := h.queries.CreateUser(r.Context(), repository.CreateUserParams{
		Email:        botEmail,
		Username:     req.Slug,
		DisplayName:  req.Name,
		PasswordHash: "",
		IsBot:        true,
		Role:         "member",
		BotConfig:    json.RawMessage("null"),
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create bot user: "+err.Error())
		return
	}

	agent, err := h.queries.CreateAgent(r.Context(), repository.CreateAgentParams{
		UserID:             botUser.ID,
		Slug:               req.Slug,
		Name:               req.Name,
		Emoji:              pgtype.Text{String: req.Emoji, Valid: req.Emoji != ""},
		Description:        pgtype.Text{String: req.Description, Valid: req.Description != ""},
		Scope:              pgtype.Text{String: req.Scope, Valid: req.Scope != ""},
		Status:             "active",
		GatewayUrl:         req.GatewayURL,
		GatewayToken:       pgtype.Text{String: req.GatewayToken, Valid: req.GatewayToken != ""},
		Model:              req.Model,
		SystemPrompt:       pgtype.Text{String: req.SystemPrompt, Valid: req.SystemPrompt != ""},
		MaxTokens:          req.MaxTokens,
		Temperature:        req.Temperature,
		MaxContextMessages: req.MaxContextMessages,
		Category:           req.Category,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create agent: "+err.Error())
		return
	}

	// Set respond_without_mention if needed
	if req.RespondWithoutMention {
		_ = h.queries.UpdateAgentRespondWithoutMention(r.Context(), repository.UpdateAgentRespondWithoutMentionParams{
			ID:                    agent.ID,
			RespondWithoutMention: true,
		})
		agent.RespondWithoutMention = true
	}

	respondJSON(w, http.StatusCreated, agentToAdminResponse(agent))
}

// AgentUpdateRequest is the request body for updating an agent.
type AgentUpdateRequest struct {
	Name                  string  `json:"name"`
	Emoji                 string  `json:"emoji"`
	Description           string  `json:"description"`
	Scope                 string  `json:"scope"`
	Status                string  `json:"status"`
	GatewayURL            string  `json:"gateway_url"`
	GatewayToken          string  `json:"gateway_token"`
	Model                 string  `json:"model"`
	SystemPrompt          string  `json:"system_prompt"`
	MaxTokens             int32   `json:"max_tokens"`
	Temperature           float32 `json:"temperature"`
	MaxContextMessages    int32   `json:"max_context_messages"`
	RespondWithoutMention bool    `json:"respond_without_mention"`
	Category              string  `json:"category"`
}

// UpdateAgent handles PUT /api/v1/admin/agents/{id}
func (h *AdminAgentHandler) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	agentIDStr := chi.URLParam(r, "id")
	agentUUID, err := parseUUID(agentIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid agent id")
		return
	}

	var req AgentUpdateRequest
	if err := parseBody(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 4096
	}
	if req.MaxContextMessages <= 0 {
		req.MaxContextMessages = 20
	}
	if req.Status == "" {
		req.Status = "active"
	}

	agent, err := h.queries.UpdateAgent(r.Context(), repository.UpdateAgentParams{
		ID:                    agentUUID,
		Name:                  req.Name,
		Emoji:                 pgtype.Text{String: req.Emoji, Valid: req.Emoji != ""},
		Description:           pgtype.Text{String: req.Description, Valid: req.Description != ""},
		Scope:                 pgtype.Text{String: req.Scope, Valid: req.Scope != ""},
		Status:                req.Status,
		GatewayUrl:            req.GatewayURL,
		GatewayToken:          pgtype.Text{String: req.GatewayToken, Valid: req.GatewayToken != ""},
		Model:                 req.Model,
		SystemPrompt:          pgtype.Text{String: req.SystemPrompt, Valid: req.SystemPrompt != ""},
		MaxTokens:             req.MaxTokens,
		Temperature:           req.Temperature,
		MaxContextMessages:    req.MaxContextMessages,
		RespondWithoutMention: req.RespondWithoutMention,
		Category:              req.Category,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update agent: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, agentToAdminResponse(agent))
}

// DeleteAgent handles DELETE /api/v1/admin/agents/{id}
func (h *AdminAgentHandler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	agentIDStr := chi.URLParam(r, "id")
	agentUUID, err := parseUUID(agentIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid agent id")
		return
	}

	if err := h.queries.DeleteAgent(r.Context(), agentUUID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete agent")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
