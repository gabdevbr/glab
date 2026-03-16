package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/geovendas/glab/backend/internal/repository"
)

// EmojiHandler handles custom emoji endpoints.
type EmojiHandler struct {
	queries *repository.Queries
}

// NewEmojiHandler creates an EmojiHandler.
func NewEmojiHandler(q *repository.Queries) *EmojiHandler {
	return &EmojiHandler{queries: q}
}

// List handles GET /api/v1/emojis/custom — returns all custom emojis.
func (h *EmojiHandler) List(w http.ResponseWriter, r *http.Request) {
	emojis, err := h.queries.ListCustomEmojis(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list emojis")
		return
	}

	items := make([]map[string]interface{}, len(emojis))
	for i, e := range emojis {
		items[i] = map[string]interface{}{
			"id":      uuidToString(e.ID),
			"name":    e.Name,
			"aliases": e.Aliases,
			"url":     "/api/v1/emojis/custom/" + e.Name,
		}
	}

	respondJSON(w, http.StatusOK, items)
}

// Serve handles GET /api/v1/emojis/custom/{name} — serves the emoji image file.
func (h *EmojiHandler) Serve(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	emoji, err := h.queries.GetCustomEmojiByName(r.Context(), name)
	if err != nil {
		respondError(w, http.StatusNotFound, "emoji not found")
		return
	}

	w.Header().Set("Content-Type", emoji.MimeType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, emoji.StoragePath)
}
