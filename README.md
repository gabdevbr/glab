<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go 1.25" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis 7" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

<h1 align="center">Glab</h1>

<p align="center">
  <strong>Internal real-time chat platform with native AI agents</strong><br/>
  Built to replace RocketChat — designed for teams that ship fast and talk to AI like teammates.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#api-reference">API</a> •
  <a href="#migration">Migration</a>
</p>

---

## Features

**Real-time messaging** — WebSocket-powered with typing indicators, presence tracking, and instant delivery.

**AI agents as first-class citizens** — 8 specialized agents live alongside human users in channels. Mention `@agent` in any conversation or open a dedicated 1-on-1 panel. Responses stream in real-time via SSE from the OpenClaw gateway.

**Threads, reactions, pins** — Full conversation management with threaded replies, emoji reactions, and pinned messages.

**File sharing** — Upload files up to 50MB with automatic JPEG thumbnail generation.

**Full-text search** — PostgreSQL-native search with Portuguese language support and unaccent normalization.

**Channels & DMs** — Public channels, private groups, and direct messages with fine-grained membership control.

**Presence system** — Real-time online/away/DND status powered by Redis.

**Migration-ready** — Ship with a dedicated CLI that migrates users, channels, messages, reactions, and files from RocketChat in bulk (100k+ messages/min via `COPY`).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         nginx (443)                         │
│              SSL termination + reverse proxy                 │
├──────────────┬──────────────────────────┬───────────────────┤
│   /api/*     │         /ws              │        /*         │
▼              ▼                          ▼                   │
┌──────────────────────────┐    ┌─────────────────────┐       │
│      Go API (Chi)        │    │  Next.js 15 (SSR)   │       │
│                          │    │                     │       │
│  ┌────────┐ ┌─────────┐ │    │  React 19           │       │
│  │ REST   │ │WebSocket│ │    │  Zustand stores      │       │
│  │handlers│ │  hub    │ │    │  shadcn/ui           │       │
│  └───┬────┘ └────┬────┘ │    │  Tailwind CSS 4      │       │
│      │           │      │    └─────────────────────┘       │
│  ┌───┴───────────┴───┐  │                                   │
│  │   AI Dispatcher   │  │                                   │
│  │  (3 concurrent    │  │                                   │
│  │   per agent)      │  │                                   │
│  └────────┬──────────┘  │                                   │
│           │  SSE        │                                   │
│           ▼             │                                   │
│  ┌─────────────────┐   │                                   │
│  │ OpenClaw Gateway │   │                                   │
│  │ (LLM proxy)     │   │                                   │
│  └─────────────────┘   │                                   │
└──────────┬──────────────┘                                   │
           │                                                   │
     ┌─────┴─────┐                                            │
     ▼           ▼                                            │
┌─────────┐ ┌─────────┐                                      │
│Postgres │ │  Redis  │                                      │
│  16     │ │   7     │                                      │
│         │ │         │                                      │
│ sqlc    │ │ pub/sub │                                      │
│ FTS     │ │presence │                                      │
│ UUIDs   │ │ cache   │                                      │
└─────────┘ └─────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Why |
|---|---|
| **sqlc** over ORM | Type-safe generated Go code, zero runtime reflection, full SQL control |
| **pgx COPY** for migration | Bulk inserts at max throughput — 100k+ messages/minute |
| **Redis pub/sub** for WebSocket | Enables horizontal scaling of API servers |
| **Separate `migrate/` module** | No dependency pollution into the main backend |
| **Agents as user accounts** | Agents appear naturally in channels, no special UI paths needed |
| **OpenClaw gateway** | Single LLM proxy for all agents, unified auth and model routing |

---

## Quick Start

### Prerequisites

- Go 1.25+
- Node.js 22+
- Docker & Docker Compose

### Development

```bash
# 1. Start infrastructure (Postgres + Redis)
make dev

# 2. Set environment
export DATABASE_URL=postgres://glab:glab@localhost:5432/glab?sslmode=disable
export JWT_SECRET=dev-secret
export REDIS_URL=redis://localhost:6379

# 3. Apply migrations
make migrate-up

# 4. Run backend
make backend

# 5. Run frontend (separate terminal)
make frontend
```

Open [http://localhost:3000](http://localhost:3000) — login with `admin` / `admin123`.

### Database Migrations

```bash
# Create a new migration
cd backend
migrate create -ext sql -dir migrations -seq add_bookmarks

# Apply all pending
make migrate-up

# Rollback one step
make migrate-down
```

### Code Generation (sqlc)

Queries live in `backend/internal/repository/queries/*.sql`:

```bash
make sqlc    # Regenerates Go code from SQL
```

---

## Deployment

Production runs on Docker Compose behind nginx with SSL.

```bash
# 1. Configure environment
cp .env.production .env
# Edit .env with your secrets

# 2. Deploy (rsync + docker compose on remote)
make deploy
```

The `deploy.sh` script handles:
1. **Sync** files to the remote server via rsync
2. **Generate** `.env` with secure defaults if missing
3. **Setup** self-signed SSL certificates
4. **Configure** nginx reverse proxy
5. **Build & start** containers

### Production Stack

| Service | Image | Resources |
|---|---|---|
| `glab-api` | Custom Go binary | 1 CPU, 512MB RAM |
| `glab-web` | Next.js standalone | 0.5 CPU, 256MB RAM |
| `glab-postgres` | postgres:16-alpine | Persistent volume |
| `glab-redis` | redis:7-alpine | 128MB max, LRU eviction |

---

## API Reference

All endpoints are prefixed with `/api/v1` and require JWT authentication (except login).

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Authenticate and receive JWT |
| `POST` | `/auth/logout` | Invalidate session |
| `GET` | `/auth/me` | Current user info |

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List all users |
| `GET` | `/users/{id}` | Get user details |
| `PATCH` | `/users/{id}` | Update user profile |

### Channels

| Method | Path | Description |
|---|---|---|
| `GET` | `/channels` | List user's channels |
| `POST` | `/channels` | Create channel |
| `GET` | `/channels/{id}` | Get channel details |
| `PATCH` | `/channels/{id}` | Update channel |
| `DELETE` | `/channels/{id}` | Archive channel |
| `POST` | `/channels/{id}/join` | Join public channel |
| `POST` | `/channels/{id}/leave` | Leave channel |
| `POST` | `/channels/{id}/members` | Add member |
| `DELETE` | `/channels/{id}/members/{uid}` | Remove member |

### Messages

| Method | Path | Description |
|---|---|---|
| `GET` | `/channels/{id}/messages` | List messages (paginated) |
| `GET` | `/channels/{id}/messages/pinned` | List pinned messages |
| `GET` | `/messages/{id}/thread` | Get thread replies |

### Files

| Method | Path | Description |
|---|---|---|
| `POST` | `/channels/{id}/upload` | Upload file (max 50MB) |
| `GET` | `/files/{id}` | Download file |
| `GET` | `/files/{id}/thumbnail` | Get auto-generated thumbnail |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/search?q=term` | Full-text search (Portuguese + unaccent) |

### AI Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/{slug}` | Get agent details |
| `GET` | `/agents/{slug}/sessions` | List user's sessions with agent |
| `GET` | `/agents/{slug}/sessions/{id}/messages` | Get session messages |

### WebSocket

Connect to `/ws?token=JWT_TOKEN` for real-time events:

**Client → Server:** `message.send`, `message.edit`, `message.delete`, `message.pin`, `reaction.add`, `reaction.remove`, `typing.start`, `typing.stop`, `channel.read`, `ai.prompt`, `ai.stop`

**Server → Client:** `message.new`, `message.edited`, `message.deleted`, `reaction.updated`, `thread.updated`, `typing`, `presence`, `notification`, `ai.chunk`, `ai.panel.chunk`

---

## AI Agents

Glab ships with 8 specialized agents powered by OpenClaw:

| Agent | Emoji | Domain |
|---|---|---|
| **Max** | 👗 | Sales Force — Clothing |
| **Trama** | 🧵 | Sales Force — Textile |
| **Lytis** | 📊 | Analytics |
| **Pilar** | 🏛️ | CRM / CRM360 |
| **Lumina** | 💡 | Inventory |
| **GeoBarsa** | 📚 | Knowledge Base |
| **BateCerto** | 🎯 | ERP |
| **GeoLens** | 🤖 | General Assistant |

Agents can be invoked two ways:
- **Channel mention** — type `@max how do I...` in any channel, response broadcasts to all members
- **Panel chat** — open a dedicated 1-on-1 session from the AI panel

Responses stream token-by-token with support for cancellation mid-stream.

---

## Migration from RocketChat

A dedicated CLI tool handles full migration with zero downtime for the new system:

```bash
cd migrate && go build -o migrate ./cmd/migrate/

# Preview what will be migrated
./migrate \
  --rc-token TOKEN \
  --rc-user-id USERID \
  --db-url "postgres://glab:pass@localhost:5432/glab?sslmode=disable" \
  --dry-run

# Full migration with files
./migrate \
  --rc-token TOKEN \
  --rc-user-id USERID \
  --db-url "postgres://glab:pass@localhost:5432/glab?sslmode=disable" \
  --migrate-files \
  --upload-dir ./uploads \
  --since 2024-01-01T00:00:00Z
```

### Migration Phases

1. **Export** — Fetch users, channels, messages, reactions, and files from RocketChat REST API
2. **Transform** — Map RocketChat IDs to Glab UUIDs, extract mentions, preserve threads
3. **Load** — Bulk insert via `pgx COPY` (~100k+ messages/min), rebuild search indexes
4. **Files** *(optional)* — Download and reorganize file attachments

---

## Project Structure

```
backend/                 Go API server
  cmd/glab/              Entry point — server bootstrap & agent seeding
  internal/
    ai/                  OpenClaw bridge (SSE streaming) + dispatcher
    auth/                JWT middleware + bcrypt password hashing
    config/              Environment config (caarlos0/env)
    db/                  pgx connection pool (5–20 connections)
    handler/             Chi HTTP handlers (auth, users, channels, messages, files, search, agents)
    repository/          sqlc-generated queries + models
    storage/             File upload service with thumbnail generation
    ws/                  WebSocket hub, client management, presence tracking
  migrations/            SQL migrations (golang-migrate)

frontend/                Next.js 15 app
  src/app/               App router (login, channel views)
  src/components/        React components (sidebar, chat, AI panel, shadcn/ui)
  src/hooks/             WebSocket connection hook
  src/stores/            Zustand stores (auth, channels, messages, presence, AI)
  src/lib/               API client, WebSocket utilities, types

migrate/                 RocketChat → Glab migration CLI (separate Go module)
  cmd/migrate/           CLI entry point (4-phase pipeline)
  internal/              RC client, data transformer, bulk loader

nginx/                   Production nginx config + SSL
docker-compose.yml       Production stack (API, Web, Postgres, Redis)
docker-compose.dev.yml   Dev infrastructure (Postgres + Redis only)
deploy.sh                One-command production deployment
Makefile                 Build, dev, and deploy targets
```

---

## License

Internal tool — proprietary to Geovendas.
