package retention

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/repository"
)

type retentionConfig struct {
	DefaultDays int `json:"default_days"`
	MinimumDays int `json:"minimum_days"`
}

// StartRetentionJob starts a background goroutine that deletes expired messages.
func StartRetentionJob(queries *repository.Queries, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Run once immediately at startup
		runRetention(queries)

		for range ticker.C {
			runRetention(queries)
		}
	}()
	slog.Info("retention job started", "interval", interval.String())
}

func runRetention(queries *repository.Queries) {
	ctx := context.Background()

	// Load global config
	var cfg retentionConfig
	cfgRow, err := queries.GetAppConfig(ctx, "retention_policy")
	if err == nil {
		_ = json.Unmarshal(cfgRow.Value, &cfg)
	}

	if cfg.DefaultDays == 0 && cfg.MinimumDays == 0 {
		return // retention disabled globally
	}

	channels, err := queries.ListChannelsWithRetention(ctx)
	if err != nil {
		slog.Error("retention: failed to list channels", "error", err)
		return
	}

	totalDeleted := 0
	for _, ch := range channels {
		retDays := cfg.DefaultDays
		if ch.RetentionDays.Valid {
			retDays = int(ch.RetentionDays.Int32)
		}

		// 0 means never delete for this channel
		if retDays == 0 {
			continue
		}

		// Enforce minimum
		if cfg.MinimumDays > 0 && retDays < cfg.MinimumDays {
			retDays = cfg.MinimumDays
		}

		cutoff := time.Now().Add(-time.Duration(retDays) * 24 * time.Hour)
		cutoffTS := pgtype.Timestamptz{Time: cutoff, Valid: true}

		deleted, err := queries.DeleteExpiredMessages(ctx, repository.DeleteExpiredMessagesParams{
			ChannelID: ch.ID,
			Column2:   cutoffTS,
		})
		if err != nil {
			slog.Error("retention: delete failed", "channel_id", ch.ID, "error", err)
			continue
		}

		// Insert audit logs
		for _, msg := range deleted {
			_ = queries.InsertAuditLog(ctx, repository.InsertAuditLogParams{
				ChannelID:        msg.ChannelID,
				UserID:           msg.UserID,
				MessageCreatedAt: msg.CreatedAt,
				DeletedBy:        "retention",
			})
		}

		totalDeleted += len(deleted)
	}

	if totalDeleted > 0 {
		slog.Info("retention: deleted expired messages", "count", totalDeleted)
	}
}
