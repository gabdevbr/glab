package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/migration"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// MigrationHandler handles admin migration endpoints.
type MigrationHandler struct {
	engine  *migration.Engine
	queries *repository.Queries
}

// NewMigrationHandler creates a new migration handler.
func NewMigrationHandler(engine *migration.Engine, queries *repository.Queries) *MigrationHandler {
	return &MigrationHandler{engine: engine, queries: queries}
}

// Start launches a new migration job.
// POST /api/v1/admin/migration/start
func (h *MigrationHandler) Start(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	var req struct {
		RCURL        string `json:"rc_url"`
		RCToken      string `json:"rc_token"`
		RCUserID     string `json:"rc_user_id"`
		MigrateFiles bool   `json:"migrate_files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RCURL == "" || req.RCToken == "" || req.RCUserID == "" {
		respondError(w, http.StatusBadRequest, "rc_url, rc_token, and rc_user_id are required")
		return
	}

	cfg := migration.Config{
		RCURL:        req.RCURL,
		RCToken:      req.RCToken,
		RCUserID:     req.RCUserID,
		MigrateFiles: req.MigrateFiles,
	}

	var startedBy pgtype.UUID
	if err := startedBy.Scan(claims.UserID); err == nil {
		startedBy.Valid = true
	}

	jobID, err := h.engine.Start(r.Context(), cfg, startedBy)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "a migration is already running" {
			status = http.StatusConflict
		}
		respondError(w, status, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]string{"job_id": jobID})
}

// MigrateFiles starts a file-only migration job that downloads RC file attachments.
// POST /api/v1/admin/migration/files
func (h *MigrationHandler) MigrateFiles(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	var req struct {
		RCURL    string `json:"rc_url"`
		RCToken  string `json:"rc_token"`
		RCUserID string `json:"rc_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RCURL == "" || req.RCToken == "" || req.RCUserID == "" {
		respondError(w, http.StatusBadRequest, "rc_url, rc_token, and rc_user_id are required")
		return
	}

	cfg := migration.Config{
		RCURL:        req.RCURL,
		RCToken:      req.RCToken,
		RCUserID:     req.RCUserID,
		MigrateFiles: true,
	}

	var startedBy pgtype.UUID
	if err := startedBy.Scan(claims.UserID); err == nil {
		startedBy.Valid = true
	}

	jobID, err := h.engine.StartFileMigration(r.Context(), cfg, startedBy)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "a migration is already running" {
			status = http.StatusConflict
		}
		respondError(w, status, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]string{"job_id": jobID})
}

// Cancel stops the running migration.
// POST /api/v1/admin/migration/cancel
func (h *MigrationHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	if err := h.engine.Cancel(); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

// Status returns the current migration status.
// GET /api/v1/admin/migration/status
func (h *MigrationHandler) Status(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	job, err := h.queries.GetLatestMigrationJob(r.Context())
	if err != nil {
		if err == pgx.ErrNoRows {
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"job":        nil,
				"is_running": false,
			})
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"job":        jobToJSON(job),
		"is_running": h.engine.IsRunning(),
	})
}

// Logs returns migration logs with cursor-based pagination.
// GET /api/v1/admin/migration/logs?job_id=X&after=0&limit=200
func (h *MigrationHandler) Logs(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	jobIDStr := r.URL.Query().Get("job_id")
	if jobIDStr == "" {
		respondError(w, http.StatusBadRequest, "job_id required")
		return
	}

	jobID, err := parseUUID(jobIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid job_id")
		return
	}

	after := int64(0)
	if s := r.URL.Query().Get("after"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			after = v
		}
	}

	limit := int32(200)
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 32); err == nil && v > 0 && v <= 1000 {
			limit = int32(v)
		}
	}

	logs, err := h.queries.ListMigrationLogs(r.Context(), repository.ListMigrationLogsParams{
		JobID: jobID,
		ID:    after,
		Limit: limit,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	total, _ := h.queries.CountMigrationLogs(r.Context(), jobID)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"logs":  logs,
		"total": total,
	})
}

// ListJobs returns migration job history.
// GET /api/v1/admin/migration/jobs
func (h *MigrationHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	jobs, err := h.queries.ListMigrationJobs(r.Context(), 50)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	result := make([]map[string]interface{}, len(jobs))
	for i, j := range jobs {
		result[i] = jobToJSON(j)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"jobs": result})
}

// RoomStates returns the per-room migration state for the admin UI.
// GET /api/v1/admin/migration/rooms
func (h *MigrationHandler) RoomStates(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil || claims.Role != "admin" {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}

	states, err := h.queries.ListMigrationRoomStates(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"rooms": states})
}

func jobToJSON(j repository.MigrationJob) map[string]interface{} {
	m := map[string]interface{}{
		"id":         uuidToString(j.ID),
		"status":     j.Status,
		"phase":      j.Phase,
		"error":      j.Error,
		"created_at": timestampToString(j.CreatedAt),
		"updated_at": timestampToString(j.UpdatedAt),
	}

	if len(j.Config) > 0 {
		m["config"] = json.RawMessage(j.Config)
	}
	if len(j.Progress) > 0 {
		m["progress"] = json.RawMessage(j.Progress)
	}
	if j.StartedAt.Valid {
		m["started_at"] = timestampToString(j.StartedAt)
	}
	if j.CompletedAt.Valid {
		m["completed_at"] = timestampToString(j.CompletedAt)
	}

	return m
}
