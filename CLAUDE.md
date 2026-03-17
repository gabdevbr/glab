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
  cmd/glab/            Entry point
  internal/
    config/            Env config (caarlos0/env)
    db/                Database connection pool
    auth/              JWT middleware + password hashing
    handler/           HTTP handlers (Chi routes)
    repository/        sqlc-generated DB queries
    ws/                WebSocket hub + presence
    ai/                Agent bridge + streaming
    storage/           File upload storage (local + S3-compatible)
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

nginx/                 Nginx config templates (replace YOUR_DOMAIN)
docker-compose.yml     Production compose
docker-compose.dev.yml Dev infrastructure (postgres + redis only)
deploy.sh              Production deployment script (set DEPLOY_HOST, DEPLOY_USER, GLAB_DOMAIN)
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
cp .env.example .env    # Edit secrets
export DEPLOY_HOST=your-server.com
export DEPLOY_USER=ubuntu
export GLAB_DOMAIN=glab.example.com
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
- **Pluggable storage:** Local filesystem or any S3-compatible provider (AWS, IBM COS, Zadara)
- **Config via admin panel:** AI gateway URL/token and storage backend managed via DB, not env vars

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
