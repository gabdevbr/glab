package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	queries   *repository.Queries
	jwtSecret string
	jwtExpiry int
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(q *repository.Queries, secret string, expiry int) *AuthHandler {
	return &AuthHandler{queries: q, jwtSecret: secret, jwtExpiry: expiry}
}

// Login handles POST /api/v1/auth/login.
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

	// Accept username or email
	var user repository.User
	var err error
	if strings.Contains(body.Username, "@") {
		user, err = h.queries.GetUserByEmail(r.Context(), body.Username)
	} else {
		user, err = h.queries.GetUserByUsername(r.Context(), body.Username)
	}
	if err != nil {
		slog.Warn("login: user not found", "login", body.Username, "error", err)
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := auth.CheckPassword(user.PasswordHash, body.Password); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

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

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  userToResponse(user),
	})
}

// Logout handles POST /api/v1/auth/logout.
// JWT is stateless so we just acknowledge the request.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
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
