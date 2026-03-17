package handler

import (
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"

	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/storage"
)

// EmojiHandler handles custom emoji endpoints.
type EmojiHandler struct {
	queries    *repository.Queries
	storageSvc *storage.StorageService
}

// NewEmojiHandler creates an EmojiHandler.
func NewEmojiHandler(q *repository.Queries, svc *storage.StorageService) *EmojiHandler {
	return &EmojiHandler{queries: q, storageSvc: svc}
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

	// Emojis are stored under the "emojis/" key prefix.
	// storage_path after migration 000009 is just the filename (e.g. "abc123.png").
	key := "emojis/" + filepath.Base(emoji.StoragePath)

	w.Header().Set("Cache-Control", "public, max-age=86400")
	h.storageSvc.ServeFile(w, r, key, emoji.MimeType, emoji.Name, h.storageSvc.Backend().Type())
}
