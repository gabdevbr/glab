package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/giphy"
)

// GiphyAdminHandler handles /api/v1/admin/giphy/* endpoints.
type GiphyAdminHandler struct {
	cfgSvc *giphy.ConfigService
}

// NewGiphyAdminHandler creates a GiphyAdminHandler.
func NewGiphyAdminHandler(cfgSvc *giphy.ConfigService) *GiphyAdminHandler {
	return &GiphyAdminHandler{cfgSvc: cfgSvc}
}

// GetConfig handles GET /api/v1/admin/giphy/config.
func (h *GiphyAdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	cfg, err := h.cfgSvc.Load(r.Context())
	if err != nil {
		// Return empty config if not yet configured.
		respondJSON(w, http.StatusOK, giphy.Config{})
		return
	}
	if cfg.APIKey != "" {
		cfg.APIKey = "••••••••"
	}
	respondJSON(w, http.StatusOK, cfg)
}

// PutConfig handles PUT /api/v1/admin/giphy/config.
func (h *GiphyAdminHandler) PutConfig(w http.ResponseWriter, r *http.Request) {
	claims := requireAdmin(w, r)
	if claims == nil {
		return
	}

	var cfg giphy.Config
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If API key is masked (unchanged), reload existing value.
	if cfg.APIKey == "••••••••" {
		existing, err := h.cfgSvc.Load(r.Context())
		if err == nil {
			cfg.APIKey = existing.APIKey
		}
	}

	uid, _ := parseUUID(claims.UserID)
	var pgUID pgtype.UUID = uid
	if err := h.cfgSvc.Save(r.Context(), cfg, &pgUID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save Giphy config")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
