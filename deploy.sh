#!/bin/bash
# Deploy Glab to a remote server
set -euo pipefail

# Load local deploy config if present (git-ignored)
if [ -f .deploy.env ]; then
    set -a; source .deploy.env; set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-your-server.example.com}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
GLAB_DOMAIN="${GLAB_DOMAIN:-glab.example.com}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/${DEPLOY_USER}/glab}"

SSH_OPTS="-p ${DEPLOY_PORT} -o StrictHostKeyChecking=accept-new"

echo "=== Deploying Glab to $REMOTE:$DEPLOY_DIR (port $DEPLOY_PORT) ==="

# Sync files to remote
echo "[1/7] Syncing files..."
rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='frontend/node_modules' \
    --exclude='backend/tmp' \
    --exclude='migrate/vendor' \
    --exclude='.env' \
    --exclude='.playwright-mcp' \
    ./ "$REMOTE:$DEPLOY_DIR/"

# Install nginx if not present
echo "[2/7] Ensuring nginx is installed..."
ssh ${SSH_OPTS} "$REMOTE" bash -s <<'INSTALLSCRIPT'
if ! command -v nginx &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq nginx >/dev/null 2>&1
    systemctl enable nginx
    echo "  nginx installed"
else
    echo "  nginx already installed"
fi
INSTALLSCRIPT

# Generate .env if not present on server
echo "[3/7] Setting up environment..."
ssh ${SSH_OPTS} "$REMOTE" bash -s <<ENVSCRIPT
cd "$DEPLOY_DIR"
if [ ! -f .env ]; then
    JWT_SECRET=\$(openssl rand -hex 32)
    PG_PASS=\$(openssl rand -hex 16)
    cat > .env <<EOF
DATABASE_URL=postgres://glab:\${PG_PASS}@glab-postgres:5432/glab?sslmode=disable
POSTGRES_USER=glab
POSTGRES_PASSWORD=\${PG_PASS}
POSTGRES_DB=glab
REDIS_URL=redis://glab-redis:6379
JWT_SECRET=\${JWT_SECRET}
JWT_EXPIRY=604800
PORT=8080
CORS_ORIGIN=https://${GLAB_DOMAIN}
NEXT_PUBLIC_API_URL=https://${GLAB_DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${GLAB_DOMAIN}
UPLOAD_DIR=/data/uploads
EOF
    echo "  .env created with generated secrets"
else
    echo "  .env already exists, skipping"
fi
ENVSCRIPT

# Obtain SSL cert via certbot (idempotent — skips if cert exists)
echo "[4/7] Setting up SSL with certbot..."
ssh ${SSH_OPTS} "$REMOTE" bash -s <<SSLSCRIPT
if ! command -v certbot &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx >/dev/null 2>&1
    echo "  certbot installed"
fi
if [ ! -d /etc/letsencrypt/live/${GLAB_DOMAIN} ]; then
    certbot certonly --nginx -d ${GLAB_DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email
    echo "  SSL cert obtained via certbot"
else
    echo "  certbot cert already exists, skipping"
fi
SSLSCRIPT

# Install nginx site config
echo "[5/7] Configuring nginx..."
ssh ${SSH_OPTS} "$REMOTE" bash -s <<NGINXSCRIPT
sudo sed "s/YOUR_DOMAIN/${GLAB_DOMAIN}/g" "$DEPLOY_DIR/nginx/glab-site.conf" \
    | sudo tee /etc/nginx/sites-enabled/glab > /dev/null
sudo nginx -t 2>&1 && sudo systemctl reload nginx
echo "  nginx configured and reloaded"
NGINXSCRIPT

# Install backup script and cron
echo "[6/7] Setting up backups..."
scp ${SSH_OPTS/#-p/-P} "$DEPLOY_DIR/backup.sh" "$REMOTE:/root/backup.sh"
ssh ${SSH_OPTS} "$REMOTE" bash -s <<'BACKUPSCRIPT'
chmod +x /root/backup.sh
mkdir -p /root/backup
if ! crontab -l 2>/dev/null | grep -q '/root/backup.sh'; then
    (crontab -l 2>/dev/null; echo "0 6,18 * * * /root/backup.sh >> /root/backup/cron.log 2>&1") | crontab -
    echo "  backup cron installed (6:00 and 18:00 daily)"
else
    echo "  backup cron already configured"
fi
BACKUPSCRIPT

# Build and start containers
echo "[7/7] Building and starting containers..."
ssh ${SSH_OPTS} "$REMOTE" "cd $DEPLOY_DIR && docker compose build && docker compose up -d"

echo ""
echo "=== Deploy complete ==="
ssh ${SSH_OPTS} "$REMOTE" "cd $DEPLOY_DIR && docker compose ps"
echo ""
echo "Access: https://${GLAB_DOMAIN}"
echo "Default login: admin / admin123"
