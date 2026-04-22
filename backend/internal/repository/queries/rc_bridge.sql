-- name: UpsertRCSyncCursor :exec
INSERT INTO rc_sync_cursor (user_id, rc_room_id, last_seen_ts)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, rc_room_id) DO UPDATE SET last_seen_ts = EXCLUDED.last_seen_ts;

-- name: GetRCSyncCursor :one
SELECT last_seen_ts FROM rc_sync_cursor WHERE user_id = $1 AND rc_room_id = $2;

-- name: DeleteRCSyncCursorsForUser :exec
DELETE FROM rc_sync_cursor WHERE user_id = $1;
