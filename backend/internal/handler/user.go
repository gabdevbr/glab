package handler

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/storage"
)

const maxAvatarSize = 5 << 20 // 5 MB

// UserHandler handles user endpoints.
type UserHandler struct {
	queries    *repository.Queries
	storageSvc *storage.StorageService
}

// NewUserHandler creates a UserHandler.
func NewUserHandler(q *repository.Queries, svc *storage.StorageService) *UserHandler {
	return &UserHandler{queries: q, storageSvc: svc}
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
		uid := uuidToString(u.ID)
		items[i] = listUserItem{
			ID:          uid,
			Username:    u.Username,
			Email:       u.Email,
			DisplayName: u.DisplayName,
			AvatarURL:   resolveAvatarURL(u.AvatarUrl.String, uid),
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

// UploadAvatar handles POST /api/v1/users/{id}/avatar.
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
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

	if claims.UserID != targetID && claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "forbidden")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarSize)
	if err := r.ParseMultipartForm(maxAvatarSize); err != nil {
		respondError(w, http.StatusBadRequest, "file too large (max 5MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mime.TypeByExtension(filepath.Ext(header.Filename))
	}
	if !strings.HasPrefix(mimeType, "image/") {
		respondError(w, http.StatusBadRequest, "only image files are allowed")
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	key := fmt.Sprintf("avatars/%s%s", targetID, ext)

	data, err := io.ReadAll(file)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	if err := h.storageSvc.Backend().Put(r.Context(), key, bytes.NewReader(data), mimeType, int64(len(data))); err != nil {
		slog.Error("failed to store avatar", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to store avatar")
		return
	}

	// Store storage key in avatar_url — userToResponse transforms it to the public URL.
	user, err := h.queries.UpdateUser(r.Context(), repository.UpdateUserParams{
		ID:        uid,
		AvatarUrl: pgtype.Text{String: key, Valid: true},
	})
	if err != nil {
		slog.Error("failed to update avatar_url", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to update avatar")
		return
	}

	respondJSON(w, http.StatusOK, userToResponse(user))
}

// UpdatePreferences handles PATCH /api/v1/users/me/preferences.
func (h *UserHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
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

	var body struct {
		AutoHideDays *int32 `json:"auto_hide_days"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.AutoHideDays != nil {
		if err := h.queries.UpdateAutoHideDays(r.Context(), repository.UpdateAutoHideDaysParams{
			ID:           uid,
			AutoHideDays: *body.AutoHideDays,
		}); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update preferences")
			return
		}
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ServeAvatar handles GET /api/v1/users/{id}/avatar.
func (h *UserHandler) ServeAvatar(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	uid, err := parseUUID(targetID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	user, err := h.queries.GetUserByID(r.Context(), uid)
	if err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	avatarKey := user.AvatarUrl.String
	if !strings.HasPrefix(avatarKey, "avatars/") {
		respondError(w, http.StatusNotFound, "no avatar")
		return
	}

	mimeType := mime.TypeByExtension(filepath.Ext(avatarKey))
	if mimeType == "" {
		mimeType = "image/jpeg"
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	h.storageSvc.ServeFile(w, r, avatarKey, mimeType, filepath.Base(avatarKey), h.storageSvc.Backend().Type())
}
