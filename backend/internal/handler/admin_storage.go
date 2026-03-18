package handler

import (
	"context"
	"log"
	"net/http"

	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/storage"
)

// StorageMigrator is implemented by the storage migration engine (Phase 5).
type StorageMigrator interface {
	Start(ctx context.Context, source, dest string) error
	Cancel()
	Status() storage.MigrationProgress
}

// StorageAdminHandler handles /api/v1/admin/storage/* endpoints.
type StorageAdminHandler struct {
	queries    *repository.Queries
	cfgSvc     *storage.StorageConfigService
	storageSvc *storage.StorageService
	swappable  *storage.SwappableBackend
	migrator   StorageMigrator
}

// NewStorageAdminHandler creates a StorageAdminHandler.
func NewStorageAdminHandler(
	q *repository.Queries,
	cfgSvc *storage.StorageConfigService,
	storageSvc *storage.StorageService,
	swappable *storage.SwappableBackend,
	migrator StorageMigrator,
) *StorageAdminHandler {
	return &StorageAdminHandler{
		queries:    q,
		cfgSvc:     cfgSvc,
		storageSvc: storageSvc,
		swappable:  swappable,
		migrator:   migrator,
	}
}

// GetConfig handles GET /api/v1/admin/storage/config.
func (h *StorageAdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	cfg, err := h.cfgSvc.Load(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load storage config")
		return
	}
	// Mask secret key in response.
	if cfg.S3.SecretAccessKey != "" {
		cfg.S3.SecretAccessKey = "••••••••"
	}
	respondJSON(w, http.StatusOK, cfg)
}

// PutConfig handles PUT /api/v1/admin/storage/config.
func (h *StorageAdminHandler) PutConfig(w http.ResponseWriter, r *http.Request) {
	claims := requireAdmin(w, r)
	if claims == nil {
		return
	}

	var cfg storage.StorageConfig
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If secret key is masked (unchanged), reload existing value.
	if cfg.S3.SecretAccessKey == "••••••••" {
		existing, err := h.cfgSvc.Load(r.Context())
		if err == nil {
			cfg.S3.SecretAccessKey = existing.S3.SecretAccessKey
		}
	}

	uid, _ := parseUUID(claims.UserID)
	if err := h.cfgSvc.Save(r.Context(), cfg, &uid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save storage config")
		return
	}

	// Hot-swap the active backend.
	backend, err := storage.BuildBackend(r.Context(), cfg)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid backend config: "+err.Error())
		return
	}
	h.swappable.Swap(backend)

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TestConnection handles POST /api/v1/admin/storage/test.
func (h *StorageAdminHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	var cfg storage.StorageConfig
	if err := parseBody(r, &cfg); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if cfg.Backend != "s3" {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "local backend requires no connection test"})
		return
	}

	s3b, err := storage.NewS3Backend(r.Context(), storage.S3Config{
		Endpoint:        cfg.S3.Endpoint,
		Region:          cfg.S3.Region,
		Bucket:          cfg.S3.Bucket,
		AccessKeyID:     cfg.S3.AccessKeyID,
		SecretAccessKey: cfg.S3.SecretAccessKey,
		KeyPrefix:       cfg.S3.KeyPrefix,
		ForcePathStyle:  cfg.S3.ForcePathStyle,
	})
	if err != nil {
		respondError(w, http.StatusBadRequest, "failed to create S3 client: "+err.Error())
		return
	}

	if err := s3b.TestConnection(r.Context()); err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "connection successful"})
}

// StartMigration handles POST /api/v1/admin/storage/migrate.
func (h *StorageAdminHandler) StartMigration(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	if h.migrator == nil {
		respondError(w, http.StatusNotImplemented, "migration engine not available")
		return
	}

	var body struct {
		Source string `json:"source"` // "local" or "s3"
		Dest   string `json:"dest"`
	}
	if err := parseBody(r, &body); err != nil || body.Source == "" || body.Dest == "" {
		respondError(w, http.StatusBadRequest, "source and dest are required")
		return
	}

	if err := h.migrator.Start(r.Context(), body.Source, body.Dest); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]string{"status": "started"})
}

// MigrationStatus handles GET /api/v1/admin/storage/migrate/status.
func (h *StorageAdminHandler) MigrationStatus(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	if h.migrator == nil {
		respondJSON(w, http.StatusOK, storage.MigrationProgress{})
		return
	}

	// Also include per-backend file counts.
	counts, _ := h.queries.CountFilesByBackend(r.Context())
	backendCounts := make(map[string]int64, len(counts))
	for _, c := range counts {
		backendCounts[c.StorageBackend] = c.Count
	}

	type response struct {
		storage.MigrationProgress
		FileCounts map[string]int64 `json:"file_counts"`
	}
	respondJSON(w, http.StatusOK, response{
		MigrationProgress: h.migrator.Status(),
		FileCounts:        backendCounts,
	})
}

// CancelMigration handles POST /api/v1/admin/storage/migrate/cancel.
func (h *StorageAdminHandler) CancelMigration(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	if h.migrator != nil {
		h.migrator.Cancel()
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// DeleteAllFiles handles DELETE /api/v1/admin/storage/files.
// Removes all file records from DB and deletes the underlying blobs.
func (h *StorageAdminHandler) DeleteAllFiles(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}

	// List all file paths before deleting records.
	files, err := h.queries.ListAllFileStoragePaths(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list files")
		return
	}

	// Delete blobs from storage (best-effort, log errors).
	deleted := 0
	for _, f := range files {
		if f.StoragePath != "" {
			if err := h.storageSvc.Delete(r.Context(), f.StoragePath, f.StorageBackend); err != nil {
				log.Printf("[admin] failed to delete blob %s: %v", f.StoragePath, err)
			}
		}
		if f.ThumbnailPath.Valid && f.ThumbnailPath.String != "" {
			_ = h.storageSvc.Delete(r.Context(), f.ThumbnailPath.String, f.StorageBackend)
		}
		deleted++
	}

	// Delete all records from DB.
	if err := h.queries.DeleteAllFiles(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete file records")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"deleted": deleted,
	})
}
