package handler

import (
	"net/http"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// DeviceHandler handles device token registration for push notifications.
type DeviceHandler struct {
	queries *repository.Queries
}

// NewDeviceHandler creates a new DeviceHandler.
func NewDeviceHandler(q *repository.Queries) *DeviceHandler {
	return &DeviceHandler{queries: q}
}

type registerDeviceRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

// Register handles POST /api/v1/devices — register a device token.
func (h *DeviceHandler) Register(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())

	var req registerDeviceRequest
	if err := parseBody(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Token == "" {
		respondError(w, http.StatusBadRequest, "token is required")
		return
	}
	if req.Platform == "" {
		req.Platform = "ios"
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	err = h.queries.RegisterDeviceToken(r.Context(), repository.RegisterDeviceTokenParams{
		UserID:   userUUID,
		Token:    req.Token,
		Platform: req.Platform,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to register device")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Unregister handles DELETE /api/v1/devices/{token} — unregister a device token.
func (h *DeviceHandler) Unregister(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	token := r.PathValue("token")
	if token == "" {
		respondError(w, http.StatusBadRequest, "token is required")
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	err = h.queries.UnregisterDeviceToken(r.Context(), repository.UnregisterDeviceTokenParams{
		UserID: userUUID,
		Token:  token,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to unregister device")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
