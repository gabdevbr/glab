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

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/storage"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

const maxUploadSize = 50 << 20 // 50 MB

// FileHandler handles file upload and serving.
type FileHandler struct {
	queries    *repository.Queries
	storageSvc *storage.StorageService
	hub        *ws.Hub
}

// NewFileHandler creates a FileHandler.
func NewFileHandler(q *repository.Queries, svc *storage.StorageService, hub *ws.Hub) *FileHandler {
	return &FileHandler{queries: q, storageSvc: svc, hub: hub}
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

	if status, err := requireChannelMember(r.Context(), h.queries, channelUUID, claims.UserID); err != nil {
		respondError(w, status, err.Error())
		return
	}

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

	// Save via StorageService — returns relative key.
	filename, key, err := h.storageSvc.Save(r.Context(), file, header, mimeType)
	if err != nil {
		slog.Error("failed to save file", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Generate thumbnail for images.
	thumbKey, err := h.storageSvc.GenerateThumbnail(r.Context(), key, mimeType)
	if err != nil {
		slog.Warn("failed to generate thumbnail", "error", err)
	}

	backendType := h.storageSvc.Backend().Type()

	// Read optional caption from form.
	caption := strings.TrimSpace(r.FormValue("caption"))
	metadata := json.RawMessage("null")
	if caption != "" {
		m, _ := json.Marshal(map[string]string{"caption": caption})
		metadata = m
	}

	// Create message for this file upload.
	msg, err := h.queries.CreateMessage(r.Context(), repository.CreateMessageParams{
		ChannelID:   channelUUID,
		UserID:      userUUID,
		Content:     header.Filename,
		ContentType: "file",
		Metadata:    metadata,
	})
	if err != nil {
		slog.Error("failed to create file message", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Create file record in DB with relative key as storage_path.
	dbFile, err := h.queries.CreateFile(r.Context(), repository.CreateFileParams{
		MessageID:      msg.ID,
		UserID:         userUUID,
		ChannelID:      channelUUID,
		Filename:       filename,
		OriginalName:   header.Filename,
		MimeType:       mimeType,
		SizeBytes:      header.Size,
		StoragePath:    key,
		ThumbnailPath:  pgtype.Text{String: thumbKey, Valid: thumbKey != ""},
		StorageBackend: backendType,
	})
	if err != nil {
		slog.Error("failed to create file record", "error", err)
		respondError(w, http.StatusInternalServerError, "failed to record file")
		return
	}

	// Broadcast message.new via WebSocket.
	fullMsg, err := h.queries.GetMessageByID(r.Context(), msg.ID)
	if err == nil {
		fr := fileToResponse(dbFile)
		newPayload := ws.MessageNewPayload{
			ID:          uuidToString(fullMsg.ID),
			ChannelID:   uuidToString(fullMsg.ChannelID),
			UserID:      uuidToString(fullMsg.UserID),
			Username:    fullMsg.Username,
			DisplayName: fullMsg.DisplayName,
			AvatarURL:   resolveAvatarURL(fullMsg.AvatarUrl.String, uuidToString(fullMsg.UserID)),
			Content:     fullMsg.Content,
			ContentType: fullMsg.ContentType,
			ThreadID:    uuidToString(fullMsg.ThreadID),
			IsBot:       fullMsg.IsBot,
			CreatedAt:   timestampToString(fullMsg.CreatedAt),
			Metadata:    metadata,
			File: &ws.FilePayload{
				ID:           fr.ID,
				MessageID:    fr.MessageID,
				UserID:       fr.UserID,
				ChannelID:    fr.ChannelID,
				Filename:     fr.Filename,
				OriginalName: fr.OriginalName,
				MimeType:     fr.MimeType,
				SizeBytes:    fr.SizeBytes,
				HasThumbnail: fr.HasThumbnail,
				CreatedAt:    fr.CreatedAt,
			},
		}
		env, err := ws.MakeEnvelope(ws.EventMessageNew, newPayload)
		if err == nil {
			h.hub.BroadcastToChannel(channelIDStr, env)
		}

		// Auto-unhide channel for all members who had it hidden
		_ = h.queries.UnhideChannelForAllMembers(r.Context(), channelUUID)
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

	h.storageSvc.ServeFile(w, r, dbFile.StoragePath, dbFile.MimeType, dbFile.OriginalName, dbFile.StorageBackend)
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
		if strings.HasPrefix(dbFile.MimeType, "image/") {
			h.storageSvc.ServeFile(w, r, dbFile.StoragePath, dbFile.MimeType, dbFile.OriginalName, dbFile.StorageBackend)
			return
		}
		respondError(w, http.StatusNotFound, "no thumbnail available")
		return
	}

	h.storageSvc.ServeThumbnail(w, r, dbFile.ThumbnailPath.String, dbFile.StorageBackend)
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
