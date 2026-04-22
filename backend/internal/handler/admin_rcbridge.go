package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/rcbridge"
)

// RCBridgeAdminHandler handles /api/v1/admin/rc-bridge/* endpoints.
type RCBridgeAdminHandler struct {
	cfgSvc *rcbridge.ConfigService
	bridge *rcbridge.Bridge
}

// NewRCBridgeAdminHandler creates a RCBridgeAdminHandler.
func NewRCBridgeAdminHandler(cfgSvc *rcbridge.ConfigService, bridge *rcbridge.Bridge) *RCBridgeAdminHandler {
	return &RCBridgeAdminHandler{cfgSvc: cfgSvc, bridge: bridge}
}

// GetConfig handles GET /api/v1/admin/rc-bridge/config.
func (h *RCBridgeAdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	cfg, err := h.cfgSvc.Load(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load RC bridge config")
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// PutConfig handles PUT /api/v1/admin/rc-bridge/config.
func (h *RCBridgeAdminHandler) PutConfig(w http.ResponseWriter, r *http.Request) {
	claims := requireAdmin(w, r)
	if claims == nil {
		return
	}

	var cfg rcbridge.Config
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	uid, _ := parseUUID(claims.UserID)
	var pgUID pgtype.UUID = uid
	if err := h.cfgSvc.Save(r.Context(), cfg, &pgUID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save RC bridge config")
		return
	}

	// Reload bridge config so changes take effect immediately
	_ = h.bridge.ReloadConfig(r.Context())

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetStatus handles GET /api/v1/admin/rc-bridge/status.
func (h *RCBridgeAdminHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"enabled":          h.bridge.Enabled(),
		"active_sessions":  h.bridge.SessionCount(),
	})
}
