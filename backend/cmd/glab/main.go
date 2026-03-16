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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"

	"github.com/geovendas/glab/backend/internal/ai"
	"github.com/geovendas/glab/backend/internal/auth"
	"github.com/geovendas/glab/backend/internal/config"
	"github.com/geovendas/glab/backend/internal/db"
	"github.com/geovendas/glab/backend/internal/handler"
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

	// File storage service
	fileService := storage.NewFileService(cfg.UploadDir)
	if err := fileService.EnsureDir(); err != nil {
		slog.Error("failed to create upload directory", "error", err)
		os.Exit(1)
	}

	authHandler := handler.NewAuthHandler(queries, cfg.JWTSecret, cfg.JWTExpiry)
	userHandler := handler.NewUserHandler(queries)
	channelHandler := handler.NewChannelHandler(queries)
	messageHandler := handler.NewMessageHandler(queries)
	agentHandler := handler.NewAgentHandler(queries)
	fileHandler := handler.NewFileHandler(queries, fileService)
	searchHandler := handler.NewSearchHandler(queries)

	// WebSocket hub, presence service, and handler
	hub := ws.NewHub()
	go hub.Run()
	presenceService := ws.NewPresenceService(rdb, hub)
	wsHandler := ws.NewMessageHandler(hub, queries, presenceService, cfg.JWTSecret)

	// AI dispatcher
	bridge := ai.NewBridgeClient()
	dispatcher := ai.NewDispatcher(bridge, queries, hub)
	wsHandler.SetAIDispatcher(dispatcher)

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

		// Files
		r.Post("/api/v1/channels/{id}/upload", fileHandler.Upload)
		r.Get("/api/v1/files/{id}", fileHandler.ServeFile)
		r.Get("/api/v1/files/{id}/thumbnail", fileHandler.ServeThumbnail)

		// Search
		r.Get("/api/v1/search", searchHandler.Search)

		// Agents
		r.Get("/api/v1/agents", agentHandler.List)
		r.Get("/api/v1/agents/{slug}", agentHandler.GetBySlug)
		r.Get("/api/v1/agents/{slug}/sessions", agentHandler.ListSessions)
		r.Get("/api/v1/agents/{slug}/sessions/{id}/messages", agentHandler.GetSessionMessages)
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

// agentDef describes an agent to seed.
type agentDef struct {
	Slug         string
	Name         string
	Emoji        string
	Description  string
	SystemPrompt string
}

// seedAgents creates the predefined AI agents and their bot users.
func seedAgents(ctx context.Context, queries *repository.Queries) {
	agents := []agentDef{
		{
			Slug:         "max",
			Name:         "Max",
			Emoji:        "\U0001F457", // dress emoji
			Description:  "Especialista em Forca de Vendas Confeccao",
			SystemPrompt: "Voce e o Max, especialista em Forca de Vendas Confeccao da GEOvendas. Ajude os usuarios com duvidas sobre pedidos, catalogo e representantes.",
		},
		{
			Slug:         "trama",
			Name:         "Trama",
			Emoji:        "\U0001F9F5", // thread emoji
			Description:  "Especialista em Forca de Vendas Textil",
			SystemPrompt: "Voce e o Trama, especialista em Forca de Vendas Textil da GEOvendas. Ajude os usuarios com duvidas sobre pedidos texteis, amostras e representantes.",
		},
		{
			Slug:         "lytis",
			Name:         "Lytis",
			Emoji:        "\U0001F4CA", // bar chart emoji
			Description:  "Especialista em Analytics",
			SystemPrompt: "Voce e o Lytis, especialista em Analytics da GEOvendas. Ajude os usuarios a interpretar dados, dashboards e metricas de negocio.",
		},
		{
			Slug:         "pilar",
			Name:         "Pilar",
			Emoji:        "\U0001F3DB", // classical building emoji
			Description:  "Especialista em CRM/CRM360",
			SystemPrompt: "Voce e o Pilar, especialista em CRM e CRM360 da GEOvendas. Ajude os usuarios com gestao de clientes, pipeline e relacionamento.",
		},
		{
			Slug:         "lumina",
			Name:         "Lumina",
			Emoji:        "\U0001F4A1", // light bulb emoji
			Description:  "Especialista em Estoque",
			SystemPrompt: "Voce e a Lumina, especialista em Estoque da GEOvendas. Ajude os usuarios com consultas de estoque, disponibilidade e reposicao.",
		},
		{
			Slug:         "geobarsa",
			Name:         "GeoBarsa",
			Emoji:        "\U0001F4DA", // books emoji
			Description:  "Base de Conhecimento GEOdocs",
			SystemPrompt: "Voce e o GeoBarsa, a base de conhecimento da GEOvendas. Ajude os usuarios a encontrar documentacao, tutoriais e procedimentos internos.",
		},
		{
			Slug:         "batecerto",
			Name:         "BateCerto",
			Emoji:        "\U0001F3AF", // target emoji
			Description:  "Especialista em ERP",
			SystemPrompt: "Voce e o BateCerto, especialista em ERP da GEOvendas. Ajude os usuarios com duvidas sobre processos do ERP, notas fiscais e integracoes.",
		},
		{
			Slug:         "geolens",
			Name:         "GeoLens",
			Emoji:        "\U0001F916", // robot emoji
			Description:  "Assistente geral",
			SystemPrompt: "Voce e o GeoLens, o assistente geral da GEOvendas. Ajude os usuarios com qualquer duvida sobre os produtos e servicos da empresa.",
		},
	}

	const gatewayURL = "http://192.168.37.206:18789"
	const gatewayToken = "378823229f2009edb62c87bcb8a00a3339cfdd58a646bc35"
	const model = "anthropic/claude-sonnet-4-6"

	for _, def := range agents {
		// Check if agent already exists
		_, err := queries.GetAgentBySlug(ctx, def.Slug)
		if err == nil {
			continue // already exists
		}

		// Create bot user
		hash, err := auth.HashPassword("bot-" + def.Slug + "-no-login")
		if err != nil {
			slog.Error("failed to hash bot password", "slug", def.Slug, "error", err)
			continue
		}

		botUser, err := queries.CreateUser(ctx, repository.CreateUserParams{
			Username:     def.Slug,
			Email:        def.Slug + "@agent.glab.local",
			DisplayName:  def.Name,
			PasswordHash: hash,
			Role:         "agent",
			IsBot:        true,
			BotConfig:    json.RawMessage("null"),
		})
		if err != nil {
			slog.Error("failed to create bot user", "slug", def.Slug, "error", err)
			continue
		}

		// Create agent record
		_, err = queries.CreateAgent(ctx, repository.CreateAgentParams{
			UserID:             botUser.ID,
			Slug:               def.Slug,
			Name:               def.Name,
			Emoji:              pgtype.Text{String: def.Emoji, Valid: true},
			Description:        pgtype.Text{String: def.Description, Valid: true},
			Scope:              pgtype.Text{String: "general", Valid: true},
			Status:             "active",
			GatewayUrl:         gatewayURL,
			GatewayToken:       pgtype.Text{String: gatewayToken, Valid: true},
			Model:              model,
			SystemPrompt:       pgtype.Text{String: def.SystemPrompt, Valid: true},
			MaxTokens:          4096,
			Temperature:        0.7,
			MaxContextMessages: 20,
		})
		if err != nil {
			slog.Error("failed to create agent", "slug", def.Slug, "error", err)
			continue
		}

		slog.Info("agent seeded", "slug", def.Slug, "name", def.Name)
	}
}
