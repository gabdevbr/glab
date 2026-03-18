package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// RetentionAdminHandler handles admin retention and edit timeout settings.
type RetentionAdminHandler struct {
	queries *repository.Queries
}

// NewRetentionAdminHandler creates a RetentionAdminHandler.
func NewRetentionAdminHandler(q *repository.Queries) *RetentionAdminHandler {
	return &RetentionAdminHandler{queries: q}
}

type retentionConfig struct {
	DefaultDays int `json:"default_days"`
	MinimumDays int `json:"minimum_days"`
}

type editTimeoutConfig struct {
	Seconds int `json:"seconds"`
}

// GetRetention handles GET /api/v1/admin/retention.
func (h *RetentionAdminHandler) GetRetention(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.queries.GetAppConfig(r.Context(), "retention_policy")
	if err != nil {
		respondJSON(w, http.StatusOK, retentionConfig{DefaultDays: 0, MinimumDays: 7})
		return
	}
	var rc retentionConfig
	if err := json.Unmarshal(cfg.Value, &rc); err != nil {
		respondError(w, http.StatusInternalServerError, "invalid config format")
		return
	}
	respondJSON(w, http.StatusOK, rc)
}

// PutRetention handles PUT /api/v1/admin/retention.
func (h *RetentionAdminHandler) PutRetention(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body retentionConfig
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.MinimumDays < 0 {
		respondError(w, http.StatusBadRequest, "minimum_days must be >= 0")
		return
	}

	val, _ := json.Marshal(body)
	uid, _ := parseUUID(claims.UserID)

	_, err := h.queries.UpsertAppConfig(r.Context(), repository.UpsertAppConfigParams{
		Key:       "retention_policy",
		Value:     val,
		UpdatedBy: uid,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	respondJSON(w, http.StatusOK, body)
}

// GetEditTimeout handles GET /api/v1/admin/message-edit.
func (h *RetentionAdminHandler) GetEditTimeout(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.queries.GetAppConfig(r.Context(), "message_edit_timeout")
	if err != nil {
		respondJSON(w, http.StatusOK, editTimeoutConfig{Seconds: 900})
		return
	}
	var ec editTimeoutConfig
	if err := json.Unmarshal(cfg.Value, &ec); err != nil {
		respondError(w, http.StatusInternalServerError, "invalid config format")
		return
	}
	respondJSON(w, http.StatusOK, ec)
}

// PutEditTimeout handles PUT /api/v1/admin/message-edit.
func (h *RetentionAdminHandler) PutEditTimeout(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body editTimeoutConfig
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Seconds < 0 {
		respondError(w, http.StatusBadRequest, "seconds must be >= 0")
		return
	}

	val, _ := json.Marshal(body)
	uid, _ := parseUUID(claims.UserID)

	_, err := h.queries.UpsertAppConfig(r.Context(), repository.UpsertAppConfigParams{
		Key:       "message_edit_timeout",
		Value:     val,
		UpdatedBy: uid,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	respondJSON(w, http.StatusOK, body)
}
