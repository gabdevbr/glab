package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

const configKeyAI = "ai_gateway"

// GatewayConfig holds AI gateway configuration stored in app_config.
type GatewayConfig struct {
	URL          string `json:"url"`
	Token        string `json:"token"`
	DefaultModel string `json:"default_model"`
}

// GatewayConfigService loads and saves AI gateway configuration.
type GatewayConfigService struct {
	queries *repository.Queries
}

// NewGatewayConfigService creates a GatewayConfigService.
func NewGatewayConfigService(q *repository.Queries) *GatewayConfigService {
	return &GatewayConfigService{queries: q}
}

// Load returns the current AI gateway config from the database.
func (s *GatewayConfigService) Load(ctx context.Context) (GatewayConfig, error) {
	row, err := s.queries.GetAppConfig(ctx, configKeyAI)
	if err != nil {
		return GatewayConfig{}, fmt.Errorf("loading ai config: %w", err)
	}
	var cfg GatewayConfig
	if err := json.Unmarshal(row.Value, &cfg); err != nil {
		return GatewayConfig{}, fmt.Errorf("parsing ai config: %w", err)
	}
	return cfg, nil
}

// Save persists the AI gateway config to the database.
func (s *GatewayConfigService) Save(ctx context.Context, cfg GatewayConfig, updatedBy *pgtype.UUID) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshaling ai config: %w", err)
	}
	var userID pgtype.UUID
	if updatedBy != nil {
		userID = *updatedBy
	}
	_, err = s.queries.UpsertAppConfig(ctx, repository.UpsertAppConfigParams{
		Key:       configKeyAI,
		Value:     data,
		UpdatedBy: userID,
	})
	return err
}

// TestConnection sends a lightweight request to verify the gateway is reachable.
func (s *GatewayConfigService) TestConnection(ctx context.Context, cfg GatewayConfig) error {
	if cfg.URL == "" {
		return fmt.Errorf("gateway URL is not configured")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL+"/health", nil)
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("gateway unreachable: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode >= 500 {
		return fmt.Errorf("gateway returned HTTP %d", resp.StatusCode)
	}
	return nil
}
