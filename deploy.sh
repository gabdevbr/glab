#!/bin/bash
# Deploy Glab to 192.168.37.206
set -euo pipefail

REMOTE="geovendas@192.168.37.206"
DEPLOY_DIR="/home/geovendas/glab"

echo "=== Deploying Glab to $REMOTE:$DEPLOY_DIR ==="

# Sync files to remote
echo "[1/5] Syncing files..."
rsync -avz --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='frontend/node_modules' \
    --exclude='backend/tmp' \
    --exclude='migrate/vendor' \
    --exclude='.env' \
    ./ "$REMOTE:$DEPLOY_DIR/"

# Generate .env if not present on server
echo "[2/5] Setting up environment..."
ssh "$REMOTE" bash -s <<'ENVSCRIPT'
cd /home/geovendas/glab
if [ ! -f .env ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    PG_PASS=$(openssl rand -hex 16)
    cat > .env <<EOF
DATABASE_URL=postgres://glab:${PG_PASS}@glab-postgres:5432/glab?sslmode=disable
POSTGRES_USER=glab
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=glab
REDIS_URL=redis://glab-redis:6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=604800
PORT=8080
CORS_ORIGIN=https://glab.geovendas.local
NEXT_PUBLIC_API_URL=https://glab.geovendas.local
NEXT_PUBLIC_WS_URL=wss://glab.geovendas.local
UPLOAD_DIR=/data/uploads
EOF
    echo "  .env created with generated secrets"
else
    echo "  .env already exists, skipping"
fi
ENVSCRIPT

# Generate SSL cert if not present
echo "[3/5] Setting up SSL..."
ssh "$REMOTE" bash -s <<'SSLSCRIPT'
if [ ! -f /etc/nginx/ssl/glab.crt ]; then
    sudo mkdir -p /etc/nginx/ssl
    sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/glab.key \
        -out /etc/nginx/ssl/glab.crt \
        -subj "/CN=glab.geovendas.local" 2>/dev/null
    echo "  SSL cert generated"
else
    echo "  SSL cert already exists, skipping"
fi
SSLSCRIPT

# Install nginx site config
echo "[4/5] Configuring nginx..."
ssh "$REMOTE" bash -s <<'NGINXSCRIPT'
sudo cp /home/geovendas/glab/nginx/glab-site.conf /etc/nginx/sites-enabled/glab
sudo nginx -t 2>&1 && sudo systemctl reload nginx
echo "  nginx configured and reloaded"
NGINXSCRIPT

# Build and start containers
echo "[5/5] Building and starting containers..."
ssh "$REMOTE" "cd $DEPLOY_DIR && docker compose build && docker compose up -d"

echo ""
echo "=== Deploy complete ==="
ssh "$REMOTE" "cd $DEPLOY_DIR && docker compose ps"
echo ""
echo "Access: https://glab.geovendas.local"
echo "Default login: admin / admin123"
