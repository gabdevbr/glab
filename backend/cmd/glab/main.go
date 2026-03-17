package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/geovendas/glab/backend/internal/ai"
	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/config"
	"github.com/geovendas/glab/backend/internal/db"
	"github.com/geovendas/glab/backend/internal/handler"
	"github.com/geovendas/glab/backend/internal/migration"
	"github.com/geovendas/glab/backend/internal/repository"
	"github.com/geovendas/glab/backend/internal/storage"
	"github.com/geovendas/glab/backend/internal/ws"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Run database migrations
	if err := runMigrations(cfg.DatabaseURL); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations completed successfully")

	// Connect to database
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("connected to database")

	// Connect to Redis
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("failed to parse redis URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Error("failed to connect to redis", "error", err)
		os.Exit(1)
	}
	slog.Info("connected to redis")

	// Create repository and handlers
	queries := repository.New(pool)

	// Seed admin user if no users exist
	seedAdminUser(ctx, queries)

	// Seed AI agents
	seedAgents(ctx, queries)

	// Storage config service + SwappableBackend
	storageCfgSvc := storage.NewStorageConfigService(queries)
	storageCfg, err := storageCfgSvc.Load(ctx)
	if err != nil {
		// On first boot (before migration 000008 runs), fall back to local.
		slog.Warn("could not load storage config from DB, using local default", "error", err)
		storageCfg = storage.StorageConfig{
			Backend: "local",
			Local:   storage.LocalStorageConfig{BaseDir: cfg.UploadDir},
		}
	}
	localBackend := storage.NewLocalBackend(cfg.UploadDir)
	if err := localBackend.EnsureDir(); err != nil {
		slog.Error("failed to create local storage directory", "error", err)
		os.Exit(1)
	}
	activeBackend, err := storage.BuildBackend(ctx, storageCfg)
	if err != nil {
		slog.Warn("failed to build configured storage backend, falling back to local", "error", err)
		activeBackend = localBackend
	}
	swappable := storage.NewSwappableBackend(activeBackend)
	storageSvc := storage.NewStorageService(swappable, localBackend)
	slog.Info("storage backend active", "type", swappable.Type())

	// AI config service
	aiCfgSvc := ai.NewGatewayConfigService(queries)

	// WebSocket hub (created early so handlers can reference it)
	hub := ws.NewHub()
	go hub.Run()

	authHandler := handler.NewAuthHandler(queries, cfg.JWTSecret, cfg.JWTExpiry)
	userHandler := handler.NewUserHandler(queries)
	channelHandler := handler.NewChannelHandler(queries)
	messageHandler := handler.NewMessageHandler(queries)
	agentHandler := handler.NewAgentHandler(queries)
	fileHandler := handler.NewFileHandler(queries, storageSvc, hub)
	searchHandler := handler.NewSearchHandler(queries)
	apiTokenHandler := handler.NewAPITokenHandler(queries, hub)
	emojiHandler := handler.NewEmojiHandler(queries, storageSvc)
	presenceService := ws.NewPresenceService(rdb, hub)
	wsHandler := ws.NewMessageHandler(hub, queries, presenceService, cfg.JWTSecret)

	// AI dispatcher
	bridge := ai.NewBridgeClient()
	dispatcher := ai.NewDispatcher(bridge, queries, hub)
	wsHandler.SetAIDispatcher(dispatcher)

	// Admin handler
	adminHandler := handler.NewAdminHandler(queries, presenceService)
	storageMigrator := storage.NewMigrator(queries, localBackend, swappable, hub)
	storageAdminHandler := handler.NewStorageAdminHandler(queries, storageCfgSvc, swappable, storageMigrator)
	aiAdminHandler := handler.NewAIAdminHandler(queries, aiCfgSvc)

	// Migration engine
	migrationEngine := migration.NewEngine(pool, queries, hub, cfg.UploadDir)
	migrationHandler := handler.NewMigrationHandler(migrationEngine, queries)


	// Setup router
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// WebSocket route (auth via query param, not middleware)
	r.Get("/ws", wsHandler.ServeWS)

	// Public routes
	r.Post("/api/v1/auth/login", authHandler.Login)
	r.Post("/api/v1/auth/logout", authHandler.Logout)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(cfg.JWTSecret, queries))

		// Auth
		r.Get("/api/v1/auth/me", authHandler.Me)

		// Users
		r.Get("/api/v1/users", userHandler.List)
		r.Get("/api/v1/users/{id}", userHandler.GetByID)
		r.Patch("/api/v1/users/{id}", userHandler.Update)

		// Channels
		r.Get("/api/v1/channels", channelHandler.List)
		r.Post("/api/v1/channels", channelHandler.Create)
		r.Get("/api/v1/channels/{id}", channelHandler.GetByID)
		r.Patch("/api/v1/channels/{id}", channelHandler.Update)
		r.Delete("/api/v1/channels/{id}", channelHandler.Delete)
		r.Post("/api/v1/channels/{id}/join", channelHandler.Join)
		r.Post("/api/v1/channels/{id}/leave", channelHandler.Leave)
		r.Post("/api/v1/channels/{id}/members", channelHandler.AddMember)
		r.Delete("/api/v1/channels/{id}/members/{uid}", channelHandler.RemoveMember)

		// Messages
		r.Get("/api/v1/channels/{id}/messages", messageHandler.ListChannelMessages)
		r.Post("/api/v1/channels/{id}/messages", apiTokenHandler.SendMessage)
		r.Get("/api/v1/channels/{id}/messages/pinned", messageHandler.ListPinnedMessages)
		r.Get("/api/v1/messages/{id}/thread", messageHandler.ListThreadMessages)

		// Files
		r.Post("/api/v1/channels/{id}/upload", fileHandler.Upload)
		r.Get("/api/v1/files/{id}", fileHandler.ServeFile)
		r.Get("/api/v1/files/{id}/thumbnail", fileHandler.ServeThumbnail)

		// Search
		r.Get("/api/v1/search", searchHandler.Search)

		// Custom emojis
		r.Get("/api/v1/emojis/custom", emojiHandler.List)
		r.Get("/api/v1/emojis/custom/{name}", emojiHandler.Serve)

		// Agents
		r.Get("/api/v1/agents", agentHandler.List)
		r.Get("/api/v1/agents/{slug}", agentHandler.GetBySlug)
		r.Get("/api/v1/agents/{slug}/sessions", agentHandler.ListSessions)
		r.Get("/api/v1/agents/{slug}/sessions/{id}/messages", agentHandler.GetSessionMessages)

		// API Tokens
		r.Get("/api/v1/tokens", apiTokenHandler.List)
		r.Post("/api/v1/tokens", apiTokenHandler.Create)
		r.Delete("/api/v1/tokens/{id}", apiTokenHandler.Revoke)

		// Admin — dashboard & management
		r.Get("/api/v1/admin/stats", adminHandler.Stats)
		r.Get("/api/v1/admin/users", adminHandler.ListUsers)
		r.Post("/api/v1/admin/users", adminHandler.CreateUser)
		r.Delete("/api/v1/admin/users/{id}", adminHandler.DeactivateUser)
		r.Patch("/api/v1/admin/users/{id}/role", adminHandler.ChangeRole)
		r.Post("/api/v1/admin/users/{id}/reset-password", adminHandler.ResetPassword)
		r.Get("/api/v1/admin/channels", adminHandler.ListChannels)

		// Admin — storage config
		r.Get("/api/v1/admin/storage/config", storageAdminHandler.GetConfig)
		r.Put("/api/v1/admin/storage/config", storageAdminHandler.PutConfig)
		r.Post("/api/v1/admin/storage/test", storageAdminHandler.TestConnection)
		r.Post("/api/v1/admin/storage/migrate", storageAdminHandler.StartMigration)
		r.Get("/api/v1/admin/storage/migrate/status", storageAdminHandler.MigrationStatus)
		r.Post("/api/v1/admin/storage/migrate/cancel", storageAdminHandler.CancelMigration)

		// Admin — AI gateway config
		r.Get("/api/v1/admin/ai/config", aiAdminHandler.GetConfig)
		r.Put("/api/v1/admin/ai/config", aiAdminHandler.PutConfig)
		r.Post("/api/v1/admin/ai/test", aiAdminHandler.TestConnection)

		// Admin — migration
		r.Post("/api/v1/admin/migration/start", migrationHandler.Start)
		r.Post("/api/v1/admin/migration/files", migrationHandler.MigrateFiles)
		r.Post("/api/v1/admin/migration/cancel", migrationHandler.Cancel)
		r.Get("/api/v1/admin/migration/status", migrationHandler.Status)
		r.Get("/api/v1/admin/migration/logs", migrationHandler.Logs)
		r.Get("/api/v1/admin/migration/jobs", migrationHandler.ListJobs)
		r.Get("/api/v1/admin/migration/rooms", migrationHandler.RoomStates)
	})

	// Start server
	addr := net.JoinHostPort("", strconv.Itoa(cfg.Port))
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-done
	slog.Info("shutting down server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown failed", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped gracefully")
}

func runMigrations(databaseURL string) error {
	m, err := migrate.New("file://migrations", "pgx5://"+databaseURL[len("postgres://"):])
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

// seedAdminUser creates an admin user if no users exist in the database.
func seedAdminUser(ctx context.Context, queries *repository.Queries) {
	// Check if admin user already exists
	_, err := queries.GetUserByUsername(ctx, "admin")
	if err == nil {
		// Admin already exists
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		slog.Error("failed to check for admin user", "error", err)
		return
	}

	// No admin found, create one
	hash, err := auth.HashPassword("admin123")
	if err != nil {
		slog.Error("failed to hash admin password", "error", err)
		return
	}

	_, err = queries.CreateUser(ctx, repository.CreateUserParams{
		Username:     "admin",
		Email:        "admin@glab.local",
		DisplayName:  "Admin",
		PasswordHash: hash,
		Role:         "admin",
		IsBot:        false,
		BotConfig:    json.RawMessage("null"),
	})
	if err != nil {
		slog.Error("failed to seed admin user", "error", err)
		return
	}

	slog.Info("admin user seeded", "username", "admin", "password", "admin123")
}

// seedAgents is a no-op. Agents are created and managed via the admin panel.
func seedAgents(_ context.Context, _ *repository.Queries) {}
