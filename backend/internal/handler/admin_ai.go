package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/ai"
	"github.com/geovendas/glab/backend/internal/repository"
)

// AIAdminHandler handles /api/v1/admin/ai/* endpoints.
type AIAdminHandler struct {
	queries *repository.Queries
	cfgSvc  *ai.GatewayConfigService
}

// NewAIAdminHandler creates an AIAdminHandler.
func NewAIAdminHandler(q *repository.Queries, cfgSvc *ai.GatewayConfigService) *AIAdminHandler {
	return &AIAdminHandler{queries: q, cfgSvc: cfgSvc}
}

// GetConfig handles GET /api/v1/admin/ai/config.
func (h *AIAdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	cfg, err := h.cfgSvc.Load(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load AI config")
		return
	}
	// Mask token in response.
	if cfg.Token != "" {
		cfg.Token = "••••••••"
	}
	respondJSON(w, http.StatusOK, cfg)
}

// PutConfig handles PUT /api/v1/admin/ai/config.
func (h *AIAdminHandler) PutConfig(w http.ResponseWriter, r *http.Request) {
	claims := requireAdmin(w, r)
	if claims == nil {
		return
	}

	var cfg ai.GatewayConfig
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If token is masked (unchanged), reload existing value.
	if cfg.Token == "••••••••" {
		existing, err := h.cfgSvc.Load(r.Context())
		if err == nil {
			cfg.Token = existing.Token
		}
	}

	uid, _ := parseUUID(claims.UserID)
	var pgUID pgtype.UUID = uid
	if err := h.cfgSvc.Save(r.Context(), cfg, &pgUID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save AI config")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TestConnection handles POST /api/v1/admin/ai/test.
func (h *AIAdminHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	var cfg ai.GatewayConfig
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If token is masked, use the stored one.
	if cfg.Token == "••••••••" {
		existing, err := h.cfgSvc.Load(r.Context())
		if err == nil {
			cfg.Token = existing.Token
		}
	}

	if err := h.cfgSvc.TestConnection(r.Context(), cfg); err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "gateway reachable"})
}
