-- name: CreateAPIToken :one
INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: GetAPITokenByHash :one
SELECT t.*, u.username, u.role AS user_role
FROM api_tokens t
JOIN users u ON u.id = t.user_id
WHERE t.token_hash = $1 AND t.is_revoked = FALSE;

-- name: ListAPITokensByUser :many
SELECT * FROM api_tokens
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: RevokeAPIToken :exec
UPDATE api_tokens SET is_revoked = TRUE WHERE id = $1 AND user_id = $2;

-- name: DeleteAPIToken :exec
DELETE FROM api_tokens WHERE id = $1 AND user_id = $2;

-- name: UpdateTokenLastUsed :exec
UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1;
