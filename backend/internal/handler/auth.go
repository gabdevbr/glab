package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/rcbridge"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	queries   *repository.Queries
	jwtSecret string
	jwtExpiry int
	bridge    *rcbridge.Bridge // optional; nil if bridge is not configured
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(q *repository.Queries, secret string, expiry int) *AuthHandler {
	return &AuthHandler{queries: q, jwtSecret: secret, jwtExpiry: expiry}
}

// SetBridge attaches the RC bridge so the login handler can delegate to RC.
func (h *AuthHandler) SetBridge(b *rcbridge.Bridge) {
	h.bridge = b
}

// Login handles POST /api/v1/auth/login.
// Supports three modes (configured via admin panel):
//   - "delegated": authenticate against RocketChat only
//   - "local":     authenticate against local bcrypt hash only
//   - "dual":      try RC first, fall back to local (default)
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Password == "" {
		respondError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	// Determine login mode from bridge config
	loginMode := "local"
	if h.bridge != nil {
		if cfg := h.bridge.Config(); cfg != nil {
			loginMode = cfg.LoginMode
		}
	}

	switch loginMode {
	case "delegated":
		h.loginDelegated(w, r, body.Username, body.Password)
	case "dual":
		h.loginDual(w, r, body.Username, body.Password)
	default:
		h.loginLocal(w, r, body.Username, body.Password)
	}
}

// loginDelegated authenticates only via RocketChat.
func (h *AuthHandler) loginDelegated(w http.ResponseWriter, r *http.Request, username, password string) {
	result, err := h.bridge.Auth().LoginAndUpsert(r.Context(), username, password)
	if err != nil {
		slog.Warn("login delegated: RC auth failed", "username", username, "error", err)
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	h.issueToken(w, result.User, result.AuthToken, result.UserID)
}

// loginDual tries RC first, falls back to local bcrypt.
func (h *AuthHandler) loginDual(w http.ResponseWriter, r *http.Request, username, password string) {
	if h.bridge != nil && h.bridge.Enabled() {
		result, err := h.bridge.Auth().LoginAndUpsert(r.Context(), username, password)
		if err == nil {
			h.issueToken(w, result.User, result.AuthToken, result.UserID)
			return
		}
		slog.Debug("login dual: RC failed, trying local", "username", username, "error", err)
	}
	h.loginLocal(w, r, username, password)
}

// loginLocal authenticates via local bcrypt hash.
func (h *AuthHandler) loginLocal(w http.ResponseWriter, r *http.Request, username, password string) {
	var user repository.User
	var err error
	if strings.Contains(username, "@") {
		user, err = h.queries.GetUserByEmail(r.Context(), username)
	} else {
		user, err = h.queries.GetUserByUsername(r.Context(), username)
	}
	if err != nil {
		slog.Warn("login: user not found", "login", username)
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := auth.CheckPassword(user.PasswordHash, password); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	h.issueToken(w, user, "", "")
}

// issueToken generates a Glab JWT and starts an RC DDP session if applicable.
func (h *AuthHandler) issueToken(w http.ResponseWriter, user repository.User, rcToken, rcUserID string) {
	token, err := auth.GenerateToken(
		uuidToString(user.ID),
		user.Username,
		user.Role,
		h.jwtSecret,
		h.jwtExpiry,
	)
	if err != nil {
		slog.Error("login: failed to generate token", "error", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Start RC DDP session asynchronously (non-blocking for login response)
	if rcToken != "" && rcUserID != "" && h.bridge != nil {
		h.bridge.AttachSession(uuidToString(user.ID), rcUserID, rcToken)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  userToResponse(user),
	})
}

// Logout handles POST /api/v1/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ChangePassword handles POST /api/v1/auth/change-password.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.CurrentPassword == "" || body.NewPassword == "" {
		respondError(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}
	if len(body.NewPassword) < 6 {
		respondError(w, http.StatusBadRequest, "new password must be at least 6 characters")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	user, err := h.queries.GetUserByID(r.Context(), uid)
	if err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	if err := auth.CheckPassword(user.PasswordHash, body.CurrentPassword); err != nil {
		respondError(w, http.StatusBadRequest, "current password is incorrect")
		return
	}

	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		slog.Error("failed to hash new password", "error", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := h.queries.UpdatePasswordHash(r.Context(), repository.UpdatePasswordHashParams{
		ID:           uid,
		PasswordHash: hash,
	}); err != nil {
		slog.Error("failed to update password", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me handles GET /api/v1/auth/me.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	user, err := h.queries.GetUserByID(r.Context(), uid)
	if err != nil {
		slog.Error("me: failed to fetch user", "error", err)
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, userToResponse(user))
}
