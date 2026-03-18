-- name: DeleteExpiredMessages :many
DELETE FROM messages
WHERE channel_id = $1
  AND created_at < $2::timestamptz
  AND thread_id IS NULL
RETURNING id, channel_id, user_id, created_at;

-- name: InsertAuditLog :exec
INSERT INTO message_audit_log (channel_id, user_id, message_created_at, deleted_at, deleted_by)
VALUES ($1, $2, $3, NOW(), $4);

-- name: ListChannelsWithRetention :many
SELECT id, retention_days FROM channels WHERE is_archived = FALSE;
