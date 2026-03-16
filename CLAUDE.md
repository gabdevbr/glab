# Glab

Internal Slack-like chat application replacing RocketChat. Built for Geovendas team with native AI agent support via OpenClaw gateway.

## Tech Stack

- **Backend:** Go 1.25, Chi router, pgx (PostgreSQL), go-redis, gorilla/websocket, JWT auth
- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL 16 with full-text search (Portuguese + unaccent)
- **Cache/PubSub:** Redis 7 (presence, typing indicators, WebSocket fan-out)
- **AI Gateway:** OpenClaw at `192.168.37.206:18789`
- **Deployment:** Docker Compose on `192.168.37.206`, nginx reverse proxy

## Directory Structure

```
backend/               Go API server
  cmd/glab/            Entry point
  internal/
    config/            Env config (caarlos0/env)
    db/                Database connection pool
    auth/              JWT middleware + password hashing
    handler/           HTTP handlers (Chi routes)
    repository/        sqlc-generated DB queries
    ws/                WebSocket hub + presence
    ai/                Agent bridge + OpenClaw streaming
    storage/           File upload storage
  migrations/          SQL migrations (golang-migrate)
  sqlc.yaml            sqlc config

frontend/              Next.js app
  src/app/             App router pages
  src/components/      React components (shadcn/ui)
  src/lib/             API client, WebSocket hooks, utils

migrate/               RocketChat migration CLI (separate Go module)
  cmd/migrate/         CLI entry point
  internal/
    rocketchat/        RC REST API client
    transform/         RC → Glab data transformation
    loader/            Bulk insert via pgx COPY

nginx/                 Nginx config + SSL certs
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

# Run frontend (separate terminal)
make frontend
```

## Deploy to Production

```bash
cp .env.production .env    # Edit secrets
make deploy                # rsync + docker compose on 192.168.37.206
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

## sqlc Workflow

Queries live in `backend/internal/repository/queries/*.sql`. After editing:

```bash
make sqlc    # Regenerates Go code in backend/internal/repository/
```

## Migration CLI (RocketChat → Glab)

```bash
cd migrate
go build -o migrate ./cmd/migrate/

# Dry run
./migrate --rc-token TOKEN --rc-user-id USERID \
  --db-url "postgres://glab:pass@localhost:5432/glab?sslmode=disable" \
  --dry-run

# Full migration
./migrate --rc-token TOKEN --rc-user-id USERID \
  --db-url "postgres://glab:pass@localhost:5432/glab?sslmode=disable" \
  --migrate-files --upload-dir ./uploads
```

## Key Architecture Decisions

- **sqlc over ORM:** Type-safe queries, no runtime reflection, direct SQL control
- **pgx COPY for migration:** Bulk inserts at maximum throughput (100k+ msgs/min)
- **Redis pub/sub for WebSocket:** Enables horizontal scaling of API servers
- **Separate migrate module:** No dependency pollution into the main backend
- **AI agents as first-class users:** Agents have user accounts, appear in channels naturally
- **OpenClaw gateway:** Single LLM proxy for all agents, supports streaming via SSE
