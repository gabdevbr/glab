package storage

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

const configKeyStorage = "storage"

// LocalStorageConfig holds local filesystem backend settings.
type LocalStorageConfig struct {
	BaseDir string `json:"base_dir"`
}

// S3StorageConfig holds S3-compatible backend settings.
type S3StorageConfig struct {
	Endpoint        string `json:"endpoint"`
	Region          string `json:"region"`
	Bucket          string `json:"bucket"`
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	KeyPrefix       string `json:"key_prefix"`
	ForcePathStyle  bool   `json:"force_path_style"`
}

// StorageConfig is the top-level storage configuration stored in app_config.
type StorageConfig struct {
	Backend string             `json:"backend"` // "local" or "s3"
	Local   LocalStorageConfig `json:"local"`
	S3      S3StorageConfig    `json:"s3"`
}

// StorageConfigService loads and saves storage configuration from the app_config table.
type StorageConfigService struct {
	queries *repository.Queries
}

// NewStorageConfigService creates a StorageConfigService.
func NewStorageConfigService(q *repository.Queries) *StorageConfigService {
	return &StorageConfigService{queries: q}
}

// Load returns the current storage config from the database.
func (s *StorageConfigService) Load(ctx context.Context) (StorageConfig, error) {
	row, err := s.queries.GetAppConfig(ctx, configKeyStorage)
	if err != nil {
		return StorageConfig{}, fmt.Errorf("loading storage config: %w", err)
	}

	var cfg StorageConfig
	if err := json.Unmarshal(row.Value, &cfg); err != nil {
		return StorageConfig{}, fmt.Errorf("parsing storage config: %w", err)
	}
	return cfg, nil
}

// Save persists the storage config to the database.
func (s *StorageConfigService) Save(ctx context.Context, cfg StorageConfig, updatedBy *pgtype.UUID) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshaling storage config: %w", err)
	}

	var userID pgtype.UUID
	if updatedBy != nil {
		userID = *updatedBy
	}

	_, err = s.queries.UpsertAppConfig(ctx, repository.UpsertAppConfigParams{
		Key:       configKeyStorage,
		Value:     data,
		UpdatedBy: userID,
	})
	return err
}

// BuildBackend creates the appropriate StorageBackend from the given config.
func BuildBackend(ctx context.Context, cfg StorageConfig) (StorageBackend, error) {
	switch cfg.Backend {
	case "s3":
		return NewS3Backend(ctx, S3Config{
			Endpoint:        cfg.S3.Endpoint,
			Region:          cfg.S3.Region,
			Bucket:          cfg.S3.Bucket,
			AccessKeyID:     cfg.S3.AccessKeyID,
			SecretAccessKey: cfg.S3.SecretAccessKey,
			KeyPrefix:       cfg.S3.KeyPrefix,
			ForcePathStyle:  cfg.S3.ForcePathStyle,
		})
	case "local", "":
		baseDir := cfg.Local.BaseDir
		if baseDir == "" {
			baseDir = "./uploads"
		}
		b := NewLocalBackend(baseDir)
		if err := b.EnsureDir(); err != nil {
			return nil, fmt.Errorf("local backend init: %w", err)
		}
		return b, nil
	default:
		return nil, fmt.Errorf("unknown storage backend: %q", cfg.Backend)
	}
}
