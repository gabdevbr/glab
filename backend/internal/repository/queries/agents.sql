-- name: GetAgentBySlug :one
SELECT * FROM agents WHERE slug = $1;

-- name: GetAgentByUserID :one
SELECT * FROM agents WHERE user_id = $1;

-- name: ListAgents :many
SELECT * FROM agents WHERE status = 'active' ORDER BY name;

-- name: ListAgentsRespondWithoutMention :many
SELECT * FROM agents WHERE status = 'active' AND respond_without_mention = true ORDER BY name;

-- name: UpdateAgentRespondWithoutMention :exec
UPDATE agents SET respond_without_mention = $2 WHERE id = $1;

-- name: UpdateAgent :one
UPDATE agents SET
    name = $2,
    emoji = $3,
    description = $4,
    scope = $5,
    status = $6,
    gateway_url = $7,
    gateway_token = $8,
    model = $9,
    system_prompt = $10,
    max_tokens = $11,
    temperature = $12,
    max_context_messages = $13,
    respond_without_mention = $14,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1;

-- name: GetAgentByID :one
SELECT * FROM agents WHERE id = $1;

-- name: CreateAgent :one
INSERT INTO agents (user_id, slug, name, emoji, description, scope, status, gateway_url, gateway_token, model, system_prompt, max_tokens, temperature, max_context_messages)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *;

-- name: GetAgentSession :one
SELECT * FROM agent_sessions WHERE id = $1;

-- name: ListAgentSessions :many
SELECT * FROM agent_sessions WHERE agent_id = $1 AND user_id = $2 ORDER BY updated_at DESC;

-- name: CreateAgentSession :one
INSERT INTO agent_sessions (agent_id, user_id, title) VALUES ($1, $2, $3) RETURNING *;

-- name: UpdateAgentSessionTitle :exec
UPDATE agent_sessions SET title = $2 WHERE id = $1;

-- name: GetSessionMessages :many
SELECT m.*, u.username, u.display_name, u.avatar_url, u.is_bot
FROM messages m JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1
ORDER BY m.created_at ASC;

-- name: CreateAgentUsage :exec
INSERT INTO agent_usage (agent_id, user_id, channel_id, session_id, message_id, input_tokens, output_tokens, cost_usd, response_time_ms, model_used, source)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
