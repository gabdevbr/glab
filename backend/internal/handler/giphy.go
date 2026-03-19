package handler

import (
	"net/http"
	"strconv"

	"github.com/gabdevbr/glab/backend/internal/giphy"
)

// GiphyHandler handles user-facing Giphy proxy endpoints.
type GiphyHandler struct {
	cfgSvc *giphy.ConfigService
}

// NewGiphyHandler creates a GiphyHandler.
func NewGiphyHandler(cfgSvc *giphy.ConfigService) *GiphyHandler {
	return &GiphyHandler{cfgSvc: cfgSvc}
}

func (h *GiphyHandler) loadClient(w http.ResponseWriter, r *http.Request) *giphy.Client {
	cfg, err := h.cfgSvc.Load(r.Context())
	if err != nil || cfg.APIKey == "" {
		respondError(w, http.StatusServiceUnavailable, "Giphy is not configured")
		return nil
	}
	return giphy.NewClient(cfg.APIKey)
}

// Search handles GET /api/v1/giphy/search?q=<query>&limit=20.
func (h *GiphyHandler) Search(w http.ResponseWriter, r *http.Request) {
	client := h.loadClient(w, r)
	if client == nil {
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		respondError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}

	gifs, err := client.Search(r.Context(), query, limit)
	if err != nil {
		respondError(w, http.StatusBadGateway, "Giphy search failed")
		return
	}

	respondJSON(w, http.StatusOK, gifs)
}

// Trending handles GET /api/v1/giphy/trending?limit=20.
func (h *GiphyHandler) Trending(w http.ResponseWriter, r *http.Request) {
	client := h.loadClient(w, r)
	if client == nil {
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}

	gifs, err := client.Trending(r.Context(), limit)
	if err != nil {
		respondError(w, http.StatusBadGateway, "Giphy trending failed")
		return
	}

	respondJSON(w, http.StatusOK, gifs)
}
