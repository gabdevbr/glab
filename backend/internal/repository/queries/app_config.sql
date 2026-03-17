-- name: GetAppConfig :one
SELECT * FROM app_config WHERE key = $1;

-- name: UpsertAppConfig :one
INSERT INTO app_config (key, value, updated_at, updated_by)
VALUES ($1, $2, NOW(), $3)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by
RETURNING *;

-- name: ListAppConfig :many
SELECT * FROM app_config ORDER BY key;
