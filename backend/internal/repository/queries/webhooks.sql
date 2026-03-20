-- name: GetWebhookByToken :one
SELECT w.*, c.slug AS channel_slug, c.name AS channel_name,
       a.slug AS agent_slug, a.name AS agent_name, a.user_id AS agent_user_id
FROM channel_webhooks w
JOIN channels c ON c.id = w.channel_id
LEFT JOIN agents a ON a.id = w.agent_id
WHERE w.token = $1;

-- name: ListChannelWebhooks :many
SELECT w.*, a.slug AS agent_slug, a.name AS agent_name
FROM channel_webhooks w
LEFT JOIN agents a ON a.id = w.agent_id
WHERE w.channel_id = $1
ORDER BY w.created_at DESC;

-- name: CreateChannelWebhook :one
INSERT INTO channel_webhooks (channel_id, agent_id, name, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: DeleteChannelWebhook :exec
DELETE FROM channel_webhooks WHERE id = $1 AND channel_id = $2;

-- name: DeleteChannelWebhookByID :exec
DELETE FROM channel_webhooks WHERE id = $1;
