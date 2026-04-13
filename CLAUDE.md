# Glab

Open-source Slack-like chat application with native AI agent support.

## Tech Stack

- **Backend:** Go 1.25, Chi router, pgx (PostgreSQL), go-redis, gorilla/websocket, JWT auth
- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL 16 with full-text search (Portuguese + unaccent)
- **Cache/PubSub:** Redis 7 (presence, typing indicators, WebSocket fan-out)
- **AI Gateway:** Configurable via admin panel (supports any OpenAI-compatible API)
- **Deployment:** Docker Compose, nginx reverse proxy

## Directory Structure

```
backend/               Go API server
  cmd/glab/            Entry point (routes, server, seed, retention job)
  internal/
    config/            Env config (caarlos0/env)
    db/                Database connection pool
    auth/              JWT middleware + password hashing
    handler/           HTTP handlers (Chi routes)
    repository/        sqlc-generated DB queries
    ws/                WebSocket hub + presence
    ai/                Agent bridge + streaming
    storage/           File upload storage (local + S3-compatible)
    migration/         In-app RocketChat migration engine (admin panel)
    retention/         Background message retention job (hourly)
  migrations/          SQL migrations (golang-migrate)
  sqlc.yaml            sqlc config

frontend/              Next.js app
  src/app/             App router pages (chat layout, admin, settings)
  src/components/      React components (shadcn/ui)
  src/stores/          Zustand state stores (auth, channel, message, presence, etc.)
  src/hooks/           WebSocket + keyboard shortcut hooks
  src/lib/             API client, types, utils

migrate/               RocketChat migration CLI (separate Go module)
  cmd/migrate/         CLI entry point
  internal/
    rocketchat/        RC REST API client
    transform/         RC → Glab data transformation
    loader/            Bulk insert via pgx COPY

nginx/                 Nginx config templates (replace YOUR_DOMAIN)
docker-compose.yml     Production compose
docker-compose.dev.yml Dev infrastructure (postgres + redis only)
deploy.sh              Production deployment script
```

## Local Development

```bash
# Start postgres + redis
make dev

# Apply migrations
export DATABASE_URL=postgres://glab:glab@localhost:5432/glab?sslmode=disable
make migrate-up

# Run backend (needs DATABASE_URL, JWT_SECRET, REDIS_URL in env or .env)
make backend

# Run frontend (separate terminal) — ALWAYS use yarn, never npm
cd frontend && yarn install   # first time only
make frontend
```

## Deploy to Production

```bash
# Create .deploy.env (gitignored) with: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PORT, GLAB_DOMAIN
./deploy.sh
```

## Database Migrations

```bash
# Create new migration
cd backend
migrate create -ext sql -dir migrations -seq <name>

# Apply
make migrate-up

# Rollback one
make migrate-down
```

Note: migrations auto-run on server startup in `main.go` — no manual step needed in production.

## sqlc Workflow

Queries live in `backend/internal/repository/queries/*.sql`. After editing:

```bash
make sqlc    # Regenerates Go code in backend/internal/repository/
```

Requires `sqlc` CLI: `brew install sqlc`

## WebSocket Protocol

Auth via query param: `ws://host/ws?token=JWT`

Client → Server: `message.send`, `message.edit`, `message.delete`, `message.pin`, `message.unpin`, `reaction.add`, `reaction.remove`, `typing.start`, `typing.stop`, `presence.update`, `channel.read`, `subscribe`, `unsubscribe`, `ai.prompt`, `ai.stop`

Server → Client: `ack`, `hello`, `message.new`, `message.edited`, `message.deleted`, `message.pinned`, `message.unpinned`, `reaction.updated`, `thread.updated`, `typing`, `presence`, `notification`, `ai.chunk`, `ai.panel.chunk`, `migration.log`, `migration.status`

## Key Architecture Decisions

- **sqlc over ORM:** Type-safe queries, no runtime reflection, direct SQL control
- **pgx COPY for migration:** Bulk inserts at maximum throughput (100k+ msgs/min)
- **Redis pub/sub for WebSocket:** Enables horizontal scaling of API servers
- **Separate migrate module:** No dependency pollution into the main backend
- **AI agents as first-class users:** Agents have user accounts, appear in channels naturally
- **Pluggable storage:** Local filesystem or any S3-compatible provider (AWS, IBM COS, Zadara)
- **Config via admin panel:** AI gateway URL/token, storage backend, retention policy, edit timeout — all managed via `app_config` DB table, not env vars

## Code Conventions

**Backend:**
- Response types in `handler/helpers.go` (ChannelResponse, MessageResponse, UserResponse)
- UUID helpers `parseUUID`/`uuidToString`/`timestampToString` duplicated in handler and ws packages (avoids circular deps)
- Admin endpoints use `requireAdmin()` wrapper; channel-level RBAC via `requireChannelRole()`
- `parseBody` uses `DisallowUnknownFields()` — API rejects unknown JSON fields

**Frontend:**
- **MANDATORY: Always use `yarn` for package management. Never use `npm`. This applies to install, add, remove, and all other package operations.**
- State: Zustand stores in `src/stores/`
- UI: shadcn/ui components in `src/components/ui/`
- API: singleton `ApiClient` in `src/lib/api.ts`
- Styling: Tailwind with custom theme tokens (sidebar, chat, accent, status colors)

## Gotchas

- **DM display names:** DM channel `name` column stores raw data. `GetDMDisplayNames` resolves the other participant's display_name at query time. DMs without a resolvable other member are filtered from the List response.
- **Two migration systems:** Standalone CLI in `migrate/` and in-app engine in `backend/internal/migration/` (admin panel). The in-app engine is incremental and supports file migration.
- **Private group members:** RocketChat `/api/v1/groups.list` returns incomplete member lists. The migration engine calls `/api/v1/groups.members` per group. Archived RC groups return 400 and are skipped.
- **Channel features:** Read-only channels (`read_only` flag), configurable retention policy (per-channel + global), message edit timeout (admin-configurable), auto-hide inactive channels (user preference), right-click context menu on channel list.

## Bootstrap Environment Variables

Only these env vars are needed to start the server. Everything else is configured via the admin panel.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `JWT_SECRET` | (required) | Token signing secret |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `8080` | HTTP listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `UPLOAD_DIR` | `./uploads` | Local file storage base directory |
