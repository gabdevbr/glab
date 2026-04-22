// Package rcbridge provides realtime bidirectional synchronization with a RocketChat server.
// Each Glab user gets their own DDP connection using their own RC credentials.
// The bridge is enabled/disabled via admin panel (app_config key "rc_bridge").
package rcbridge

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// Bridge orchestrates the RC realtime integration lifecycle.
type Bridge struct {
	cfg     atomic.Pointer[Config]
	cfgSvc  *ConfigService
	auth    atomic.Pointer[Authenticator]
	pool    *SessionPool
	mapper  *Mapper
	queries *repository.Queries
	hub     *ws.Hub
	encKey  string // base64 AES key for token encryption

	outboundCh chan OutboundEvent
	stopOnce   sync.Once
	stopped    atomic.Bool

	ctx    context.Context
	cancel context.CancelFunc
}

// New creates a Bridge. Call Start to begin the event loop.
// encKey is the base64-encoded AES-256 key for token encryption (may be empty in dev).
func New(cfgSvc *ConfigService, encKey string, queries *repository.Queries, hub *ws.Hub) *Bridge {
	return &Bridge{
		cfgSvc:     cfgSvc,
		encKey:     encKey,
		queries:    queries,
		hub:        hub,
		outboundCh: make(chan OutboundEvent, 256),
	}
}

// Start begins the bridge event loop (non-blocking).
func (b *Bridge) Start(ctx context.Context) error {
	cfg, err := b.cfgSvc.Load(ctx)
	if err != nil {
		return err
	}
	b.cfg.Store(&cfg)
	b.pool = newSessionPool(cfg.MaxConcurrentSessions)
	b.mapper = newMapper(b.queries)
	b.ctx, b.cancel = context.WithCancel(ctx)

	// Build the authenticator with the URL from config
	a, err := NewAuthenticator(cfg.URL, b.encKey, b.queries)
	if err != nil {
		return err
	}
	b.auth.Store(a)

	go b.processOutbound()

	slog.Info("rcbridge: bridge started", "enabled", cfg.Enabled, "url", cfg.URL)
	return nil
}

// Stop tears down all sessions and stops the event loop. Safe to call multiple times.
func (b *Bridge) Stop() {
	b.stopOnce.Do(func() {
		b.stopped.Store(true)
		if b.cancel != nil {
			b.cancel()
		}
		if b.pool != nil {
			b.pool.StopAll()
		}
		close(b.outboundCh)
		slog.Info("rcbridge: bridge stopped")
	})
}

// Enabled returns whether the bridge is currently configured as active.
func (b *Bridge) Enabled() bool {
	cfg := b.cfg.Load()
	return cfg != nil && cfg.Enabled
}

// Config returns the current config (may be nil before Start).
func (b *Bridge) Config() *Config {
	return b.cfg.Load()
}

// ReloadConfig reloads bridge config from DB. Call after admin saves settings.
func (b *Bridge) ReloadConfig(ctx context.Context) error {
	cfg, err := b.cfgSvc.Load(ctx)
	if err != nil {
		return err
	}
	b.cfg.Store(&cfg)
	if b.pool != nil {
		b.pool.maxSize = cfg.MaxConcurrentSessions
	}
	// Rebuild authenticator with possibly updated URL
	a, err := NewAuthenticator(cfg.URL, b.encKey, b.queries)
	if err == nil {
		b.auth.Store(a)
	}
	return nil
}

// AttachSession registers a new user session after login.
// This is called from the auth handler after delegated RC login succeeds.
func (b *Bridge) AttachSession(userID, rcUserID, rcToken string) {
	if !b.Enabled() {
		return
	}
	cfg := b.cfg.Load()
	s := newSession(userID, rcUserID, rcToken, cfg.URL, b)
	b.pool.Attach(b.ctx, s)
}

// Notify implements ws.BridgeNotifier. Forwards a Glab event to RC.
func (b *Bridge) Notify(channelID, userID string, env ws.Envelope) {
	if b.stopped.Load() || !b.Enabled() {
		return
	}
	cfg := b.cfg.Load()
	if !cfg.OutboundEnabled {
		return
	}
	select {
	case b.outboundCh <- OutboundEvent{
		Type:      env.Type,
		ChannelID: channelID,
		UserID:    userID,
		Payload:   env,
	}:
	default:
		slog.Warn("rcbridge: outbound channel full, dropping event", "type", env.Type)
	}
}

// Auth returns the Authenticator for delegated login flows.
func (b *Bridge) Auth() *Authenticator {
	return b.auth.Load()
}

// SessionCount returns the number of active user sessions.
func (b *Bridge) SessionCount() int {
	if b.pool == nil {
		return 0
	}
	return b.pool.Size()
}

// registerRoom upserts a RC room as a Glab channel and warms the mapper cache.
// createdByUserID is the Glab UUID of the user triggering the registration.
func (b *Bridge) registerRoom(ctx context.Context, rcRoomID, name, rcType, createdByUserID string) error {
	if name == "" {
		name = rcRoomID
	}
	base := strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	suffix := rcRoomID
	if len(suffix) > 6 {
		suffix = suffix[:6]
	}
	slug := base + "--" + suffix

	glabType := "public"
	switch rcType {
	case "p":
		glabType = "private"
	case "d":
		glabType = "dm"
	}

	creatorUUID, err := pgUUIDFromString(createdByUserID)
	if err != nil {
		return err
	}

	ch, err := b.queries.UpsertChannelByRCRoomID(ctx, repository.UpsertChannelByRCRoomIDParams{
		Name:      name,
		Slug:      slug,
		Type:      glabType,
		CreatedBy: creatorUUID,
		RcRoomID:  pgtype.Text{String: rcRoomID, Valid: true},
	})
	if err != nil {
		return err
	}
	b.mapper.RegisterRoom(ctx, rcRoomID, pgUUIDToString(ch.ID))
	return nil
}
