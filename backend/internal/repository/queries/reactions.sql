-- name: AddReaction :exec
INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: RemoveReaction :exec
DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3;

-- name: ListReactionsByMessage :many
SELECT r.emoji, r.user_id, u.username, u.display_name
FROM reactions r JOIN users u ON u.id = r.user_id
WHERE r.message_id = $1
ORDER BY r.created_at;

-- name: GetReactionsForMessages :many
SELECT r.message_id, r.emoji, r.user_id, u.username
FROM reactions r JOIN users u ON u.id = r.user_id
WHERE r.message_id = ANY($1::uuid[]);
