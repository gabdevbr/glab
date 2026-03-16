#!/bin/bash
# Deploy Glab to 192.168.37.206
set -euo pipefail

REMOTE="geovendas@192.168.37.206"
DEPLOY_DIR="/home/geovendas/glab"

echo "=== Deploying Glab to $REMOTE:$DEPLOY_DIR ==="

# Ensure .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.production to .env and fill in secrets:"
    echo "  cp .env.production .env"
    exit 1
fi

# Sync files to remote
echo "Syncing files..."
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='.next' \
    --exclude='frontend/node_modules' --exclude='backend/tmp' \
    --exclude='migrate/vendor' \
    ./ "$REMOTE:$DEPLOY_DIR/"

# Build and start on remote
echo "Building and starting containers..."
ssh "$REMOTE" "cd $DEPLOY_DIR && \
    docker compose build && \
    docker compose up -d && \
    echo '--- Container status ---' && \
    docker compose ps"

echo ""
echo "=== Deploy complete ==="
echo "Access: https://glab.geovendas.local"
echo ""
echo "To generate self-signed SSL certs on the server:"
echo "  ssh $REMOTE 'mkdir -p $DEPLOY_DIR/nginx/ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout $DEPLOY_DIR/nginx/ssl/glab.key -out $DEPLOY_DIR/nginx/ssl/glab.crt -subj \"/CN=glab.geovendas.local\"'"
