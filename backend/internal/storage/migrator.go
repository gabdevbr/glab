package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"

	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/ws"
)

const migrationPageSize int32 = 50

// MigrationProgress is broadcast over WebSocket during a migration.
type MigrationProgress struct {
	Running  bool   `json:"running"`
	Source   string `json:"source"`
	Dest     string `json:"dest"`
	Total    int64  `json:"total"`
	Migrated int64  `json:"migrated"`
	Failed   int64  `json:"failed"`
	Error    string `json:"error,omitempty"`
}

// Migrator copies files between storage backends non-destructively.
// The app continues serving files from whichever backend their
// storage_backend column indicates — no downtime required.
//
// Backends: the migrator resolves source/dest by type string:
//   - "local" always resolves to m.local
//   - "s3" resolves to m.nonLocal (the non-local backend, swapped in at runtime)
type Migrator struct {
	queries   *repository.Queries
	local     *LocalBackend  // always-available local backend
	nonLocal  StorageBackend // S3/remote backend (set when migration starts)
	hub       *ws.Hub

	mu      sync.Mutex
	running bool
	cancel  context.CancelFunc

	total    atomic.Int64
	migrated atomic.Int64
	failed   atomic.Int64
	srcType  string
	dstType  string
	lastErr  string
}

// NewMigrator creates a Migrator.
// nonLocal is the S3/remote backend used when source or dest is non-local.
// Pass nil if only local↔local migrations are needed (unsupported, but safe).
func NewMigrator(q *repository.Queries, local *LocalBackend, nonLocal StorageBackend, hub *ws.Hub) *Migrator {
	return &Migrator{queries: q, local: local, nonLocal: nonLocal, hub: hub}
}

// backendFor returns the backend matching the given type string.
func (m *Migrator) backendFor(t string) (StorageBackend, error) {
	if t == "local" {
		return m.local, nil
	}
	if m.nonLocal == nil {
		return nil, fmt.Errorf("no non-local backend configured for type %q", t)
	}
	return m.nonLocal, nil
}

// Start begins a background migration from source to dest backend type.
// Returns an error if a migration is already running.
func (m *Migrator) Start(ctx context.Context, source, dest string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("migration already in progress")
	}
	if source == dest {
		return fmt.Errorf("source and dest must be different")
	}

	m.running = true
	m.srcType = source
	m.dstType = dest
	m.lastErr = ""
	m.total.Store(0)
	m.migrated.Store(0)
	m.failed.Store(0)

	runCtx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel

	go m.run(runCtx, source, dest)
	return nil
}

// Cancel stops a running migration.
func (m *Migrator) Cancel() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
	}
}

// Status returns the current migration progress.
func (m *Migrator) Status() MigrationProgress {
	m.mu.Lock()
	running := m.running
	srcType := m.srcType
	dstType := m.dstType
	lastErr := m.lastErr
	m.mu.Unlock()

	return MigrationProgress{
		Running:  running,
		Source:   srcType,
		Dest:     dstType,
		Total:    m.total.Load(),
		Migrated: m.migrated.Load(),
		Failed:   m.failed.Load(),
		Error:    lastErr,
	}
}

func (m *Migrator) run(ctx context.Context, source, dest string) {
	defer func() {
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
		m.broadcast()
		slog.Info("storage migration finished",
			"source", source, "dest", dest,
			"migrated", m.migrated.Load(), "failed", m.failed.Load())
	}()

	srcBackend, err := m.backendFor(source)
	if err != nil {
		m.mu.Lock()
		m.lastErr = err.Error()
		m.mu.Unlock()
		return
	}
	dstBackend, err := m.backendFor(dest)
	if err != nil {
		m.mu.Lock()
		m.lastErr = err.Error()
		m.mu.Unlock()
		return
	}

	// Count total files to migrate.
	counts, err := m.queries.CountFilesByBackend(ctx)
	if err == nil {
		for _, c := range counts {
			if c.StorageBackend == source {
				m.total.Store(c.Count)
			}
		}
	}

	for {
		if ctx.Err() != nil {
			return
		}

		files, err := m.queries.ListFilesForStorageMigration(ctx, repository.ListFilesForStorageMigrationParams{
			StorageBackend: source,
			Limit:          migrationPageSize,
			Offset:         0,
		})
		if err != nil {
			m.mu.Lock()
			m.lastErr = err.Error()
			m.mu.Unlock()
			return
		}
		if len(files) == 0 {
			break
		}

		for _, file := range files {
			if ctx.Err() != nil {
				return
			}
			if err := m.migrateFile(ctx, file, srcBackend, dstBackend, dest); err != nil {
				slog.Warn("failed to migrate file", "id", file.ID, "error", err)
				m.failed.Add(1)
			} else {
				m.migrated.Add(1)
			}
			m.broadcast()
		}

		// Don't advance offset — migrated files no longer match the source filter.
		// The page always starts at offset 0 since migrated files are excluded.
	}
}

func (m *Migrator) migrateFile(ctx context.Context, file repository.File, src, dst StorageBackend, dstType string) error {
	if err := m.copyObject(ctx, src, dst, file.StoragePath, file.MimeType); err != nil {
		return fmt.Errorf("copying file: %w", err)
	}

	if file.ThumbnailPath.Valid && file.ThumbnailPath.String != "" {
		if err := m.copyObject(ctx, src, dst, file.ThumbnailPath.String, "image/jpeg"); err != nil {
			slog.Warn("failed to copy thumbnail", "key", file.ThumbnailPath.String, "error", err)
		}
	}

	return m.queries.UpdateFileStorageBackend(ctx, repository.UpdateFileStorageBackendParams{
		ID:             file.ID,
		StorageBackend: dstType,
	})
}

func (m *Migrator) copyObject(ctx context.Context, src, dst StorageBackend, key, contentType string) error {
	rc, err := src.Get(ctx, key)
	if err != nil {
		return fmt.Errorf("get from source: %w", err)
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil {
		return fmt.Errorf("reading source: %w", err)
	}

	return dst.Put(ctx, key, newBytesReader(data), contentType, int64(len(data)))
}

func (m *Migrator) broadcast() {
	if m.hub == nil {
		return
	}
	progress := m.Status()
	env, err := ws.MakeEnvelope("storage.migration.progress", progress)
	if err == nil {
		m.hub.BroadcastToAll(env)
	}
}

// bytesReader wraps a byte slice as an io.Reader without importing bytes.
type bytesReader struct{ data []byte; pos int }
func newBytesReader(data []byte) io.Reader { return &bytesReader{data: data} }
func (b *bytesReader) Read(p []byte) (n int, err error) {
	if b.pos >= len(b.data) { return 0, io.EOF }
	n = copy(p, b.data[b.pos:])
	b.pos += n
	return
}
