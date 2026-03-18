#!/bin/bash
# Glab backup — PostgreSQL dump + uploaded files
# Designed to run from cron twice daily (6:00 and 18:00)
set -euo pipefail

BACKUP_DIR="/root/backup"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CURRENT_BACKUP="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "$CURRENT_BACKUP"

# Dump PostgreSQL
echo "[backup] Dumping PostgreSQL..."
docker exec glab-postgres pg_dump -U glab -d glab --clean --if-exists \
    | gzip > "${CURRENT_BACKUP}/glab_db.sql.gz"

# Copy uploaded files
echo "[backup] Copying uploads..."
UPLOADS_VOLUME=$(docker volume inspect glab_uploads --format '{{ .Mountpoint }}' 2>/dev/null || true)
if [ -n "$UPLOADS_VOLUME" ] && [ -d "$UPLOADS_VOLUME" ]; then
    tar czf "${CURRENT_BACKUP}/uploads.tar.gz" -C "$UPLOADS_VOLUME" .
else
    echo "[backup] Warning: uploads volume not found, skipping file backup"
fi

# Rotate old backups
echo "[backup] Rotating backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} +

echo "[backup] Done — ${CURRENT_BACKUP}"
ls -lh "${CURRENT_BACKUP}/"
