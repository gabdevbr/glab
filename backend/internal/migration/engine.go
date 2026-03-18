package migration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/ws"
)

// Config holds the migration parameters provided by the admin.
type Config struct {
	RCURL        string `json:"rc_url"`
	RCToken      string `json:"rc_token"`
	RCUserID     string `json:"rc_user_id"`
	MigrateFiles bool   `json:"migrate_files"`
}

// RedactedConfig returns config with token masked for DB storage.
func (c Config) RedactedConfig() Config {
	rc := c
	if len(rc.RCToken) > 8 {
		rc.RCToken = rc.RCToken[:4] + "****" + rc.RCToken[len(rc.RCToken)-4:]
	} else {
		rc.RCToken = "****"
	}
	return rc
}

// Progress tracks the current migration state.
type Progress struct {
	Users       int `json:"users"`
	Channels    int `json:"channels"`
	Members     int `json:"members"`
	Messages    int `json:"messages"`
	Reactions   int `json:"reactions"`
	Mentions    int `json:"mentions"`
	RoomsTotal  int `json:"rooms_total"`
	RoomsDone   int `json:"rooms_done"`
	Files       int `json:"files"`
	Emojis      int `json:"emojis"`
}

// Engine manages the lifecycle of a migration run.
type Engine struct {
	pool      *pgxpool.Pool
	queries   *repository.Queries
	hub       *ws.Hub
	uploadDir string
	mu        sync.Mutex
	cancel    context.CancelFunc
	jobID     pgtype.UUID
}

// NewEngine creates a migration engine. On creation it recovers orphaned running jobs.
func NewEngine(pool *pgxpool.Pool, queries *repository.Queries, hub *ws.Hub, uploadDir string) *Engine {
	e := &Engine{
		pool:      pool,
		queries:   queries,
		hub:       hub,
		uploadDir: uploadDir,
	}
	e.recoverOrphanedJobs()
	return e
}

// recoverOrphanedJobs marks any "running" jobs as failed (server restarted mid-migration).
func (e *Engine) recoverOrphanedJobs() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	job, err := e.queries.GetRunningMigrationJob(ctx)
	if err != nil {
		return // no running job — normal case
	}

	_ = e.queries.UpdateMigrationJobStatus(ctx, repository.UpdateMigrationJobStatusParams{
		ID:     job.ID,
		Status: "failed",
		Error:  "interrupted by server restart",
	})
	slog.Warn("migration: recovered orphaned running job", "job_id", uuidToString(job.ID))
}

// Start validates config, creates a DB job, and launches the migration goroutine.
// Returns the job ID or an error if already running or credentials are invalid.
func (e *Engine) Start(ctx context.Context, cfg Config, startedBy pgtype.UUID) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Check singleton
	if _, err := e.queries.GetRunningMigrationJob(ctx); err == nil {
		return "", fmt.Errorf("a migration is already running")
	}

	// Validate RC credentials
	rc := NewRCClient(cfg.RCURL, cfg.RCToken, cfg.RCUserID)
	if err := rc.TestConnection(ctx); err != nil {
		return "", fmt.Errorf("failed to connect to RocketChat: %w", err)
	}

	// Create job record
	redacted := cfg.RedactedConfig()
	configJSON, _ := json.Marshal(redacted)

	job, err := e.queries.CreateMigrationJob(ctx, repository.CreateMigrationJobParams{
		Status:    "running",
		Config:    configJSON,
		StartedBy: startedBy,
	})
	if err != nil {
		return "", fmt.Errorf("creating job: %w", err)
	}

	// Mark as running
	_ = e.queries.UpdateMigrationJobStatus(ctx, repository.UpdateMigrationJobStatusParams{
		ID:     job.ID,
		Status: "running",
		Error:  "",
	})

	// Launch background goroutine
	runCtx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	e.jobID = job.ID

	go e.run(runCtx, cfg, job.ID)

	return uuidToString(job.ID), nil
}

// Cancel stops the running migration gracefully.
func (e *Engine) Cancel() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.cancel == nil {
		return fmt.Errorf("no migration is running")
	}

	e.cancel()
	return nil
}

// IsRunning returns whether a migration is currently active.
func (e *Engine) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.cancel != nil
}

// run executes the full migration pipeline.
func (e *Engine) run(ctx context.Context, cfg Config, jobID pgtype.UUID) {
	defer func() {
		e.mu.Lock()
		e.cancel = nil
		e.jobID = pgtype.UUID{}
		e.mu.Unlock()
	}()

	rc := NewRCClient(cfg.RCURL, cfg.RCToken, cfg.RCUserID)
	loader := NewLoader(e.pool, e.uploadDir)
	idMap := NewIDMap()
	progress := &Progress{}

	// Helper to check cancellation
	cancelled := func() bool {
		return ctx.Err() != nil
	}

	// Helper to set phase
	setPhase := func(phase string) {
		progressJSON, _ := json.Marshal(progress)
		_ = e.queries.UpdateMigrationJobPhase(ctx, repository.UpdateMigrationJobPhaseParams{
			ID:       jobID,
			Phase:    phase,
			Progress: progressJSON,
		})
		e.broadcastStatus(jobID, "running", phase, progress)
	}

	// Helper to update progress
	updateProgress := func() {
		progressJSON, _ := json.Marshal(progress)
		_ = e.queries.UpdateMigrationJobPhase(context.Background(), repository.UpdateMigrationJobPhaseParams{
			ID:       jobID,
			Phase:    "",
			Progress: progressJSON,
		})
		e.broadcastProgress(jobID, progress)
	}

	fail := func(err error) {
		_ = e.queries.UpdateMigrationJobStatus(context.Background(), repository.UpdateMigrationJobStatusParams{
			ID:     jobID,
			Status: "failed",
			Error:  err.Error(),
		})
		e.emitLog(jobID, "error", "", err.Error(), nil)
		e.broadcastStatus(jobID, "failed", "", progress)
	}

	// ── Phase 1: Export Users ──────────────────────────────────
	setPhase("export_users")
	e.emitLog(jobID, "info", "export_users", "Fetching users from RocketChat...", nil)

	rcUsers, err := rc.GetUsers(ctx)
	if err != nil {
		fail(fmt.Errorf("fetching users: %w", err))
		return
	}
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}

	glabUsers := TransformUsers(rcUsers, idMap)
	progress.Users = len(glabUsers)
	e.emitLog(jobID, "info", "export_users", fmt.Sprintf("Found %d active users, upserting...", len(glabUsers)), nil)

	if err := loader.UpsertUsers(ctx, glabUsers); err != nil {
		fail(fmt.Errorf("upserting users: %w", err))
		return
	}
	updateProgress()
	e.emitLog(jobID, "info", "export_users", fmt.Sprintf("Upserted %d users", len(glabUsers)), nil)

	// ── Phase 2: Export Rooms ──────────────────────────────────
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}
	setPhase("export_rooms")
	e.emitLog(jobID, "info", "export_rooms", "Fetching rooms from RocketChat...", nil)

	rcChannels, err := rc.GetChannels(ctx)
	if err != nil {
		fail(fmt.Errorf("fetching channels: %w", err))
		return
	}
	rcGroups, err := rc.GetGroups(ctx)
	if err != nil {
		fail(fmt.Errorf("fetching groups: %w", err))
		return
	}
	rcDMs, err := rc.GetDMs(ctx)
	if err != nil {
		fail(fmt.Errorf("fetching DMs: %w", err))
		return
	}
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}

	// Fetch complete member lists for private groups (groups.list returns incomplete usernames)
	e.emitLog(jobID, "info", "export_rooms", "Fetching complete member lists for private groups...", nil)
	for i := range rcGroups {
		if cancelled() {
			e.handleCancellation(jobID, progress)
			return
		}
		members, err := rc.GetRoomMembers(ctx, rcGroups[i].ID, "p")
		if err != nil {
			e.emitLog(jobID, "warn", "export_rooms", fmt.Sprintf("Group %s: failed to fetch members: %v", rcGroups[i].Name, err), nil)
			continue
		}
		rcGroups[i].Usernames = members
	}

	allRooms := make([]RCRoom, 0, len(rcChannels)+len(rcGroups)+len(rcDMs))
	allRooms = append(allRooms, rcChannels...)
	allRooms = append(allRooms, rcGroups...)
	allRooms = append(allRooms, rcDMs...)

	systemUserID := uuid.Nil
	for _, u := range glabUsers {
		if u.Role == "admin" {
			systemUserID = u.ID
			break
		}
	}
	if systemUserID == uuid.Nil && len(glabUsers) > 0 {
		systemUserID = glabUsers[0].ID
	}

	glabChannels := TransformChannels(allRooms, idMap, systemUserID)
	progress.Channels = len(glabChannels)
	e.emitLog(jobID, "info", "export_rooms", fmt.Sprintf("Found %d channels, %d groups, %d DMs", len(rcChannels), len(rcGroups), len(rcDMs)), nil)

	if err := loader.UpsertChannels(ctx, glabChannels); err != nil {
		fail(fmt.Errorf("upserting channels: %w", err))
		return
	}
	updateProgress()

	// ── Phase 3: Export Members ────────────────────────────────
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}
	setPhase("export_members")

	glabMembers := TransformMembers(allRooms, idMap)
	progress.Members = len(glabMembers)

	if err := loader.UpsertMembers(ctx, glabMembers); err != nil {
		fail(fmt.Errorf("upserting members: %w", err))
		return
	}
	updateProgress()
	e.emitLog(jobID, "info", "export_members", fmt.Sprintf("Upserted %d memberships", len(glabMembers)), nil)

	// ── Phase 4: Export Messages ───────────────────────────────
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}
	setPhase("export_messages")
	progress.RoomsTotal = len(allRooms)
	updateProgress()
	e.emitLog(jobID, "info", "export_messages", fmt.Sprintf("Starting message export for %d rooms...", len(allRooms)), nil)

	globalOldest := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)

	for i, room := range allRooms {
		if cancelled() {
			e.handleCancellation(jobID, progress)
			return
		}

		roomName := room.Name
		if roomName == "" {
			roomName = room.ID
		}

		// Check incremental state
		oldest := globalOldest
		roomState, err := e.queries.GetMigrationRoomState(ctx, room.ID)
		if err == nil && roomState.LatestExport.Valid {
			oldest = roomState.LatestExport.Time.Add(time.Millisecond)
		}
		latest := time.Now()

		e.emitLog(jobID, "info", "export_messages", fmt.Sprintf("[%d/%d] Fetching %s...", i+1, len(allRooms), roomName), nil)

		// Per-room timeout: 10 minutes max per room to avoid blocking the entire migration.
		roomCtx, roomCancel := context.WithTimeout(ctx, 10*time.Minute)
		msgs, err := rc.GetMessages(roomCtx, room.ID, room.Type, oldest, latest)
		roomCancel()
		if err != nil {
			e.emitLog(jobID, "warn", "export_messages", fmt.Sprintf("Room %s: failed to fetch messages: %v", roomName, err), nil)
			progress.RoomsDone++
			updateProgress()
			continue
		}

		if len(msgs) > 0 {
			glabMsgs := TransformMessages(msgs, idMap)
			reactions := TransformReactions(msgs, idMap)
			mentions := ExtractMentions(glabMsgs, idMap)

			// Filter reactions to included messages
			includedMsgs := make(map[uuid.UUID]bool, len(glabMsgs))
			for _, m := range glabMsgs {
				includedMsgs[m.ID] = true
			}
			filtered := reactions[:0]
			for _, r := range reactions {
				if includedMsgs[r.MessageID] {
					filtered = append(filtered, r)
				}
			}
			reactions = filtered

			if err := loader.LoadRoomData(ctx, glabMsgs, reactions, mentions); err != nil {
				e.emitLog(jobID, "warn", "export_messages", fmt.Sprintf("Room %s: failed to load: %v", roomName, err), nil)
			} else {
				progress.Messages += len(glabMsgs)
				progress.Reactions += len(reactions)
				progress.Mentions += len(mentions)

				// Find latest timestamp for room state
				var latestTS time.Time
				for _, m := range msgs {
					t := time.UnixMilli(m.Timestamp.Date)
					if t.After(latestTS) {
						latestTS = t
					}
				}

				_ = e.queries.UpsertMigrationRoomState(ctx, repository.UpsertMigrationRoomStateParams{
					RcRoomID:     room.ID,
					RcRoomName:   roomName,
					RcRoomType:   room.Type,
					MessageCount: int32(len(glabMsgs)),
					LatestExport: pgtype.Timestamptz{Time: latestTS, Valid: true},
					JobID:        jobID,
				})
			}

			e.emitLog(jobID, "info", "export_messages", fmt.Sprintf("[%d/%d] %s: %d msgs, %d reactions", i+1, len(allRooms), roomName, len(glabMsgs), len(reactions)), nil)
		} else {
			// Register room even with 0 messages
			if err != nil && err != pgx.ErrNoRows {
				// room state already exists, skip
			} else {
				_ = e.queries.UpsertMigrationRoomState(ctx, repository.UpsertMigrationRoomStateParams{
					RcRoomID:     room.ID,
					RcRoomName:   roomName,
					RcRoomType:   room.Type,
					MessageCount: 0,
					LatestExport: pgtype.Timestamptz{Time: time.Now(), Valid: true},
					JobID:        jobID,
				})
			}
		}

		progress.RoomsDone++
		updateProgress()
	}

	// ── Phase 5: Custom Emojis ───────────────────────────────
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}
	setPhase("export_emojis")
	e.emitLog(jobID, "info", "export_emojis", "Fetching custom emojis from RocketChat...", nil)

	if err := e.migrateCustomEmojis(ctx, rc, loader, jobID, progress); err != nil {
		e.emitLog(jobID, "warn", "export_emojis", fmt.Sprintf("Custom emojis: %v", err), nil)
	}
	updateProgress()

	// ── Phase 6: Rebuild Indexes ───────────────────────────────
	if cancelled() {
		e.handleCancellation(jobID, progress)
		return
	}
	setPhase("rebuild_indexes")
	e.emitLog(jobID, "info", "rebuild_indexes", "Rebuilding thread summaries...", nil)

	if err := loader.RebuildThreadSummaries(ctx); err != nil {
		e.emitLog(jobID, "warn", "rebuild_indexes", fmt.Sprintf("Thread summaries: %v", err), nil)
	}

	e.emitLog(jobID, "info", "rebuild_indexes", "Refreshing search indexes...", nil)
	if err := loader.RefreshSearchIndexes(ctx); err != nil {
		e.emitLog(jobID, "warn", "rebuild_indexes", fmt.Sprintf("Search indexes: %v", err), nil)
	}

	// ── Complete ───────────────────────────────────────────────
	_ = e.queries.UpdateMigrationJobStatus(context.Background(), repository.UpdateMigrationJobStatusParams{
		ID:     jobID,
		Status: "completed",
		Error:  "",
	})

	summary := fmt.Sprintf("Migration complete: %d users, %d channels, %d members, %d messages, %d reactions, %d mentions",
		progress.Users, progress.Channels, progress.Members, progress.Messages, progress.Reactions, progress.Mentions)
	e.emitLog(jobID, "info", "complete", summary, nil)
	e.broadcastStatus(jobID, "completed", "complete", progress)
}

// StartFileMigration launches a background file download job using existing RC credentials.
func (e *Engine) StartFileMigration(ctx context.Context, cfg Config, startedBy pgtype.UUID) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.cancel != nil {
		return "", fmt.Errorf("a migration is already running")
	}

	rc := NewRCClient(cfg.RCURL, cfg.RCToken, cfg.RCUserID)
	if err := rc.TestConnection(ctx); err != nil {
		return "", fmt.Errorf("failed to connect to RocketChat: %w", err)
	}

	redacted := cfg.RedactedConfig()
	configJSON, _ := json.Marshal(redacted)

	job, err := e.queries.CreateMigrationJob(ctx, repository.CreateMigrationJobParams{
		Status:    "running",
		Config:    configJSON,
		StartedBy: startedBy,
	})
	if err != nil {
		return "", fmt.Errorf("creating job: %w", err)
	}

	_ = e.queries.UpdateMigrationJobStatus(ctx, repository.UpdateMigrationJobStatusParams{
		ID:     job.ID,
		Status: "running",
		Error:  "",
	})

	runCtx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	e.jobID = job.ID

	go e.runFileMigration(runCtx, cfg, job.ID)

	return uuidToString(job.ID), nil
}

// runFileMigration iterates all migrated rooms, finds file messages in RC, downloads files,
// and creates records in the files table.
func (e *Engine) runFileMigration(ctx context.Context, cfg Config, jobID pgtype.UUID) {
	defer func() {
		e.mu.Lock()
		e.cancel = nil
		e.jobID = pgtype.UUID{}
		e.mu.Unlock()
	}()

	rc := NewRCClient(cfg.RCURL, cfg.RCToken, cfg.RCUserID)

	// Validate token before starting any work.
	username, err := rc.ValidateToken(ctx)
	if err != nil {
		e.emitLog(jobID, "error", "validate_token", fmt.Sprintf("RC token validation failed: %v", err), nil)
		_ = e.queries.UpdateMigrationJobStatus(ctx, repository.UpdateMigrationJobStatusParams{
			ID:     jobID,
			Status: "failed",
			Error:  "RC token invalid or expired — get a fresh token from RC admin panel",
		})
		return
	}
	e.emitLog(jobID, "info", "validate_token", fmt.Sprintf("Authenticated as RC user: %s", username), nil)

	progress := &Progress{}

	setPhase := func(phase string) {
		progressJSON, _ := json.Marshal(progress)
		_ = e.queries.UpdateMigrationJobPhase(ctx, repository.UpdateMigrationJobPhaseParams{
			ID:       jobID,
			Phase:    phase,
			Progress: progressJSON,
		})
		e.broadcastStatus(jobID, "running", phase, progress)
	}

	updateProgress := func() {
		progressJSON, _ := json.Marshal(progress)
		_ = e.queries.UpdateMigrationJobPhase(context.Background(), repository.UpdateMigrationJobPhaseParams{
			ID:       jobID,
			Phase:    "",
			Progress: progressJSON,
		})
		e.broadcastProgress(jobID, progress)
	}

	fail := func(err error) {
		_ = e.queries.UpdateMigrationJobStatus(context.Background(), repository.UpdateMigrationJobStatusParams{
			ID:     jobID,
			Status: "failed",
			Error:  err.Error(),
		})
		e.emitLog(jobID, "error", "", err.Error(), nil)
		e.broadcastStatus(jobID, "failed", "", progress)
	}

	setPhase("download_files")
	e.emitLog(jobID, "info", "download_files", "Starting file download from RocketChat...", nil)

	// Get all migrated rooms
	roomStates, err := e.queries.ListMigrationRoomStates(ctx)
	if err != nil {
		fail(fmt.Errorf("listing room states: %w", err))
		return
	}

	progress.RoomsTotal = len(roomStates)
	updateProgress()
	e.emitLog(jobID, "info", "download_files", fmt.Sprintf("Processing %d rooms for files...", len(roomStates)), nil)

	globalOldest := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	latest := time.Now()
	totalFiles := 0

	for i, rs := range roomStates {
		if ctx.Err() != nil {
			e.handleCancellation(jobID, progress)
			return
		}

		roomName := rs.RcRoomName
		if roomName == "" {
			roomName = rs.RcRoomID
		}

		e.emitLog(jobID, "info", "download_files", fmt.Sprintf("[%d/%d] Scanning %s for files...", i+1, len(roomStates), roomName), nil)

		roomCtx, roomCancel := context.WithTimeout(ctx, 10*time.Minute)
		msgs, err := rc.GetMessages(roomCtx, rs.RcRoomID, rs.RcRoomType, globalOldest, latest)
		roomCancel()
		if err != nil {
			e.emitLog(jobID, "warn", "download_files", fmt.Sprintf("Room %s: failed to fetch: %v", roomName, err), nil)
			progress.RoomsDone++
			updateProgress()
			continue
		}

		roomFiles := 0
		for _, msg := range msgs {
			if ctx.Err() != nil {
				e.handleCancellation(jobID, progress)
				return
			}

			if msg.File == nil || msg.File.ID == "" {
				continue
			}

			// Generate deterministic Glab message ID from RC message ID
			glabMsgID := DeterministicID("msg:" + msg.ID)

			// Check if file record already exists for this message
			pgMsgID := uuidToPgtype(glabMsgID)
			existing, _ := e.queries.ListFilesByMessage(ctx, pgMsgID)
			if len(existing) > 0 {
				continue // already migrated
			}

			// Also check the message exists in Glab
			_, msgErr := e.queries.GetMessageByID(ctx, pgMsgID)
			if msgErr != nil {
				continue // message not in DB (skipped during migration)
			}

			// Generate deterministic user/channel IDs
			glabUserID := DeterministicID("user:" + msg.User.ID)
			glabChannelID := DeterministicID("room:" + msg.RoomID)

			// Download file from RC
			fileURL := fmt.Sprintf("/file-upload/%s/%s", msg.File.ID, url.PathEscape(msg.File.Name))
			body, err := rc.DownloadFile(ctx, fileURL)
			if err != nil {
				e.emitLog(jobID, "warn", "download_files", fmt.Sprintf("Failed to download %s: %v", msg.File.Name, err), nil)
				continue
			}

			// Save to disk
			storagePath, err := saveFileToUploadDir(e.uploadDir, msg.File.Name, body)
			body.Close()
			if err != nil {
				e.emitLog(jobID, "warn", "download_files", fmt.Sprintf("Failed to save %s: %v", msg.File.Name, err), nil)
				continue
			}

			// Determine MIME type
			mimeType := msg.File.Type
			if mimeType == "" {
				mimeType = "application/octet-stream"
			}

			// Create file record
			_, err = e.queries.CreateFile(ctx, repository.CreateFileParams{
				MessageID:      pgMsgID,
				UserID:         uuidToPgtype(glabUserID),
				ChannelID:      uuidToPgtype(glabChannelID),
				Filename:       filepath.Base(storagePath),
				OriginalName:   msg.File.Name,
				MimeType:       mimeType,
				SizeBytes:      msg.File.Size,
				StoragePath:    storagePath,
				ThumbnailPath:  pgtype.Text{},
				StorageBackend: "local",
			})
			if err != nil {
				e.emitLog(jobID, "warn", "download_files", fmt.Sprintf("Failed to insert file record %s: %v", msg.File.Name, err), nil)
				continue
			}

			roomFiles++
			totalFiles++
		}

		if roomFiles > 0 {
			e.emitLog(jobID, "info", "download_files", fmt.Sprintf("[%d/%d] %s: downloaded %d files", i+1, len(roomStates), roomName, roomFiles), nil)
		}

		progress.RoomsDone++
		progress.Files = totalFiles
		updateProgress()
	}

	// Complete
	_ = e.queries.UpdateMigrationJobStatus(context.Background(), repository.UpdateMigrationJobStatusParams{
		ID:     jobID,
		Status: "completed",
		Error:  "",
	})

	summary := fmt.Sprintf("File migration complete: %d files downloaded across %d rooms", totalFiles, len(roomStates))
	e.emitLog(jobID, "info", "complete", summary, nil)
	e.broadcastStatus(jobID, "completed", "complete", progress)
}

// saveFileToUploadDir saves a file to the upload directory with a UUID-based filename.
func saveFileToUploadDir(uploadDir, originalName string, body io.ReadCloser) (string, error) {
	now := time.Now()
	dir := filepath.Join(uploadDir, now.Format("2006"), now.Format("01"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("creating dir: %w", err)
	}

	ext := filepath.Ext(originalName)
	filename := uuid.New().String() + ext
	absPath := filepath.Join(dir, filename)

	f, err := os.Create(absPath)
	if err != nil {
		return "", fmt.Errorf("creating file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		os.Remove(absPath)
		return "", fmt.Errorf("writing file: %w", err)
	}

	// Return relative path (YYYY/MM/uuid.ext) — not absolute
	relPath := filepath.Join(now.Format("2006"), now.Format("01"), filename)
	return relPath, nil
}

// uuidToPgtype converts a google/uuid.UUID to pgtype.UUID.
func uuidToPgtype(u uuid.UUID) pgtype.UUID {
	var pg pgtype.UUID
	copy(pg.Bytes[:], u[:])
	pg.Valid = true
	return pg
}

func (e *Engine) handleCancellation(jobID pgtype.UUID, progress *Progress) {
	_ = e.queries.UpdateMigrationJobStatus(context.Background(), repository.UpdateMigrationJobStatusParams{
		ID:     jobID,
		Status: "cancelled",
		Error:  "cancelled by admin",
	})
	e.emitLog(jobID, "info", "", "Migration cancelled by admin", nil)
	e.broadcastStatus(jobID, "cancelled", "", progress)
}

// emitLog inserts a log line into the DB and broadcasts to admin clients via WS.
func (e *Engine) emitLog(jobID pgtype.UUID, level, phase, message string, detail map[string]interface{}) {
	var detailJSON json.RawMessage
	if detail != nil {
		detailJSON, _ = json.Marshal(detail)
	}

	row, err := e.queries.CreateMigrationLog(context.Background(), repository.CreateMigrationLogParams{
		JobID:   jobID,
		Level:   level,
		Phase:   phase,
		Message: message,
		Detail:  detailJSON,
	})

	slog.Info("migration", "level", level, "phase", phase, "msg", message)

	if err != nil {
		return
	}

	// Broadcast to admin clients
	payload := map[string]interface{}{
		"id":         row.ID,
		"job_id":     uuidToString(jobID),
		"level":      level,
		"phase":      phase,
		"message":    message,
		"detail":     detail,
		"created_at": row.CreatedAt.Time.Format(time.RFC3339Nano),
	}

	env, err := ws.MakeEnvelope("migration.log", payload)
	if err != nil {
		return
	}
	e.hub.BroadcastToAdmins(env)
}

func (e *Engine) broadcastStatus(jobID pgtype.UUID, status, phase string, progress *Progress) {
	payload := map[string]interface{}{
		"job_id":   uuidToString(jobID),
		"status":   status,
		"phase":    phase,
		"progress": progress,
	}

	env, err := ws.MakeEnvelope("migration.status", payload)
	if err != nil {
		return
	}
	e.hub.BroadcastToAdmins(env)
}

func (e *Engine) broadcastProgress(jobID pgtype.UUID, progress *Progress) {
	payload := map[string]interface{}{
		"job_id":   uuidToString(jobID),
		"progress": progress,
	}

	env, err := ws.MakeEnvelope("migration.progress", payload)
	if err != nil {
		return
	}
	e.hub.BroadcastToAdmins(env)
}

// migrateCustomEmojis fetches custom emojis from RC, downloads images, and inserts into DB.
func (e *Engine) migrateCustomEmojis(ctx context.Context, rc *RCClient, loader *Loader, jobID pgtype.UUID, progress *Progress) error {
	emojis, err := rc.GetCustomEmojis(ctx)
	if err != nil {
		return fmt.Errorf("fetching custom emojis: %w", err)
	}

	if len(emojis) == 0 {
		e.emitLog(jobID, "info", "export_emojis", "No custom emojis found", nil)
		return nil
	}

	e.emitLog(jobID, "info", "export_emojis", fmt.Sprintf("Found %d custom emojis, downloading...", len(emojis)), nil)

	count := 0
	for _, emoji := range emojis {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		imgURL := rc.EmojiImageURL(emoji.Name, emoji.Extension)
		body, err := rc.DownloadFile(ctx, imgURL)
		if err != nil {
			e.emitLog(jobID, "warn", "export_emojis", fmt.Sprintf("Failed to download emoji %s: %v", emoji.Name, err), nil)
			continue
		}

		storagePath, err := loader.SaveEmojiFile(emoji.Name, emoji.Extension, body)
		body.Close()
		if err != nil {
			e.emitLog(jobID, "warn", "export_emojis", fmt.Sprintf("Failed to save emoji %s: %v", emoji.Name, err), nil)
			continue
		}

		mimeType := "image/png"
		switch emoji.Extension {
		case "jpg", "jpeg":
			mimeType = "image/jpeg"
		case "gif":
			mimeType = "image/gif"
		case "webp":
			mimeType = "image/webp"
		case "svg":
			mimeType = "image/svg+xml"
		}

		_, err = e.queries.UpsertCustomEmoji(ctx, repository.UpsertCustomEmojiParams{
			Name:        emoji.Name,
			Aliases:     emoji.Aliases,
			MimeType:    mimeType,
			StoragePath: storagePath,
		})
		if err != nil {
			e.emitLog(jobID, "warn", "export_emojis", fmt.Sprintf("Failed to insert emoji %s: %v", emoji.Name, err), nil)
			continue
		}

		count++
	}

	progress.Emojis = count
	e.emitLog(jobID, "info", "export_emojis", fmt.Sprintf("Imported %d custom emojis", count), nil)
	return nil
}

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}
