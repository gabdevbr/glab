<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go 1.25" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis 7" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge" alt="AGPL-3.0" />
</p>

<h1 align="center">Glab</h1>

<p align="center">
  <strong>Open-source real-time chat platform with native AI agents</strong><br/>
  Self-hostable Slack alternative with pluggable storage (local / S3) and admin-panel-driven configuration.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#api-reference">API</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Features

**Real-time messaging** — WebSocket-powered with typing indicators, presence tracking, and instant delivery.

**AI agents as first-class citizens** — Create agents via the admin panel. Mention `@agent` in any channel or open a dedicated 1-on-1 panel. Responses stream in real-time. Works with any OpenAI-compatible API gateway.

**Pluggable storage** — Store files locally or on any S3-compatible provider (AWS S3, IBM Cloud Object Storage, Zadara, MinIO). Switch backends at runtime via the admin panel with zero-downtime file migration.

**Threads, reactions, pins** — Full conversation management with threaded replies, emoji reactions, and pinned messages.

**File sharing** — Upload files up to 50MB with automatic JPEG thumbnail generation.

**Full-text search** — PostgreSQL-native search with language-aware stemming and unaccent normalization.

**Channels & DMs** — Public channels, private groups, and direct messages with fine-grained membership control.

**Presence system** — Real-time online/away/DND status powered by Redis.

**Admin panel** — Dashboard with stats, user management, channel management, storage configuration, AI gateway setup, and RocketChat migration tools.

**Migration from RocketChat** — Dedicated CLI + web UI for migrating users, channels, messages, reactions, and files from RocketChat (100k+ messages/min via `COPY`).

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

---

## Configuration

Glab uses a minimal set of environment variables for bootstrap. Everything else is configured via the **admin panel** (stored in the database).

### Environment Variables (bootstrap only)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `JWT_SECRET` | *(required)* | Token signing secret |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `8080` | HTTP listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `UPLOAD_DIR` | `./uploads` | Local file storage base directory |

### Admin Panel Settings

Navigate to `/admin` (requires admin role):

- **Storage** — Choose local filesystem or S3-compatible object storage. Configure endpoint, bucket, credentials. Test connection. Migrate files between backends with real-time progress.
- **AI** — Configure AI gateway URL, token, and default model. Supports any OpenAI-compatible API.
- **Users** — Create, deactivate, change roles, reset passwords.
- **Channels** — View and manage all channels.

---

## Deployment

Production runs on Docker Compose behind nginx with SSL.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your secrets

# 2. Deploy
export DEPLOY_HOST=your-server.com
export DEPLOY_USER=ubuntu
export GLAB_DOMAIN=glab.example.com
./deploy.sh
```

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
| `POST` | `/channels/{id}/messages` | Send message |
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
| `GET` | `/search?q=term` | Full-text search |

### AI Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/{slug}` | Get agent details |
| `GET` | `/agents/{slug}/sessions` | List user's sessions with agent |
| `GET` | `/agents/{slug}/sessions/{id}/messages` | Get session messages |

### Admin — Storage

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/storage/config` | Get storage config |
| `PUT` | `/admin/storage/config` | Save and activate config |
| `POST` | `/admin/storage/test` | Test S3 connection |
| `POST` | `/admin/storage/migrate` | Start file migration |
| `GET` | `/admin/storage/migrate/status` | Migration progress |
| `POST` | `/admin/storage/migrate/cancel` | Cancel migration |

### Admin — AI Gateway

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/ai/config` | Get AI gateway config |
| `PUT` | `/admin/ai/config` | Save AI gateway config |
| `POST` | `/admin/ai/test` | Test gateway connectivity |

### WebSocket

Connect to `/ws?token=JWT_TOKEN` for real-time events:

**Client → Server:** `message.send`, `message.edit`, `message.delete`, `message.pin`, `reaction.add`, `reaction.remove`, `typing.start`, `typing.stop`, `channel.read`, `ai.prompt`, `ai.stop`

**Server → Client:** `message.new`, `message.edited`, `message.deleted`, `reaction.updated`, `thread.updated`, `typing`, `presence`, `notification`, `ai.chunk`, `ai.panel.chunk`, `storage.migration.progress`

---

## Project Structure

```
backend/                 Go API server
  cmd/glab/              Entry point
  internal/
    ai/                  AI gateway bridge + dispatcher
    auth/                JWT middleware + bcrypt password hashing
    config/              Environment config
    db/                  pgx connection pool
    handler/             HTTP handlers (auth, users, channels, messages, files, admin, storage, AI)
    repository/          sqlc-generated queries + models
    storage/             Pluggable storage (local, S3), migration engine
    ws/                  WebSocket hub, client management, presence tracking
  migrations/            SQL migrations (golang-migrate)

frontend/                Next.js 15 app
  src/app/               App router (login, chat, admin)
  src/components/        React components (sidebar, chat, AI panel, shadcn/ui)
  src/stores/            Zustand stores (auth, channels, messages, presence, storage, AI config)
  src/lib/               API client, WebSocket client, types

migrate/                 RocketChat → Glab migration CLI (separate Go module)

nginx/                   Nginx config templates
docker-compose.yml       Production stack
docker-compose.dev.yml   Dev infrastructure (Postgres + Redis only)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[GNU Affero General Public License v3.0](LICENSE)
