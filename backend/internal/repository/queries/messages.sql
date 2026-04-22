-- name: CreateMessage :one
INSERT INTO messages (channel_id, user_id, thread_id, content, content_type, metadata)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: GetMessageByID :one
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.id = $1;

-- name: ListChannelMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.thread_id IS NULL
ORDER BY m.created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListThreadMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.thread_id = $1
ORDER BY m.created_at ASC;

-- name: UpdateMessageContent :one
UPDATE messages SET
  original_content = CASE WHEN original_content IS NULL THEN content ELSE original_content END,
  content = $2,
  edited_at = NOW()
WHERE id = $1 RETURNING *;

-- name: DeleteMessage :exec
DELETE FROM messages WHERE id = $1;

-- name: PinMessage :exec
UPDATE messages SET is_pinned = TRUE WHERE id = $1;

-- name: UnpinMessage :exec
UPDATE messages SET is_pinned = FALSE WHERE id = $1;

-- name: ListPinnedMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.is_pinned = TRUE
ORDER BY m.created_at DESC;

-- name: SearchMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot,
       ts_rank(m.search_vector, websearch_to_tsquery('portuguese', unaccent($1))) AS rank
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.search_vector @@ websearch_to_tsquery('portuguese', unaccent($1))
  AND ($2::uuid IS NULL OR m.channel_id = $2)
ORDER BY rank DESC
LIMIT $3 OFFSET $4;

-- name: SearchMessagesForUser :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot,
       ts_rank(m.search_vector, websearch_to_tsquery('portuguese', unaccent($1))) AS rank
FROM messages m
JOIN users u ON u.id = m.user_id
JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $3
WHERE m.search_vector @@ websearch_to_tsquery('portuguese', unaccent($1))
  AND ($2::uuid IS NULL OR m.channel_id = $2)
ORDER BY rank DESC
LIMIT $4 OFFSET $5;

-- name: GetMessagesSince :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1 AND m.created_at > $2
ORDER BY m.created_at ASC;

-- name: CreateMessageWithRCID :one
INSERT INTO messages (channel_id, user_id, thread_id, content, content_type, metadata, rc_message_id, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: GetMessageByRCID :one
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.rc_message_id = $1;

-- name: UpdateMessageByRCID :one
UPDATE messages SET
  original_content = CASE WHEN original_content IS NULL THEN content ELSE original_content END,
  content = $2,
  edited_at = $3
WHERE rc_message_id = $1 RETURNING *;

-- name: DeleteMessageByRCID :exec
DELETE FROM messages WHERE rc_message_id = $1;

-- name: UpdateMessageRCID :exec
UPDATE messages SET rc_message_id = $2 WHERE id = $1;
