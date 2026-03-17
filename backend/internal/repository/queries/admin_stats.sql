-- name: CountUsers :one
SELECT count(*) FROM users WHERE is_deactivated = FALSE;

-- name: CountChannels :one
SELECT count(*) FROM channels WHERE is_archived = FALSE;

-- name: CountMessages :one
SELECT count(*) FROM messages;

-- name: CountFiles :one
SELECT count(*) FROM files;

-- name: TotalStorageBytes :one
SELECT coalesce(sum(size_bytes), 0)::bigint FROM files;

-- name: ListAllChannelsWithStats :many
SELECT
    c.id,
    c.name,
    c.slug,
    c.type,
    c.is_archived,
    c.created_at,
    (SELECT count(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count,
    (SELECT count(*) FROM messages m WHERE m.channel_id = c.id) AS message_count
FROM channels c
ORDER BY c.name;

-- name: SearchUsersAdmin :many
SELECT id, username, email, display_name, avatar_url, role, status, last_seen, is_bot, is_deactivated, created_at
FROM users
WHERE
    ($1::text = '' OR username ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
ORDER BY display_name
LIMIT $2 OFFSET $3;

-- name: DeactivateUser :exec
UPDATE users SET is_deactivated = TRUE WHERE id = $1;

-- name: UpdateUserRole :exec
UPDATE users SET role = $2 WHERE id = $1;
