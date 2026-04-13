.PHONY: dev dev-down migrate-up migrate-down sqlc backend frontend build up down deploy

# Development infrastructure (postgres + redis only)
dev:
	docker compose -f docker-compose.dev.yml up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

# Database migrations
migrate-up:
	cd backend && go run -tags 'pgx5' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path migrations -database "$(DATABASE_URL)" up

migrate-down:
	cd backend && go run -tags 'pgx5' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path migrations -database "$(DATABASE_URL)" down 1

# Code generation
sqlc:
	cd backend && sqlc generate

# Run locally
backend:
	cd backend && go run ./cmd/glab/

frontend:
	cd frontend && yarn dev

# Production Docker
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

# Deploy to production
deploy:
	./deploy.sh
