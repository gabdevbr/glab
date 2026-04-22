package rcbridge

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

const configKey = "rc_bridge"

// Config holds all RocketChat bridge configuration (stored as JSON in app_config).
type Config struct {
	Enabled            bool   `json:"enabled"`
	URL                string `json:"url"`
	LoginMode          string `json:"login_mode"`   // "delegated" | "local" | "dual"
	SyncScope          string `json:"sync_scope"`   // "all_user_rooms" | "allowlist"
	MaxConcurrentSessions int `json:"max_concurrent_sessions"`
	OutboundEnabled    bool   `json:"outbound_enabled"`
}

func defaultConfig() Config {
	return Config{
		Enabled:               false,
		URL:                   "https://chat.geovendas.com",
		LoginMode:             "dual",
		SyncScope:             "all_user_rooms",
		MaxConcurrentSessions: 500,
		OutboundEnabled:       true,
	}
}

// ConfigService loads and saves the bridge config from app_config.
type ConfigService struct {
	queries *repository.Queries
}

// NewConfigService creates a ConfigService.
func NewConfigService(q *repository.Queries) *ConfigService {
	return &ConfigService{queries: q}
}

// Load returns the current bridge config. Returns defaults on first-boot.
func (s *ConfigService) Load(ctx context.Context) (Config, error) {
	row, err := s.queries.GetAppConfig(ctx, configKey)
	if err != nil {
		return defaultConfig(), nil // first boot or missing key
	}
	var cfg Config
	if err := json.Unmarshal(row.Value, &cfg); err != nil {
		return defaultConfig(), fmt.Errorf("parsing rc bridge config: %w", err)
	}
	return cfg, nil
}

// Save persists the bridge config.
func (s *ConfigService) Save(ctx context.Context, cfg Config, updatedBy *pgtype.UUID) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshaling rc bridge config: %w", err)
	}
	var uid pgtype.UUID
	if updatedBy != nil {
		uid = *updatedBy
	}
	_, err = s.queries.UpsertAppConfig(ctx, repository.UpsertAppConfigParams{
		Key:       configKey,
		Value:     data,
		UpdatedBy: uid,
	})
	return err
}
