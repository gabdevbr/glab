package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// AdminHandler handles admin-only endpoints.
type AdminHandler struct {
	queries  *repository.Queries
	presence *ws.PresenceService
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(q *repository.Queries, p *ws.PresenceService) *AdminHandler {
	return &AdminHandler{queries: q, presence: p}
}

// requireAdmin checks that the authenticated user is an admin.
func requireAdmin(w http.ResponseWriter, r *http.Request) *auth.Claims {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return nil
	}
	if claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin access required")
		return nil
	}
	return claims
}

// Stats handles GET /api/v1/admin/stats.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	ctx := r.Context()

	users, _ := h.queries.CountUsers(ctx)
	channels, _ := h.queries.CountChannels(ctx)
	messages, _ := h.queries.CountMessages(ctx)
	files, _ := h.queries.CountFiles(ctx)
	storage, _ := h.queries.TotalStorageBytes(ctx)

	onlineUsers := h.presence.GetOnlineUsers()

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"users":         users,
		"channels":      channels,
		"messages":      messages,
		"files":         files,
		"storage_bytes": storage,
		"online_count":  len(onlineUsers),
	})
}

// ListUsers handles GET /api/v1/admin/users.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	search := r.URL.Query().Get("q")
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

	users, err := h.queries.SearchUsersAdmin(r.Context(), repository.SearchUsersAdminParams{
		Column1: search,
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	type adminUserItem struct {
		ID            string `json:"id"`
		Username      string `json:"username"`
		Email         string `json:"email"`
		DisplayName   string `json:"display_name"`
		AvatarURL     string `json:"avatar_url,omitempty"`
		Role          string `json:"role"`
		Status        string `json:"status"`
		LastSeen      string `json:"last_seen,omitempty"`
		IsBot         bool   `json:"is_bot"`
		IsDeactivated bool   `json:"is_deactivated"`
		CreatedAt     string `json:"created_at"`
	}

	items := make([]adminUserItem, len(users))
	for i, u := range users {
		uid := uuidToString(u.ID)
		items[i] = adminUserItem{
			ID:            uid,
			Username:      u.Username,
			Email:         u.Email,
			DisplayName:   u.DisplayName,
			AvatarURL:     resolveAvatarURL(u.AvatarUrl.String, uid),
			Role:          u.Role,
			Status:        u.Status,
			LastSeen:      timestampToString(u.LastSeen),
			IsBot:         u.IsBot,
			IsDeactivated: u.IsDeactivated,
			CreatedAt:     timestampToString(u.CreatedAt),
		}
	}

	respondJSON(w, http.StatusOK, items)
}

// CreateUser handles POST /api/v1/admin/users.
func (h *AdminHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	var body struct {
		Username    string `json:"username"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
		Role        string `json:"role"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Email == "" || body.Password == "" {
		respondError(w, http.StatusBadRequest, "username, email, and password are required")
		return
	}
	if body.Role == "" {
		body.Role = "user"
	}
	if body.DisplayName == "" {
		body.DisplayName = body.Username
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user, err := h.queries.CreateUser(r.Context(), repository.CreateUserParams{
		Username:     body.Username,
		Email:        body.Email,
		DisplayName:  body.DisplayName,
		PasswordHash: hash,
		Role:         body.Role,
		IsBot:        false,
		BotConfig:    json.RawMessage("null"),
	})
	if err != nil {
		respondError(w, http.StatusConflict, "user already exists or invalid data")
		return
	}

	respondJSON(w, http.StatusCreated, userToResponse(user))
}

// DeactivateUser handles DELETE /api/v1/admin/users/{id}.
func (h *AdminHandler) DeactivateUser(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	uid, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	if err := h.queries.DeactivateUser(r.Context(), uid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to deactivate user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deactivated"})
}

// ChangeRole handles PATCH /api/v1/admin/users/{id}/role.
func (h *AdminHandler) ChangeRole(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	uid, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := parseBody(r, &body); err != nil || (body.Role != "user" && body.Role != "admin") {
		respondError(w, http.StatusBadRequest, "role must be 'user' or 'admin'")
		return
	}

	if err := h.queries.UpdateUserRole(r.Context(), repository.UpdateUserRoleParams{
		ID:   uid,
		Role: body.Role,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update role")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "role": body.Role})
}

// ResetPassword handles POST /api/v1/admin/users/{id}/reset-password.
func (h *AdminHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	uid, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := parseBody(r, &body); err != nil || body.Password == "" {
		respondError(w, http.StatusBadRequest, "password is required")
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	if err := h.queries.UpdatePasswordHash(r.Context(), repository.UpdatePasswordHashParams{
		ID:           uid,
		PasswordHash: hash,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "password_reset"})
}

// ListChannels handles GET /api/v1/admin/channels.
func (h *AdminHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	channels, err := h.queries.ListAllChannelsWithStats(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}

	type adminChannelItem struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Type         string `json:"type"`
		IsArchived   bool   `json:"is_archived"`
		CreatedAt    string `json:"created_at"`
		MemberCount  int64  `json:"member_count"`
		MessageCount int64  `json:"message_count"`
	}

	items := make([]adminChannelItem, len(channels))
	for i, c := range channels {
		items[i] = adminChannelItem{
			ID:           uuidToString(c.ID),
			Name:         c.Name,
			Slug:         c.Slug,
			Type:         c.Type,
			IsArchived:   c.IsArchived,
			CreatedAt:    timestampToString(c.CreatedAt),
			MemberCount:  c.MemberCount,
			MessageCount: c.MessageCount,
		}
	}

	respondJSON(w, http.StatusOK, items)
}
