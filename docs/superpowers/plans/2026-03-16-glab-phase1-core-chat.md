# Glab Phase 1: Core Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete core chat infrastructure — Go backend with WebSocket, PostgreSQL, Redis, Next.js frontend with real-time messaging, presence, and typing indicators. This is the foundation all other phases build on.

**Architecture:** Go monolith (chi router + gorilla/websocket + pgx/sqlc) serving REST + WS. Next.js 15 App Router frontend with Zustand state and native WebSocket. PostgreSQL for persistence, Redis for ephemeral state (presence, typing). Docker Compose for local dev and production.

**Tech Stack:** Go 1.22, PostgreSQL 16, Redis 7, Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Docker

---

## File Structure

### Backend (Go)

```
backend/
├── cmd/glab/main.go                          # Entry point: load config, connect DB/Redis, start server
├── go.mod / go.sum
├── Dockerfile
├── sqlc.yaml                                  # sqlc configuration
├── internal/
│   ├── config/config.go                       # Env parsing via caarlos0/env
│   ├── db/db.go                               # pgx pool creation
│   ├── models/                                # Domain structs (hand-written, sqlc generates repo)
│   │   ├── user.go
│   │   ├── channel.go
│   │   └── message.go
│   ├── repository/                            # sqlc-generated + query SQL files
│   │   ├── queries/
│   │   │   ├── users.sql
│   │   │   ├── channels.sql
│   │   │   ├── channel_members.sql
│   │   │   ├── messages.sql
│   │   │   ├── reactions.sql
│   │   │   ├── mentions.sql
│   │   │   └── files.sql
│   │   ├── db.go                              # Generated: DBTX interface
│   │   ├── models.go                          # Generated: DB model structs
│   │   └── *.sql.go                           # Generated: query functions
│   ├── auth/
│   │   ├── jwt.go                             # Token generation + validation
│   │   ├── password.go                        # bcrypt hash + compare
│   │   └── middleware.go                      # chi middleware: extract JWT, set user in context
│   ├── handler/
│   │   ├── auth.go                            # POST /login, /logout, GET /me
│   │   ├── user.go                            # GET /users, /users/:id, PATCH /users/:id
│   │   ├── channel.go                         # CRUD + join/leave/members
│   │   └── message.go                         # GET /channels/:id/messages, /messages/:id/thread
│   ├── ws/
│   │   ├── protocol.go                        # Envelope type, all event type constants, marshal/unmarshal
│   │   ├── hub.go                             # Hub: register/unregister clients, subscribe/unsubscribe, broadcast
│   │   ├── client.go                          # Client: read pump, write pump, per-client state
│   │   ├── handler.go                         # HTTP upgrade handler (GET /ws?token=)
│   │   └── presence.go                        # Redis-backed presence + typing ephemeral state
│   └── middleware/
│       └── cors.go                            # CORS for dev
├── migrations/
│   ├── 000001_init_schema.up.sql              # All 11 tables + indexes + triggers
│   └── 000001_init_schema.down.sql            # Drop all
```

### Frontend (Next.js 15)

```
frontend/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── Dockerfile
├── src/
│   ├── app/
│   │   ├── layout.tsx                         # Root layout (providers, fonts)
│   │   ├── (auth)/
│   │   │   └── login/page.tsx                 # Login form
│   │   └── (chat)/
│   │       ├── layout.tsx                     # Sidebar + main area + right panel
│   │       ├── page.tsx                       # Redirect to first channel
│   │       └── channel/[id]/page.tsx          # Channel chat view
│   ├── components/
│   │   ├── ui/                                # shadcn/ui components (auto-generated)
│   │   ├── chat/
│   │   │   ├── MessageList.tsx                # Virtual-scrolled message list
│   │   │   ├── MessageItem.tsx                # Single message render
│   │   │   ├── MessageInput.tsx               # Input with @mention autocomplete
│   │   │   └── TypingIndicator.tsx            # "X is typing..." display
│   │   └── sidebar/
│   │       ├── Sidebar.tsx                    # Full sidebar container
│   │       ├── ChannelList.tsx                # Channel list with unread badges
│   │       └── DMList.tsx                     # DM list with presence dots
│   ├── hooks/
│   │   ├── useWebSocket.ts                    # WS connection lifecycle hook
│   │   └── usePresence.ts                     # Presence subscription hook
│   ├── lib/
│   │   ├── ws.ts                              # WS client singleton + reconnection + event dispatch
│   │   ├── api.ts                             # REST client (fetch wrapper with JWT)
│   │   └── types.ts                           # Shared TypeScript types matching backend protocol
│   └── stores/
│       ├── authStore.ts                       # User session, JWT token
│       ├── channelStore.ts                    # Channels, active channel, members
│       ├── messageStore.ts                    # Messages per channel (Map), optimistic updates
│       └── presenceStore.ts                   # Online/away/offline status per user, typing state
```

### Infrastructure

```
glab/
├── docker-compose.yml                         # Production: api, web, postgres, redis, nginx
├── docker-compose.dev.yml                     # Dev overrides: hot reload, exposed ports
├── Makefile                                   # Common commands: dev, build, migrate, sqlc
├── .env.example                               # All required env vars documented
└── nginx/
    └── glab.conf                              # SSL, WS upgrade, proxy, file serving
```

---

## Chunk 1: Project Scaffolding & Infrastructure

### Task 1: Initialize Go Backend Project

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/glab/main.go`
- Create: `backend/internal/config/config.go`
- Create: `backend/internal/db/db.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd /Users/gab/repo/glab/backend
go mod init github.com/geovendas/glab/backend
```

- [ ] **Step 2: Create config package**

Create `backend/internal/config/config.go`:
```go
package config

import (
	"fmt"
	"github.com/caarlos0/env/v11"
)

type Config struct {
	Port        int    `env:"PORT" envDefault:"8080"`
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL" envDefault:"redis://localhost:6379"`
	JWTSecret   string `env:"JWT_SECRET,required"`
	JWTExpiry   int    `env:"JWT_EXPIRY" envDefault:"604800"` // 7 days in seconds
	UploadDir   string `env:"UPLOAD_DIR" envDefault:"./uploads"`
	CORSOrigin  string `env:"CORS_ORIGIN" envDefault:"http://localhost:3000"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	return cfg, nil
}
```

- [ ] **Step 3: Create database connection package**

Create `backend/internal/db/db.go`:
```go
package db

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}
	config.MaxConns = 20
	config.MinConns = 5

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("creating pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}
	return pool, nil
}
```

- [ ] **Step 4: Create main entry point**

Create `backend/cmd/glab/main.go` — a minimal server that loads config, connects DB and Redis, sets up chi router with health check, and starts listening.

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/gab/repo/glab/backend
go get github.com/go-chi/chi/v5
go get github.com/go-chi/cors
go get github.com/jackc/pgx/v5
go get github.com/redis/go-redis/v9
go get github.com/caarlos0/env/v11
go get github.com/golang-jwt/jwt/v5
go get github.com/gorilla/websocket
go get golang.org/x/crypto
go get github.com/golang-migrate/migrate/v4
go mod tidy
```

- [ ] **Step 6: Verify compilation**

```bash
cd /Users/gab/repo/glab/backend && go build ./...
```

---

### Task 2: Database Migrations (All 11 Tables)

**Files:**
- Create: `backend/migrations/000001_init_schema.up.sql`
- Create: `backend/migrations/000001_init_schema.down.sql`

- [ ] **Step 1: Write the UP migration**

Create `backend/migrations/000001_init_schema.up.sql` with all 11 tables, indexes, and triggers:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(50)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    avatar_url  TEXT,
    password_hash TEXT NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'agent')),
    status      VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline', 'dnd')),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_bot      BOOLEAN NOT NULL DEFAULT FALSE,
    bot_config  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHANNELS
-- ============================================================
CREATE TABLE channels (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    type        VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
    topic       TEXT,
    created_by  UUID NOT NULL REFERENCES users(id),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHANNEL MEMBERS
-- ============================================================
CREATE TABLE channel_members (
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_msg_id UUID,
    muted           BOOLEAN NOT NULL DEFAULT FALSE,
    notifications   VARCHAR(20) NOT NULL DEFAULT 'default' CHECK (notifications IN ('default', 'all', 'mentions', 'none')),
    PRIMARY KEY (channel_id, user_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id),
    thread_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    content       TEXT NOT NULL,
    content_type  VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'file', 'system')),
    edited_at     TIMESTAMPTZ,
    is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata      JSONB,
    search_vector TSVECTOR,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update search_vector on insert/update (PT-BR)
CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('portuguese', unaccent(coalesce(NEW.content, '')));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_search_vector_trigger
    BEFORE INSERT OR UPDATE OF content ON messages
    FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();

-- ============================================================
-- REACTIONS
-- ============================================================
CREATE TABLE reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);

-- ============================================================
-- FILES
-- ============================================================
CREATE TABLE files (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    user_id        UUID NOT NULL REFERENCES users(id),
    channel_id     UUID NOT NULL REFERENCES channels(id),
    filename       VARCHAR(255) NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(100) NOT NULL,
    size_bytes     BIGINT NOT NULL,
    storage_path   TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MENTIONS
-- ============================================================
CREATE TABLE mentions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- THREAD SUMMARIES
-- ============================================================
CREATE TABLE thread_summaries (
    message_id      UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    reply_count     INTEGER NOT NULL DEFAULT 0,
    last_reply_at   TIMESTAMPTZ,
    participant_ids UUID[] NOT NULL DEFAULT '{}'
);

-- ============================================================
-- AGENTS
-- ============================================================
CREATE TABLE agents (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID UNIQUE REFERENCES users(id),
    slug                 VARCHAR(50) NOT NULL UNIQUE,
    name                 VARCHAR(100) NOT NULL,
    emoji                VARCHAR(10),
    avatar_url           TEXT,
    description          TEXT,
    scope                TEXT,
    status               VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    gateway_url          TEXT NOT NULL DEFAULT 'http://192.168.37.206:18789',
    gateway_token        TEXT,
    model                VARCHAR(100) NOT NULL DEFAULT 'anthropic/claude-sonnet-4-6',
    system_prompt        TEXT,
    max_tokens           INTEGER NOT NULL DEFAULT 4096,
    temperature          REAL NOT NULL DEFAULT 0.7,
    bridge_url           TEXT,
    use_bridge           BOOLEAN NOT NULL DEFAULT FALSE,
    max_context_messages INTEGER NOT NULL DEFAULT 20,
    auto_join_channels   TEXT[],
    capabilities         JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AGENT SESSIONS
-- ============================================================
CREATE TABLE agent_sessions (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title     VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AGENT USAGE
-- ============================================================
CREATE TABLE agent_usage (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES agents(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    channel_id      UUID,
    session_id      UUID REFERENCES agent_sessions(id),
    message_id      UUID REFERENCES messages(id),
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
    response_time_ms INTEGER NOT NULL DEFAULT 0,
    model_used      VARCHAR(100),
    source          VARCHAR(30) CHECK (source IN ('channel_mention', 'panel_chat')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_messages_channel_created ON messages (channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_messages_search ON messages USING GIN (search_vector);
CREATE INDEX idx_mentions_user_unread ON mentions (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_agent_usage_agent ON agent_usage (agent_id, created_at);
CREATE INDEX idx_channel_members_user ON channel_members (user_id);
CREATE INDEX idx_files_message ON files (message_id);
CREATE INDEX idx_files_channel ON files (channel_id);
CREATE INDEX idx_agent_sessions_agent_user ON agent_sessions (agent_id, user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agent_sessions_updated_at BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Write the DOWN migration**

Create `backend/migrations/000001_init_schema.down.sql`:
```sql
DROP TABLE IF EXISTS agent_usage CASCADE;
DROP TABLE IF EXISTS agent_sessions CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS thread_summaries CASCADE;
DROP TABLE IF EXISTS mentions CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS channel_members CASCADE;
DROP TABLE IF EXISTS channels CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS messages_search_vector_update();
DROP FUNCTION IF EXISTS update_updated_at();
```

- [ ] **Step 3: Create migration runner in main.go**

Add migration logic to `cmd/glab/main.go` using golang-migrate with pgx driver. Run migrations on startup with `m.Up()`.

---

### Task 3: sqlc Setup & Query Files

**Files:**
- Create: `backend/sqlc.yaml`
- Create: `backend/internal/repository/queries/users.sql`
- Create: `backend/internal/repository/queries/channels.sql`
- Create: `backend/internal/repository/queries/channel_members.sql`
- Create: `backend/internal/repository/queries/messages.sql`

- [ ] **Step 1: Create sqlc config**

Create `backend/sqlc.yaml`:
```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/repository/queries"
    schema: "migrations"
    gen:
      go:
        package: "repository"
        out: "internal/repository"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
        overrides:
          - db_type: "uuid"
            go_type: "github.com/jackc/pgx/v5/pgtype.UUID"
          - db_type: "timestamptz"
            go_type: "github.com/jackc/pgx/v5/pgtype.Timestamptz"
          - db_type: "jsonb"
            nullable: true
            go_type: "[]byte"
```

- [ ] **Step 2: Write user queries**

Create `backend/internal/repository/queries/users.sql`:
```sql
-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: ListUsers :many
SELECT id, username, email, display_name, avatar_url, role, status, last_seen, is_bot
FROM users ORDER BY display_name LIMIT $1 OFFSET $2;

-- name: CreateUser :one
INSERT INTO users (username, email, display_name, password_hash, role, is_bot, bot_config)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: UpdateUser :one
UPDATE users SET
    display_name = coalesce(sqlc.narg('display_name'), display_name),
    avatar_url = coalesce(sqlc.narg('avatar_url'), avatar_url),
    status = coalesce(sqlc.narg('status'), status),
    email = coalesce(sqlc.narg('email'), email)
WHERE id = $1 RETURNING *;

-- name: UpdateUserStatus :exec
UPDATE users SET status = $2, last_seen = NOW() WHERE id = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;
```

- [ ] **Step 3: Write channel queries**

Create `backend/internal/repository/queries/channels.sql`:
```sql
-- name: GetChannelByID :one
SELECT * FROM channels WHERE id = $1;

-- name: GetChannelBySlug :one
SELECT * FROM channels WHERE slug = $1;

-- name: ListChannelsForUser :many
SELECT c.* FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1 AND c.is_archived = FALSE
ORDER BY c.name;

-- name: ListPublicChannels :many
SELECT * FROM channels WHERE type = 'public' AND is_archived = FALSE ORDER BY name;

-- name: CreateChannel :one
INSERT INTO channels (name, slug, description, type, topic, created_by)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: UpdateChannel :one
UPDATE channels SET
    name = coalesce(sqlc.narg('name'), name),
    description = coalesce(sqlc.narg('description'), description),
    topic = coalesce(sqlc.narg('topic'), topic),
    is_archived = coalesce(sqlc.narg('is_archived'), is_archived)
WHERE id = $1 RETURNING *;

-- name: DeleteChannel :exec
DELETE FROM channels WHERE id = $1;

-- name: GetDMChannel :one
SELECT c.* FROM channels c
JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.user_id = $1
JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id = $2
WHERE c.type = 'dm';
```

- [ ] **Step 4: Write channel member queries**

Create `backend/internal/repository/queries/channel_members.sql`:
```sql
-- name: AddChannelMember :exec
INSERT INTO channel_members (channel_id, user_id, role)
VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: RemoveChannelMember :exec
DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2;

-- name: GetChannelMembers :many
SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.is_bot, cm.role, cm.joined_at
FROM channel_members cm
JOIN users u ON u.id = cm.user_id
WHERE cm.channel_id = $1
ORDER BY u.display_name;

-- name: IsChannelMember :one
SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2);

-- name: UpdateLastRead :exec
UPDATE channel_members SET last_read_msg_id = $3 WHERE channel_id = $1 AND user_id = $2;

-- name: GetUnreadCount :one
SELECT COUNT(*) FROM messages m
JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
WHERE m.channel_id = $1
  AND (cm.last_read_msg_id IS NULL OR m.created_at > (SELECT created_at FROM messages WHERE id = cm.last_read_msg_id));

-- name: GetChannelMember :one
SELECT * FROM channel_members WHERE channel_id = $1 AND user_id = $2;
```

- [ ] **Step 5: Write message queries**

Create `backend/internal/repository/queries/messages.sql`:
```sql
-- name: CreateMessage :one
INSERT INTO messages (channel_id, user_id, thread_id, content, content_type, metadata)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: GetMessageByID :one
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.id = $1;

-- name: ListChannelMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.thread_id IS NULL
ORDER BY m.created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListThreadMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.thread_id = $1
ORDER BY m.created_at ASC;

-- name: UpdateMessageContent :one
UPDATE messages SET content = $2, edited_at = NOW() WHERE id = $1 RETURNING *;

-- name: DeleteMessage :exec
DELETE FROM messages WHERE id = $1;

-- name: PinMessage :exec
UPDATE messages SET is_pinned = TRUE WHERE id = $1;

-- name: UnpinMessage :exec
UPDATE messages SET is_pinned = FALSE WHERE id = $1;

-- name: ListPinnedMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.is_pinned = TRUE
ORDER BY m.created_at DESC;

-- name: SearchMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot,
       ts_rank(m.search_vector, websearch_to_tsquery('portuguese', unaccent($1))) AS rank
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.search_vector @@ websearch_to_tsquery('portuguese', unaccent($1))
  AND ($2::uuid IS NULL OR m.channel_id = $2)
ORDER BY rank DESC
LIMIT $3 OFFSET $4;

-- name: GetMessagesSince :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.created_at > $2
ORDER BY m.created_at ASC;
```

- [ ] **Step 6: Install sqlc and generate code**

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
cd /Users/gab/repo/glab/backend && sqlc generate
```

- [ ] **Step 7: Verify generated code compiles**

```bash
cd /Users/gab/repo/glab/backend && go build ./...
```

---

### Task 4: Docker Compose & Dev Infrastructure

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `.env.example`
- Create: `Makefile`
- Create: `nginx/glab.conf`

- [ ] **Step 1: Create .env.example**

```env
# Database
DATABASE_URL=postgres://glab:glab@localhost:5432/glab?sslmode=disable
POSTGRES_USER=glab
POSTGRES_PASSWORD=glab
POSTGRES_DB=glab

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change-me-to-a-secure-random-string-at-least-32-chars

# API
PORT=8080
CORS_ORIGIN=http://localhost:3000

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080

# Files
UPLOAD_DIR=./uploads
```

- [ ] **Step 2: Create docker-compose.yml**

Production compose with 5 services: glab-api, glab-web, postgres, redis, nginx. Volumes for pgdata, redis-data, uploads. External ibtech network. Nginx serves on 443/80.

- [ ] **Step 3: Create docker-compose.dev.yml**

Dev overrides: only postgres + redis services. Exposes postgres:5432, redis:6379. Backend and frontend run on host for hot reload.

- [ ] **Step 4: Create Makefile**

Targets: `dev` (start dev compose + backend + frontend), `migrate-up`, `migrate-down`, `migrate-create`, `sqlc`, `build`, `docker-build`, `docker-up`, `docker-down`.

- [ ] **Step 5: Create nginx config**

Create `nginx/glab.conf` with:
- SSL termination (self-signed for now)
- Proxy `/api/` → `glab-api:8080`
- Proxy `/ws` → `glab-api:8080` with WebSocket upgrade headers (24h timeout)
- Proxy `/` → `glab-web:3000`
- File serving via `/files/` with auth subrequest

- [ ] **Step 6: Create backend Dockerfile**

Multi-stage: Go build → scratch/alpine runtime. Copy binary + migrations.

- [ ] **Step 7: Create frontend Dockerfile**

Multi-stage: Node build → Node runtime. `next build` → `next start`.

- [ ] **Step 8: Verify dev infrastructure boots**

```bash
cd /Users/gab/repo/glab && cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
# Verify postgres and redis are reachable
```

---

## Chunk 2: Authentication & REST API

### Task 5: Auth Package (JWT + bcrypt)

**Files:**
- Create: `backend/internal/auth/jwt.go`
- Create: `backend/internal/auth/password.go`
- Create: `backend/internal/auth/middleware.go`

- [ ] **Step 1: Create password helpers**

Create `backend/internal/auth/password.go` with `HashPassword(password string) (string, error)` and `CheckPassword(hash, password string) error` using bcrypt cost 12.

- [ ] **Step 2: Create JWT token package**

Create `backend/internal/auth/jwt.go`:
- `type Claims struct { UserID uuid.UUID, Username string, Role string }` embedded in `jwt.RegisteredClaims`
- `GenerateToken(claims Claims, secret string, expirySeconds int) (string, error)`
- `ValidateToken(tokenString, secret string) (*Claims, error)`

- [ ] **Step 3: Create auth middleware**

Create `backend/internal/auth/middleware.go`:
- Chi middleware that extracts `Authorization: Bearer <token>` header
- Validates token, extracts claims, sets `UserID`, `Username`, `Role` in `context.Context`
- Helper: `UserFromContext(ctx) *Claims`
- Returns 401 JSON error if token missing/invalid

- [ ] **Step 4: Verify compilation**

```bash
cd /Users/gab/repo/glab/backend && go build ./...
```

---

### Task 6: Auth & User Handlers

**Files:**
- Create: `backend/internal/handler/auth.go`
- Create: `backend/internal/handler/user.go`
- Create: `backend/internal/handler/helpers.go`

- [ ] **Step 1: Create handler helpers**

Create `backend/internal/handler/helpers.go`:
- `respondJSON(w, status, data)` — marshal + write JSON response
- `respondError(w, status, message)` — error response `{"error": "message"}`
- `parseBody(r, v)` — decode JSON body into struct
- `parseUUID(s) (pgtype.UUID, error)` — parse string to pgx UUID

- [ ] **Step 2: Create auth handler**

Create `backend/internal/handler/auth.go`:
- `POST /api/v1/auth/login` — accepts `{username, password}`, verifies credentials, returns `{token, user}`
- `POST /api/v1/auth/logout` — no-op (stateless JWT), returns 200
- `GET /api/v1/auth/me` — returns current user from JWT claims (requires auth middleware)

- [ ] **Step 3: Create user handler**

Create `backend/internal/handler/user.go`:
- `GET /api/v1/users` — list users (paginated, query params: limit, offset)
- `GET /api/v1/users/:id` — get user by ID
- `PATCH /api/v1/users/:id` — update user (display_name, avatar_url, email). Only self or admin.

- [ ] **Step 4: Wire routes in main.go**

Update `cmd/glab/main.go` to:
- Create chi router
- Mount auth routes (public: `/api/v1/auth/login`, `/api/v1/auth/logout`)
- Mount protected routes (require auth middleware): `/api/v1/auth/me`, `/api/v1/users/*`
- Add CORS middleware

- [ ] **Step 5: Create initial admin user seed**

Add to main.go startup: if no users exist, create admin user `admin`/`admin123` (password hash via bcrypt). Log credentials to stdout.

- [ ] **Step 6: Test auth flow manually**

```bash
# Start dev DB
cd /Users/gab/repo/glab && docker compose -f docker-compose.dev.yml up -d

# Run backend
cd /Users/gab/repo/glab/backend && DATABASE_URL="postgres://glab:glab@localhost:5432/glab?sslmode=disable" JWT_SECRET="dev-secret-key-at-least-32-chars-long" go run ./cmd/glab/

# Test login
curl -s http://localhost:8080/api/v1/auth/login -d '{"username":"admin","password":"admin123"}' -H 'Content-Type: application/json' | jq

# Test /me with token
curl -s http://localhost:8080/api/v1/auth/me -H 'Authorization: Bearer <token>' | jq
```

---

### Task 7: Channel & Membership Handlers

**Files:**
- Create: `backend/internal/handler/channel.go`

- [ ] **Step 1: Create channel handler**

Create `backend/internal/handler/channel.go`:
- `GET /api/v1/channels` — list channels for current user (from channel_members)
- `POST /api/v1/channels` — create channel `{name, description, type}`, auto-generate slug, auto-add creator as owner
- `GET /api/v1/channels/:id` — get channel details + member count
- `PATCH /api/v1/channels/:id` — update channel (name, description, topic, is_archived). Owner/admin only.
- `DELETE /api/v1/channels/:id` — delete channel. Owner/admin only.
- `POST /api/v1/channels/:id/join` — join public channel
- `POST /api/v1/channels/:id/leave` — leave channel
- `POST /api/v1/channels/:id/members` — add member `{user_id}`. Admin only.
- `DELETE /api/v1/channels/:id/members/:uid` — remove member. Admin only.

- [ ] **Step 2: Create message REST handler**

Create `backend/internal/handler/message.go`:
- `GET /api/v1/channels/:id/messages` — paginated message history (query: limit, before cursor)
- `GET /api/v1/channels/:id/messages/pinned` — list pinned messages
- `GET /api/v1/messages/:id/thread` — list thread replies

- [ ] **Step 3: Wire channel + message routes in main.go**

Mount all channel and message routes under auth middleware.

- [ ] **Step 4: Create a #general channel on first boot**

In the seeding logic: create a `#general` channel (public) owned by admin, with admin as member.

- [ ] **Step 5: Test channel flow**

```bash
# Create channel
curl -s -X POST http://localhost:8080/api/v1/channels \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"dev-team","description":"Development team chat","type":"public"}' | jq

# List channels
curl -s http://localhost:8080/api/v1/channels -H 'Authorization: Bearer <token>' | jq
```

---

## Chunk 3: WebSocket Hub & Real-Time

### Task 8: WebSocket Protocol

**Files:**
- Create: `backend/internal/ws/protocol.go`

- [ ] **Step 1: Define protocol types**

Create `backend/internal/ws/protocol.go`:

```go
package ws

import "encoding/json"

// Envelope is the wire format for all WS messages
type Envelope struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`      // client-assigned request ID for ack
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Event type constants
const (
	// Client → Server
	EventMessageSend    = "message.send"
	EventMessageEdit    = "message.edit"
	EventMessageDelete  = "message.delete"
	EventMessagePin     = "message.pin"
	EventMessageUnpin   = "message.unpin"
	EventReactionAdd    = "reaction.add"
	EventReactionRemove = "reaction.remove"
	EventTypingStart    = "typing.start"
	EventTypingStop     = "typing.stop"
	EventPresenceUpdate = "presence.update"
	EventChannelRead    = "channel.read"
	EventSubscribe      = "subscribe"
	EventUnsubscribe    = "unsubscribe"

	// Server → Client
	EventAck             = "ack"
	EventHello           = "hello"
	EventMessageNew      = "message.new"
	EventMessageEdited   = "message.edited"
	EventMessageDeleted  = "message.deleted"
	EventMessagePinned   = "message.pinned"
	EventMessageUnpinned = "message.unpinned"
	EventReactionUpdated = "reaction.updated"
	EventTyping          = "typing"
	EventPresence        = "presence"
	EventNotification    = "notification"
)

// Payload types for each event (examples):

type MessageSendPayload struct {
	ChannelID string `json:"channel_id"`
	Content   string `json:"content"`
	ThreadID  string `json:"thread_id,omitempty"`
}

type MessageEditPayload struct {
	MessageID string `json:"message_id"`
	Content   string `json:"content"`
}

type MessageDeletePayload struct {
	MessageID string `json:"message_id"`
}

type SubscribePayload struct {
	ChannelIDs []string `json:"channel_ids"`
}

type UnsubscribePayload struct {
	ChannelIDs []string `json:"channel_ids"`
}

type ChannelReadPayload struct {
	ChannelID string `json:"channel_id"`
	MessageID string `json:"message_id"`
}

type TypingPayload struct {
	ChannelID string `json:"channel_id"`
}

type PresenceUpdatePayload struct {
	Status string `json:"status"` // online, away, dnd
}

type ReactionPayload struct {
	MessageID string `json:"message_id"`
	Emoji     string `json:"emoji"`
}

// Server payloads

type HelloPayload struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
}

type AckPayload struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type MessageNewPayload struct {
	ID          string `json:"id"`
	ChannelID   string `json:"channel_id"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
	ThreadID    string `json:"thread_id,omitempty"`
	IsBot       bool   `json:"is_bot"`
	CreatedAt   string `json:"created_at"`
}

type TypingBroadcast struct {
	ChannelID   string `json:"channel_id"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsTyping    bool   `json:"is_typing"`
}

type PresenceBroadcast struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Status   string `json:"status"`
}
```

---

### Task 9: WebSocket Hub

**Files:**
- Create: `backend/internal/ws/hub.go`
- Create: `backend/internal/ws/client.go`
- Create: `backend/internal/ws/handler.go`

- [ ] **Step 1: Create the Hub**

Create `backend/internal/ws/hub.go`:

Hub struct holds:
- `clients map[*Client]bool` — all connected clients
- `channels map[string]map[*Client]bool` — channel subscriptions
- `register/unregister chan *Client`
- `broadcast chan BroadcastMessage` (target channel + envelope)

Hub.Run() goroutine: select on register, unregister, broadcast channels. On unregister: remove client from all channel maps.

Key methods:
- `BroadcastToChannel(channelID string, envelope Envelope)` — send to all clients subscribed to channel
- `SendToUser(userID string, envelope Envelope)` — send to all clients of a specific user
- `Subscribe(client *Client, channelIDs []string)`
- `Unsubscribe(client *Client, channelIDs []string)`

- [ ] **Step 2: Create the Client**

Create `backend/internal/ws/client.go`:

Client struct holds:
- `hub *Hub`
- `conn *websocket.Conn`
- `userID, username, displayName string`
- `send chan []byte` — buffered outbound message channel (256)
- `subscriptions map[string]bool` — channels this client is subscribed to

Two goroutines per client:
- `readPump()` — reads messages from WS conn, parses Envelope, dispatches to hub/handlers. Ping/pong with 60s deadline.
- `writePump()` — writes messages from `send` channel to WS conn. Periodic ping (54s ticker).

Read pump message size limit: 64KB. Write wait: 10s.

- [ ] **Step 3: Create WS upgrade handler**

Create `backend/internal/ws/handler.go`:
- `ServeWS(hub *Hub, queries *repository.Queries, ...) http.HandlerFunc`
- Extracts JWT token from `?token=` query param (not header, since WS upgrade)
- Validates token
- Creates Client, registers with Hub
- Sends `hello` event with user info
- Starts readPump and writePump goroutines

- [ ] **Step 4: Wire WS handler in main.go**

Mount `GET /ws` → `ws.ServeWS(hub, ...)`. Start `hub.Run()` in a goroutine before server starts.

- [ ] **Step 5: Test WS connection**

```bash
# Using websocat or wscat
wscat -c "ws://localhost:8080/ws?token=<jwt-token>"
# Should receive {"type":"hello","payload":{"user_id":"...","username":"admin"}}
```

---

### Task 10: Message Handling via WebSocket

**Files:**
- Modify: `backend/internal/ws/client.go` (add message dispatch in readPump)
- Modify: `backend/internal/ws/hub.go` (add message handler)

- [ ] **Step 1: Implement message.send handler**

In the client's readPump, when receiving `message.send`:
1. Parse `MessageSendPayload`
2. Verify client is subscribed to the channel
3. Insert message into DB via `queries.CreateMessage`
4. Build `MessageNewPayload` from DB result
5. Broadcast `message.new` to all channel subscribers
6. Send `ack` to sender with message ID

- [ ] **Step 2: Implement message.edit handler**

1. Parse `MessageEditPayload`
2. Verify sender owns the message
3. Update content via `queries.UpdateMessageContent`
4. Broadcast `message.edited` to channel subscribers

- [ ] **Step 3: Implement message.delete handler**

1. Parse `MessageDeletePayload`
2. Verify sender owns the message (or is admin)
3. Delete via `queries.DeleteMessage`
4. Broadcast `message.deleted` to channel subscribers

- [ ] **Step 4: Implement subscribe/unsubscribe**

- `subscribe`: parse channel IDs, verify membership for each, call `hub.Subscribe`
- `unsubscribe`: call `hub.Unsubscribe`
- Auto-subscribe to all user's channels on connection (in ServeWS after hello)

- [ ] **Step 5: Implement channel.read**

Parse `ChannelReadPayload`, update `last_read_msg_id` via `queries.UpdateLastRead`.

- [ ] **Step 6: Test message flow**

Open two wscat connections. Subscribe to same channel. Send message from one → verify both receive `message.new`.

---

### Task 11: Presence & Typing

**Files:**
- Create: `backend/internal/ws/presence.go`
- Modify: `backend/internal/ws/client.go` (handle presence/typing events)

- [ ] **Step 1: Create Redis-backed presence service**

Create `backend/internal/ws/presence.go`:

```go
type PresenceService struct {
	rdb *redis.Client
	hub *Hub
}
```

Methods:
- `SetOnline(userID string)` — `SET presence:{userID} online EX 120` (2 min TTL, refreshed by ping)
- `SetStatus(userID, status string)` — update Redis key + broadcast `presence` to all connected clients
- `SetOffline(userID string)` — delete key + broadcast offline
- `GetOnlineUsers() map[string]string` — SCAN `presence:*` keys
- `RefreshPresence(userID string)` — extend TTL (called on every WS ping)
- `SetTyping(channelID, userID string)` — `SET typing:{channelID}:{userID} 1 EX 5` + broadcast `typing` to channel
- `StopTyping(channelID, userID string)` — delete key + broadcast
- `GetTypingUsers(channelID string) []string` — SCAN `typing:{channelID}:*`

- [ ] **Step 2: Wire presence into client lifecycle**

- On client connect (ServeWS): `presence.SetOnline(userID)`
- On client disconnect (unregister): `presence.SetOffline(userID)`
- On pong received: `presence.RefreshPresence(userID)`
- On `presence.update` event: `presence.SetStatus(userID, status)`
- On `typing.start`: `presence.SetTyping(channelID, userID)`
- On `typing.stop`: `presence.StopTyping(channelID, userID)`

- [ ] **Step 3: Send initial presence snapshot on connect**

After `hello`, send current online users to the newly connected client so they can populate their presence store.

- [ ] **Step 4: Test presence**

Connect client → verify `presence` broadcast. Disconnect → verify offline broadcast. Start typing → verify typing broadcast to other channel members.

---

## Chunk 4: Frontend Foundation

### Task 12: Next.js Project Setup

**Files:**
- Create: entire `frontend/` directory via `create-next-app`

- [ ] **Step 1: Create Next.js project**

```bash
cd /Users/gab/repo/glab
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/gab/repo/glab/frontend
npm install zustand @tanstack/react-virtual react-markdown
npm install -D @types/node
```

- [ ] **Step 3: Init shadcn/ui**

```bash
cd /Users/gab/repo/glab/frontend
npx shadcn@latest init -d
npx shadcn@latest add button input card avatar badge scroll-area separator tooltip dialog dropdown-menu
```

- [ ] **Step 4: Create TypeScript types**

Create `frontend/src/lib/types.ts` matching the WS protocol:

```typescript
// User
export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'agent';
  status: 'online' | 'away' | 'offline' | 'dnd';
  is_bot: boolean;
}

// Channel
export interface Channel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: 'public' | 'private' | 'dm';
  topic?: string;
  created_by: string;
  is_archived: boolean;
  unread_count?: number;
}

// Message
export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_bot: boolean;
  thread_id?: string;
  content: string;
  content_type: 'text' | 'file' | 'system';
  edited_at?: string;
  is_pinned: boolean;
  created_at: string;
}

// WebSocket Envelope
export interface WSEnvelope {
  type: string;
  id?: string;
  payload?: unknown;
}

// Auth
export interface LoginResponse {
  token: string;
  user: User;
}
```

- [ ] **Step 5: Create REST API client**

Create `frontend/src/lib/api.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient();
```

- [ ] **Step 6: Verify project builds**

```bash
cd /Users/gab/repo/glab/frontend && npm run build
```

---

### Task 13: Auth Store & Login Page

**Files:**
- Create: `frontend/src/stores/authStore.ts`
- Create: `frontend/src/app/(auth)/login/page.tsx`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Create auth store**

Create `frontend/src/stores/authStore.ts` (Zustand):
- State: `{ user: User | null, token: string | null, isLoading: boolean }`
- Actions: `login(username, password)`, `logout()`, `loadFromStorage()`
- Persist token to `localStorage`. On load, read token + call `/api/v1/auth/me` to validate.
- On login success: set token in `api.setToken()`, store in localStorage.

- [ ] **Step 2: Create login page**

Create `frontend/src/app/(auth)/login/page.tsx`:
- Centered card with Glab logo/name
- Username + password inputs (shadcn Input)
- Submit button (shadcn Button)
- Error display on failed login
- On success: redirect to `/`

- [ ] **Step 3: Create auth-guarded layout**

Create `frontend/src/app/(chat)/layout.tsx`:
- Check auth store on mount. If no token, redirect to `/login`.
- Show loading spinner while validating token.
- Once authenticated: render sidebar + main content area.

- [ ] **Step 4: Test login flow**

Start backend + frontend. Navigate to `/login`. Enter admin/admin123. Verify redirect to chat.

---

### Task 14: WebSocket Client Singleton

**Files:**
- Create: `frontend/src/lib/ws.ts`
- Create: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create WS client singleton**

Create `frontend/src/lib/ws.ts`:

```typescript
type WSEventHandler = (payload: unknown) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private token: string | null = null;
  private intentionalClose = false;

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    this.ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const envelope = JSON.parse(event.data);
      const handlers = this.handlers.get(envelope.type);
      handlers?.forEach(h => h(envelope.payload));
    };

    this.ws.onclose = () => {
      if (!this.intentionalClose) this.reconnect();
    };
  }

  private reconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    const jitter = delay * (0.75 + Math.random() * 0.5);
    this.reconnectAttempts++;
    setTimeout(() => {
      if (this.token) this.connect(this.token);
    }, jitter);
  }

  disconnect() {
    this.intentionalClose = true;
    this.ws?.close();
  }

  send(type: string, payload?: unknown, id?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, id, payload }));
    }
  }

  on(type: string, handler: WSEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
}

export const wsClient = new WSClient();
```

- [ ] **Step 2: Create useWebSocket hook**

Create `frontend/src/hooks/useWebSocket.ts`:
- Connects on mount (using token from authStore)
- Disconnects on unmount
- Subscribes to user's channels after receiving `hello`
- Returns `{ isConnected, send }` for components

---

### Task 15: Zustand Stores (Channel, Message, Presence)

**Files:**
- Create: `frontend/src/stores/channelStore.ts`
- Create: `frontend/src/stores/messageStore.ts`
- Create: `frontend/src/stores/presenceStore.ts`

- [ ] **Step 1: Create channel store**

Create `frontend/src/stores/channelStore.ts`:
- State: `{ channels: Channel[], activeChannelId: string | null }`
- Actions: `fetchChannels()`, `setActiveChannel(id)`, `addChannel(channel)`, `updateChannel(id, partial)`
- On mount: fetch from `GET /api/v1/channels`

- [ ] **Step 2: Create message store**

Create `frontend/src/stores/messageStore.ts`:
- State: `{ messages: Map<string, Message[]>, isLoading: boolean }`
- Actions: `fetchMessages(channelId, before?)`, `addMessage(channelId, message)`, `updateMessage(messageId, partial)`, `deleteMessage(channelId, messageId)`
- Wire to WS events: `message.new` → `addMessage`, `message.edited` → `updateMessage`, `message.deleted` → `deleteMessage`

- [ ] **Step 3: Create presence store**

Create `frontend/src/stores/presenceStore.ts`:
- State: `{ statuses: Map<string, string>, typing: Map<string, Set<string>> }`
- Actions: `setStatus(userId, status)`, `setTyping(channelId, userId, isTyping)`
- Wire to WS events: `presence` → `setStatus`, `typing` → `setTyping`
- Typing auto-expire: clear after 6s if no refresh (safety net)

---

### Task 16: Sidebar Component

**Files:**
- Create: `frontend/src/components/sidebar/Sidebar.tsx`
- Create: `frontend/src/components/sidebar/ChannelList.tsx`
- Create: `frontend/src/components/sidebar/DMList.tsx`

- [ ] **Step 1: Create ChannelList**

Create `frontend/src/components/sidebar/ChannelList.tsx`:
- Reads from channelStore (filtered by type != 'dm')
- Renders channel name with `#` prefix
- Active channel highlighted
- Unread badge (count from channel.unread_count)
- Click → `setActiveChannel(id)` + navigate to `/channel/{id}`

- [ ] **Step 2: Create DMList**

Create `frontend/src/components/sidebar/DMList.tsx`:
- Reads from channelStore (filtered by type == 'dm')
- Shows other user's display_name + avatar
- Presence dot (green=online, yellow=away, gray=offline) from presenceStore
- Click → navigate to `/channel/{id}` (DMs are just channels with type=dm)

- [ ] **Step 3: Create Sidebar container**

Create `frontend/src/components/sidebar/Sidebar.tsx`:
- Fixed 240px width, dark background
- Sections: workspace header ("Glab"), search input, "Channels" header + ChannelList, "Direct Messages" header + DMList
- Styled with Tailwind: `bg-slate-900 text-white`

- [ ] **Step 4: Wire sidebar into chat layout**

Update `frontend/src/app/(chat)/layout.tsx`: render `<Sidebar />` on the left, `{children}` flex in main area.

---

### Task 17: Chat View (MessageList + MessageInput)

**Files:**
- Create: `frontend/src/components/chat/MessageList.tsx`
- Create: `frontend/src/components/chat/MessageItem.tsx`
- Create: `frontend/src/components/chat/MessageInput.tsx`
- Create: `frontend/src/components/chat/TypingIndicator.tsx`
- Create: `frontend/src/app/(chat)/channel/[id]/page.tsx`

- [ ] **Step 1: Create MessageItem**

Create `frontend/src/components/chat/MessageItem.tsx`:
- Avatar (left), username + timestamp (top), content (body)
- Consecutive messages from same user within 5 min: compact mode (no avatar/name)
- Bot messages: subtle bot badge
- Render markdown content (react-markdown, basic: bold, italic, code, links)

- [ ] **Step 2: Create MessageList**

Create `frontend/src/components/chat/MessageList.tsx`:
- Virtual scroll using `@tanstack/react-virtual`
- Reads from messageStore for active channel
- Reverse order (newest at bottom)
- Auto-scroll to bottom on new messages (if already near bottom)
- Load more on scroll to top (fetch older messages via REST)
- Show loading spinner while fetching

- [ ] **Step 3: Create MessageInput**

Create `frontend/src/components/chat/MessageInput.tsx`:
- Textarea (auto-grows, max 200px height)
- Send on Enter (Shift+Enter for newline)
- On keypress: send `typing.start` via WS (debounced, max once per 3s)
- On send: `wsClient.send('message.send', { channel_id, content })`
- Clear input after send

- [ ] **Step 4: Create TypingIndicator**

Create `frontend/src/components/chat/TypingIndicator.tsx`:
- Reads typing state from presenceStore for active channel
- Shows "X is typing...", "X and Y are typing...", "Several people are typing..."
- Animated dots

- [ ] **Step 5: Create channel page**

Create `frontend/src/app/(chat)/channel/[id]/page.tsx`:
- Channel header: name, topic, member count
- MessageList (flex-1)
- TypingIndicator
- MessageInput (bottom)
- On mount: set active channel, fetch messages, subscribe via WS

- [ ] **Step 6: Test full message flow**

Start backend + frontend. Login. Click channel. Type message → see it appear. Open second browser tab → verify real-time delivery.

---

## Chunk 5: DMs & Integration

### Task 18: DM Support

**Files:**
- Modify: `backend/internal/handler/channel.go` (add DM creation endpoint)
- Modify: `backend/internal/repository/queries/channels.sql` (GetDMChannel already defined)

- [ ] **Step 1: Add DM creation endpoint**

Add to channel handler:
- `POST /api/v1/dm` — accepts `{user_id}`, creates DM channel if not exists, returns channel
- DM channel: `type=dm`, `name` = sorted username pair, `slug` = `dm-{uuid1}-{uuid2}` (sorted)
- Auto-add both users as members

- [ ] **Step 2: Update frontend for DM creation**

Add to DMList: "New Message" button → user search → select user → create DM → navigate to it.

- [ ] **Step 3: Test DM flow**

Create second user. Login as admin → start DM with user2. Verify DM channel created. Login as user2 → see DM in sidebar.

---

### Task 19: End-to-End Verification

- [ ] **Step 1: Full flow test**

1. Start `docker compose -f docker-compose.dev.yml up -d` (postgres + redis)
2. Start backend: `go run ./cmd/glab/`
3. Start frontend: `npm run dev`
4. Open browser → `/login` → admin/admin123
5. See #general in sidebar
6. Send message → see it appear
7. Open second browser (incognito) → create user via API → login
8. Both users see real-time messages
9. Check presence indicators
10. Test typing indicators

- [ ] **Step 2: Fix any issues found**

Iterate on bugs discovered during e2e testing.

- [ ] **Step 3: Commit Phase 1**

```bash
cd /Users/gab/repo/glab
git init
git add -A
git commit -m "feat: Phase 1 - Core chat with Go backend, Next.js frontend, WebSocket real-time messaging"
```

---

## Summary

**Total Tasks:** 19
**Estimated Parallelizable:** Tasks 1-4 (scaffolding), Tasks 12-14 (frontend setup) can run in parallel with Tasks 5-11 (backend logic) once shared types are defined.

**Critical Path:** Task 1 → Task 2 → Task 3 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 (backend must be working before frontend can integrate)

**Dependency Graph:**
```
Task 1 (Go init) ──────┐
Task 2 (Migrations) ───┼→ Task 3 (sqlc) → Task 5 (Auth) → Task 6 (Handlers) → Task 7 (Channels)
Task 4 (Docker) ───────┘                                                              ↓
                                                Task 8 (Protocol) → Task 9 (Hub) → Task 10 (Messages) → Task 11 (Presence)
                                                                                                              ↓
Task 12 (Next.js) → Task 13 (Login) ──→ Task 14 (WS Client) → Task 15 (Stores) → Task 16 (Sidebar) → Task 17 (Chat) → Task 18 (DMs) → Task 19 (E2E)
```
