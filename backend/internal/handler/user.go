package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

// UserHandler handles user endpoints.
type UserHandler struct {
	queries *repository.Queries
}

// NewUserHandler creates a UserHandler.
func NewUserHandler(q *repository.Queries) *UserHandler {
	return &UserHandler{queries: q}
}

// List handles GET /api/v1/users.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
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

	users, err := h.queries.ListUsers(r.Context(), repository.ListUsersParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	// Convert ListUsersRow to safe response (already excludes password_hash)
	type listUserItem struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		AvatarURL   string `json:"avatar_url,omitempty"`
		Role        string `json:"role"`
		Status      string `json:"status"`
		LastSeen    string `json:"last_seen,omitempty"`
		IsBot       bool   `json:"is_bot"`
	}

	items := make([]listUserItem, len(users))
	for i, u := range users {
		items[i] = listUserItem{
			ID:          uuidToString(u.ID),
			Username:    u.Username,
			Email:       u.Email,
			DisplayName: u.DisplayName,
			AvatarURL:   u.AvatarUrl.String,
			Role:        u.Role,
			Status:      u.Status,
			LastSeen:    timestampToString(u.LastSeen),
			IsBot:       u.IsBot,
		}
	}

	respondJSON(w, http.StatusOK, items)
}

// GetByID handles GET /api/v1/users/{id}.
func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	uid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	user, err := h.queries.GetUserByID(r.Context(), uid)
	if err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, userToResponse(user))
}

// Update handles PATCH /api/v1/users/{id}.
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")
	uid, err := parseUUID(targetID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	// Only self or admin can update
	if claims.UserID != targetID && claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "forbidden")
		return
	}

	var body struct {
		DisplayName *string `json:"display_name"`
		AvatarURL   *string `json:"avatar_url"`
		Email       *string `json:"email"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := repository.UpdateUserParams{ID: uid}
	if body.DisplayName != nil {
		params.DisplayName = pgtype.Text{String: *body.DisplayName, Valid: true}
	}
	if body.AvatarURL != nil {
		params.AvatarUrl = pgtype.Text{String: *body.AvatarURL, Valid: true}
	}
	if body.Email != nil {
		params.Email = pgtype.Text{String: *body.Email, Valid: true}
	}

	user, err := h.queries.UpdateUser(r.Context(), params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	respondJSON(w, http.StatusOK, userToResponse(user))
}
