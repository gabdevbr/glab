package handler

import (
	"encoding/json"
	"log/slog"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/storage"
)

const maxUploadSize = 50 << 20 // 50 MB

// FileHandler handles file upload and serving.
type FileHandler struct {
	queries     *repository.Queries
	fileService *storage.FileService
}

// NewFileHandler creates a FileHandler.
func NewFileHandler(q *repository.Queries, fs *storage.FileService) *FileHandler {
	return &FileHandler{queries: q, fileService: fs}
}

// Upload handles POST /api/v1/channels/{id}/upload.
func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelUUID, err := parseUUID(channelIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	// Limit request body size.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		respondError(w, http.StatusBadRequest, "file too large (max 50MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	// Detect MIME type.
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mime.TypeByExtension(filepath.Ext(header.Filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
	}

	// Save file to disk.
	filename, storagePath, err := h.fileService.Save(file, header)
	if err != nil {
		slog.Error("failed to save file", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Generate thumbnail for images.
	thumbPath, err := h.fileService.GenerateThumbnail(storagePath, mimeType)
	if err != nil {
		slog.Warn("failed to generate thumbnail", "error", err)
		// Non-fatal; continue without thumbnail.
	}

	// Create a message for this file upload.
	msgContent := header.Filename
	msg, err := h.queries.CreateMessage(r.Context(), repository.CreateMessageParams{
		ChannelID:   channelUUID,
		UserID:      userUUID,
		Content:     msgContent,
		ContentType: "file",
		Metadata:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("failed to create file message", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Create file record in DB.
	dbFile, err := h.queries.CreateFile(r.Context(), repository.CreateFileParams{
		MessageID:     msg.ID,
		UserID:        userUUID,
		ChannelID:     channelUUID,
		Filename:      filename,
		OriginalName:  header.Filename,
		MimeType:      mimeType,
		SizeBytes:     header.Size,
		StoragePath:   storagePath,
		ThumbnailPath: pgtype.Text{String: thumbPath, Valid: thumbPath != ""},
	})
	if err != nil {
		slog.Error("failed to create file record", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to record file")
		return
	}

	respondJSON(w, http.StatusCreated, fileToResponse(dbFile))
}

// ServeFile handles GET /api/v1/files/{id}.
func (h *FileHandler) ServeFile(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	fileUUID, err := parseUUID(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}

	dbFile, err := h.queries.GetFileByID(r.Context(), fileUUID)
	if err != nil {
		respondError(w, http.StatusNotFound, "file not found")
		return
	}

	w.Header().Set("Content-Type", dbFile.MimeType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+dbFile.OriginalName+"\"")
	http.ServeFile(w, r, dbFile.StoragePath)
}

// ServeThumbnail handles GET /api/v1/files/{id}/thumbnail.
func (h *FileHandler) ServeThumbnail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	fileUUID, err := parseUUID(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}

	dbFile, err := h.queries.GetFileByID(r.Context(), fileUUID)
	if err != nil {
		respondError(w, http.StatusNotFound, "file not found")
		return
	}

	if !dbFile.ThumbnailPath.Valid || dbFile.ThumbnailPath.String == "" {
		// No thumbnail; serve the original if it's an image.
		if strings.HasPrefix(dbFile.MimeType, "image/") {
			w.Header().Set("Content-Type", dbFile.MimeType)
			http.ServeFile(w, r, dbFile.StoragePath)
			return
		}
		respondError(w, http.StatusNotFound, "no thumbnail available")
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeFile(w, r, dbFile.ThumbnailPath.String)
}

// FileResponse is the JSON representation of a file.
type FileResponse struct {
	ID           string `json:"id"`
	MessageID    string `json:"message_id,omitempty"`
	UserID       string `json:"user_id"`
	ChannelID    string `json:"channel_id"`
	Filename     string `json:"filename"`
	OriginalName string `json:"original_name"`
	MimeType     string `json:"mime_type"`
	SizeBytes    int64  `json:"size_bytes"`
	HasThumbnail bool   `json:"has_thumbnail"`
	CreatedAt    string `json:"created_at"`
}

func fileToResponse(f repository.File) FileResponse {
	return FileResponse{
		ID:           uuidToString(f.ID),
		MessageID:    uuidToString(f.MessageID),
		UserID:       uuidToString(f.UserID),
		ChannelID:    uuidToString(f.ChannelID),
		Filename:     f.Filename,
		OriginalName: f.OriginalName,
		MimeType:     f.MimeType,
		SizeBytes:    f.SizeBytes,
		HasThumbnail: f.ThumbnailPath.Valid && f.ThumbnailPath.String != "",
		CreatedAt:    timestampToString(f.CreatedAt),
	}
}
