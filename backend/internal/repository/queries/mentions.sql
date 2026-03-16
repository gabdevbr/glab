-- name: CreateMention :exec
INSERT INTO mentions (message_id, user_id, channel_id, mention_type) VALUES ($1, $2, $3, $4);

-- name: GetUnreadMentions :many
SELECT m.*, msg.content, msg.channel_id as msg_channel_id, ch.name as channel_name
FROM mentions m
JOIN messages msg ON msg.id = m.message_id
JOIN channels ch ON ch.id = m.channel_id
WHERE m.user_id = $1 AND m.is_read = FALSE
ORDER BY m.created_at DESC;

-- name: MarkMentionsRead :exec
UPDATE mentions SET is_read = TRUE WHERE user_id = $1 AND channel_id = $2;
