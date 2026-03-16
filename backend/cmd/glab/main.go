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

	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/config"
	"github.com/geovendas/glab/backend/internal/db"
	"github.com/geovendas/glab/backend/internal/handler"
	"github.com/geovendas/glab/backend/internal/repository"
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

	authHandler := handler.NewAuthHandler(queries, cfg.JWTSecret, cfg.JWTExpiry)
	userHandler := handler.NewUserHandler(queries)
	channelHandler := handler.NewChannelHandler(queries)
	messageHandler := handler.NewMessageHandler(queries)

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

	// Public routes
	r.Post("/api/v1/auth/login", authHandler.Login)
	r.Post("/api/v1/auth/logout", authHandler.Logout)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(cfg.JWTSecret))

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
		r.Get("/api/v1/channels/{id}/messages/pinned", messageHandler.ListPinnedMessages)
		r.Get("/api/v1/messages/{id}/thread", messageHandler.ListThreadMessages)
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
