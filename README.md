<p align="center">
  <img src="https://raw.githubusercontent.com/gabdevbr/glab/main/glab-working.png" alt="Glab Screenshot" width="720" />
</p>

<h1 align="center">
  <br/>
  Glab
  <br/>
  <sub><sup>Open-source real-time chat with native AI agents</sup></sub>
</h1>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge" alt="License: AGPL-3.0" /></a>
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go 1.25" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis 7" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

<p align="center">
  Self-hostable Slack alternative with pluggable storage, admin-panel-driven configuration,<br/>
  and AI agents that live alongside your team as first-class participants.
</p>

<p align="center">
  <a href="#highlights">Features</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#configuration">Configuration</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#deployment">Deployment</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#api-reference">API</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#architecture">Architecture</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#contributing">Contributing</a>
</p>

---

<br/>

## Highlights

<table>
<tr>
<td width="50%">

### Real-time messaging
WebSocket-powered with typing indicators, presence tracking, and instant delivery across all channels and DMs.

### AI agents as teammates
Create agents via the admin panel. Mention `@agent` in any channel or open a dedicated 1-on-1 panel. Responses stream token-by-token. Works with **any OpenAI-compatible API**.

### Pluggable object storage
Local filesystem **or** any S3-compatible provider (AWS, IBM COS, Zadara, MinIO). Switch backends at runtime with **zero-downtime file migration**.

</td>
<td width="50%">

### Threads, reactions, pins
Full conversation management with threaded replies, emoji reactions, message pinning, and custom emojis.

### Full-text search
PostgreSQL-native search with language-aware stemming and unaccent normalization. Searches messages, files, and users.

### Admin panel
Dashboard with live stats, user management, channel management, storage configuration, AI gateway setup, and RocketChat migration tools — all from the browser.

</td>
</tr>
</table>

<br/>

---

<br/>

## Quick Start

### Prerequisites

- **Go** 1.25+
- **Node.js** 20+
- **Docker** & Docker Compose

```bash
# 1. Start infrastructure (Postgres + Redis)
make dev

# 2. Set environment
export DATABASE_URL=postgres://glab:glab@localhost:5432/glab?sslmode=disable
export JWT_SECRET=dev-secret
export REDIS_URL=redis://localhost:6379

# 3. Apply database migrations
make migrate-up

# 4. Run backend
make backend

# 5. Run frontend (new terminal)
make frontend
```

Open **http://localhost:3000** and login with `admin` / `admin123`.

<br/>

---

<br/>

## Configuration

Glab uses **6 environment variables** for bootstrap. Everything else lives in the database and is managed via the **admin panel**.

### Bootstrap Environment Variables

| Variable | Default | Purpose |
|:---------|:--------|:--------|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `JWT_SECRET` | *(required)* | JWT token signing secret |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `8080` | HTTP listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `UPLOAD_DIR` | `./uploads` | Local file storage directory |

### Admin Panel (`/admin`)

| Tab | What you can do |
|:----|:----------------|
| **Dashboard** | Live stats — users, channels, messages, files, storage usage, online count |
| **Users** | Create, deactivate, change roles, reset passwords |
| **Channels** | View and manage all channels |
| **Storage** | Switch between local and S3-compatible storage. Test connection. Migrate files between backends with real-time progress bar |
| **AI** | Configure gateway URL, token, and default model. Test connectivity. Supports any OpenAI-compatible API |
| **Migration** | Import users, channels, messages, reactions, and files from RocketChat |

<br/>

---

<br/>

## Deployment

Production runs on Docker Compose behind nginx with SSL.

```bash
# 1. Configure
cp .env.example .env        # edit with your secrets

# 2. Deploy
export DEPLOY_HOST=your-server.com
export DEPLOY_USER=ubuntu
export DEPLOY_PORT=22               # optional, defaults to 22
export GLAB_DOMAIN=glab.example.com
./deploy.sh
```

### Production Stack

| Service | Image | Resources |
|:--------|:------|:----------|
| **glab-api** | Custom Go binary | 1 CPU, 512 MB RAM |
| **glab-web** | Next.js standalone | 0.5 CPU, 256 MB RAM |
| **glab-postgres** | `postgres:16-alpine` | Persistent volume |
| **glab-redis** | `redis:7-alpine` | 128 MB max, LRU eviction |

<br/>

---

<br/>

## API Reference

All endpoints are prefixed with `/api/v1`. Authentication via `Authorization: Bearer <JWT>` header (except login).

<details>
<summary><strong>Auth</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/auth/login` | Authenticate and receive JWT |
| `POST` | `/auth/logout` | Invalidate session |
| `GET` | `/auth/me` | Current user info |

</details>

<details>
<summary><strong>Users</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/users` | List all users |
| `GET` | `/users/{id}` | Get user details |
| `PATCH` | `/users/{id}` | Update user profile |

</details>

<details>
<summary><strong>Channels</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/channels` | List user's channels |
| `POST` | `/channels` | Create channel |
| `GET` | `/channels/{id}` | Get channel details |
| `PATCH` | `/channels/{id}` | Update channel |
| `DELETE` | `/channels/{id}` | Archive channel |
| `POST` | `/channels/{id}/join` | Join public channel |
| `POST` | `/channels/{id}/leave` | Leave channel |
| `POST` | `/channels/{id}/members` | Add member |
| `DELETE` | `/channels/{id}/members/{uid}` | Remove member |

</details>

<details>
<summary><strong>Messages</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/channels/{id}/messages` | List messages (paginated) |
| `POST` | `/channels/{id}/messages` | Send message via API token |
| `GET` | `/channels/{id}/messages/pinned` | List pinned messages |
| `GET` | `/messages/{id}/thread` | Get thread replies |

</details>

<details>
<summary><strong>Files</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/channels/{id}/upload` | Upload file (max 50 MB) |
| `GET` | `/files/{id}` | Download / serve file |
| `GET` | `/files/{id}/thumbnail` | Auto-generated thumbnail |

</details>

<details>
<summary><strong>Search</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/search?q=term` | Full-text search across messages |

</details>

<details>
<summary><strong>Custom Emojis</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/emojis/custom` | List custom emojis |
| `GET` | `/emojis/custom/{name}` | Serve emoji image |

</details>

<details>
<summary><strong>AI Agents</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/{slug}` | Get agent details |
| `GET` | `/agents/{slug}/sessions` | List user's sessions |
| `GET` | `/agents/{slug}/sessions/{id}/messages` | Get session messages |

</details>

<details>
<summary><strong>API Tokens</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/tokens` | List API tokens |
| `POST` | `/tokens` | Create API token |
| `DELETE` | `/tokens/{id}` | Revoke API token |

</details>

<details>
<summary><strong>Admin — Users</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/admin/stats` | Dashboard statistics |
| `GET` | `/admin/users` | List all users |
| `POST` | `/admin/users` | Create user |
| `DELETE` | `/admin/users/{id}` | Deactivate user |
| `PATCH` | `/admin/users/{id}/role` | Change user role |
| `POST` | `/admin/users/{id}/reset-password` | Reset password |
| `GET` | `/admin/channels` | List all channels |

</details>

<details>
<summary><strong>Admin — Storage</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/admin/storage/config` | Get current storage config |
| `PUT` | `/admin/storage/config` | Save and hot-swap backend |
| `POST` | `/admin/storage/test` | Test S3 connection |
| `POST` | `/admin/storage/migrate` | Start file migration |
| `GET` | `/admin/storage/migrate/status` | Migration progress |
| `POST` | `/admin/storage/migrate/cancel` | Cancel migration |

</details>

<details>
<summary><strong>Admin — AI Gateway</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/admin/ai/config` | Get AI gateway config |
| `PUT` | `/admin/ai/config` | Save AI gateway config |
| `POST` | `/admin/ai/test` | Test gateway connectivity |

</details>

<details>
<summary><strong>Admin — RocketChat Migration</strong></summary>

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/admin/migration/start` | Start RC migration |
| `POST` | `/admin/migration/files` | Migrate files |
| `POST` | `/admin/migration/cancel` | Cancel migration |
| `GET` | `/admin/migration/status` | Migration status |
| `GET` | `/admin/migration/logs` | Migration logs |
| `GET` | `/admin/migration/jobs` | List migration jobs |
| `GET` | `/admin/migration/rooms` | Room migration states |

</details>

<details>
<summary><strong>WebSocket</strong></summary>

Connect to `/ws?token=JWT_TOKEN` for real-time events.

**Client to Server:**
`message.send` `message.edit` `message.delete` `message.pin` `reaction.add` `reaction.remove` `typing.start` `typing.stop` `channel.read` `ai.prompt` `ai.stop`

**Server to Client:**
`message.new` `message.edited` `message.deleted` `reaction.updated` `thread.updated` `typing` `presence` `notification` `ai.chunk` `ai.panel.chunk` `storage.migration.progress`

</details>

<br/>

---

<br/>

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │              nginx (443)                 │
                        │       SSL termination + reverse proxy    │
                        ├────────────┬────────────┬───────────────┤
                        │  /api/*    │    /ws     │      /*       │
                        ▼            ▼            ▼               │
                ┌──────────────────────┐  ┌──────────────┐        │
                │    Go API (Chi)      │  │  Next.js 15  │        │
                │                      │  │              │        │
                │  REST      WebSocket │  │  React 19    │        │
                │  handlers    hub     │  │  Zustand     │        │
                │         │            │  │  shadcn/ui   │        │
                │    AI Dispatcher     │  │  Tailwind 4  │        │
                │     (SSE streaming)  │  └──────────────┘        │
                └──────┬───────┬───────┘                          │
                       │       │                                  │
                  ┌────┴──┐ ┌──┴────┐                             │
                  │Postgres│ │ Redis │                             │
                  │  16    │ │   7   │                             │
                  │        │ │       │                             │
                  │ sqlc   │ │pub/sub│  ┌──────────────────┐      │
                  │ FTS    │ │presence│ │  Object Storage  │      │
                  │ UUIDs  │ │ cache │  │  Local / S3 /    │      │
                  └────────┘ └───────┘  │  IBM COS / MinIO │      │
                                        └──────────────────┘      │
                        └─────────────────────────────────────────┘
```

### Design Decisions

| Decision | Rationale |
|:---------|:----------|
| **sqlc** over ORM | Type-safe generated Go code, zero runtime reflection, full SQL control |
| **pgx COPY** for migration | Bulk inserts at max throughput — 100k+ messages/minute |
| **Redis pub/sub** for WebSocket | Enables horizontal scaling of API servers |
| **Pluggable storage** | Swap between local and S3-compatible at runtime via admin panel |
| **Config in DB** (not env vars) | AI gateway and storage config managed via admin panel, not restarts |
| **Agents as user accounts** | Agents appear naturally in channels, no special UI paths needed |
| **AGPL-3.0 license** | Ensures improvements stay open-source (same as RocketChat) |

<br/>

---

<br/>

## Project Structure

```
backend/                    Go API server
  cmd/glab/                 Entry point
  internal/
    ai/                     AI gateway bridge + dispatcher
    auth/                   JWT middleware + bcrypt
    config/                 Environment config
    db/                     pgx connection pool
    handler/                HTTP handlers (REST + admin)
    repository/             sqlc-generated queries
    storage/                Pluggable backends (local, S3) + migration engine
    ws/                     WebSocket hub + presence
  migrations/               SQL migrations (golang-migrate)

frontend/                   Next.js 15 app
  src/app/                  App router (login, chat, admin)
  src/components/           React components (shadcn/ui)
  src/stores/               Zustand state management
  src/lib/                  API client, WebSocket, types

migrate/                    RocketChat migration CLI (separate Go module)
```

<br/>

---

<br/>

## Security

If you discover a security vulnerability, please report it privately via email to **gabriel@geovendas.com**. Do not open a public issue.

<br/>

---

<br/>

## Contributing

We welcome contributions! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

<br/>

---

<br/>

## License

Glab is licensed under the **[GNU Affero General Public License v3.0](LICENSE)**.

You are free to use, modify, and distribute this software. If you run a modified version as a network service, you must make the source code available to its users under the same license.

<br/>

---

<br/>

<p align="center">
  <sub>Developed at</sub><br/><br/>
  <a href="https://geovendas.com">
    <img src="https://geovendas.com/wp-content/uploads/2025/02/logo_geovendas.svg" alt="Geovendas" height="40" />
  </a>
</p>

<p align="center">
  <sub>
    Built by <a href="https://gab.dev.br">gab.dev.br</a><br/>
    If Glab helps your team, consider giving it a star.
  </sub>
</p>
