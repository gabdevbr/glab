-- name: GetChannelByID :one
SELECT * FROM channels WHERE id = $1;

-- name: GetChannelBySlug :one
SELECT * FROM channels WHERE slug = $1;

-- name: ListChannelsForUser :many
SELECT c.*,
  (SELECT COUNT(*) FROM messages m
   WHERE m.channel_id = c.id
     AND m.thread_id IS NULL
     AND (cm.last_read_msg_id IS NULL
       OR m.created_at > (SELECT created_at FROM messages WHERE id = cm.last_read_msg_id))
  )::int AS unread_count,
  cm.is_pinned
FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1 AND c.is_archived = FALSE AND cm.hidden = FALSE
  AND c.slug NOT LIKE 'agent-session-%'
  AND (
    $2::int = 0
    OR c.last_message_at >= NOW() - INTERVAL '1 day' * $2::int
    OR c.last_message_at IS NULL
  )
  -- Exclude orphan DMs (where the other participant is missing)
  AND (
    c.type <> 'dm'
    OR EXISTS (
      SELECT 1 FROM channel_members cm2
      WHERE cm2.channel_id = c.id AND cm2.user_id <> $1
    )
  )
ORDER BY c.name;

-- name: ListPublicChannels :many
SELECT * FROM channels WHERE type = 'public' AND is_archived = FALSE ORDER BY name;

-- name: CreateChannel :one
INSERT INTO channels (name, slug, description, type, topic, created_by, read_only)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: UpdateChannel :one
UPDATE channels SET
    name = coalesce(sqlc.narg('name'), name),
    description = coalesce(sqlc.narg('description'), description),
    topic = coalesce(sqlc.narg('topic'), topic),
    is_archived = coalesce(sqlc.narg('is_archived'), is_archived),
    read_only = coalesce(sqlc.narg('read_only'), read_only),
    retention_days = coalesce(sqlc.narg('retention_days'), retention_days)
WHERE id = $1 RETURNING *;

-- name: DeleteChannel :exec
DELETE FROM channels WHERE id = $1;

-- name: GetDMDisplayNames :many
-- For each DM channel the user belongs to, return the other participant's display name, user ID, and avatar.
-- If no other member exists, falls back to the channel name and created_by.
SELECT
    cm.channel_id,
    COALESCE(
        (SELECT u.display_name FROM channel_members cm2
         JOIN users u ON u.id = cm2.user_id
         WHERE cm2.channel_id = cm.channel_id AND cm2.user_id <> $1
         LIMIT 1),
        c.name
    ) AS display_name,
    COALESCE(
        (SELECT cm2.user_id FROM channel_members cm2
         WHERE cm2.channel_id = cm.channel_id AND cm2.user_id <> $1
         LIMIT 1),
        c.created_by
    ) AS other_user_id,
    (SELECT u.avatar_url FROM channel_members cm2
     JOIN users u ON u.id = cm2.user_id
     WHERE cm2.channel_id = cm.channel_id AND cm2.user_id <> $1
     LIMIT 1) AS avatar_url
FROM channel_members cm
JOIN channels c ON c.id = cm.channel_id
WHERE cm.user_id = $1 AND c.type = 'dm';

-- name: GetDMChannel :one
SELECT c.* FROM channels c
JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.user_id = $1
JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id = $2
WHERE c.type = 'dm';

-- name: UpdateChannelLastMessageAt :exec
UPDATE channels SET last_message_at = NOW() WHERE id = $1;

-- name: ListHiddenChannelsForUser :many
SELECT c.* FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1 AND cm.hidden = TRUE AND c.is_archived = FALSE
  AND c.slug NOT LIKE 'agent-session-%'
ORDER BY c.name;

-- name: PinChannel :exec
UPDATE channel_members SET is_pinned = TRUE WHERE channel_id = $1 AND user_id = $2;

-- name: UnpinChannel :exec
UPDATE channel_members SET is_pinned = FALSE WHERE channel_id = $1 AND user_id = $2;

-- name: GetChannelReadOnly :one
SELECT read_only FROM channels WHERE id = $1;
