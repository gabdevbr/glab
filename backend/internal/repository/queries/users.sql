-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: ListUsers :many
SELECT id, username, email, display_name, avatar_url, role, status, last_seen, is_bot
FROM users WHERE is_deactivated = FALSE ORDER BY display_name LIMIT $1 OFFSET $2;

-- name: SearchUsers :many
SELECT id, username, email, display_name, avatar_url, role, status, last_seen, is_bot
FROM users WHERE is_deactivated = FALSE
  AND (display_name ILIKE '%' || $1 || '%' OR username ILIKE '%' || $1 || '%')
ORDER BY display_name LIMIT $2;

-- name: CreateUser :one
INSERT INTO users (username, email, display_name, password_hash, role, is_bot, bot_config)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: UpdateUser :one
UPDATE users SET
    display_name = coalesce(sqlc.narg('display_name'), display_name),
    avatar_url = coalesce(sqlc.narg('avatar_url'), avatar_url),
    status = coalesce(sqlc.narg('status'), status),
    email = coalesce(sqlc.narg('email'), email)
WHERE id = $1 RETURNING *;

-- name: UpdateUserStatus :exec
UPDATE users SET status = $2, last_seen = NOW() WHERE id = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: UpdateAutoHideDays :exec
UPDATE users SET auto_hide_days = $2 WHERE id = $1;

-- name: GetAutoHideDays :one
SELECT auto_hide_days FROM users WHERE id = $1;

-- name: UpdateChannelSort :exec
UPDATE users SET channel_sort = $2 WHERE id = $1;

-- name: GetChannelSort :one
SELECT channel_sort FROM users WHERE id = $1;

-- name: GetUserByRCUserID :one
SELECT * FROM users WHERE rc_user_id = $1;

-- name: UpsertUserByRCLogin :one
INSERT INTO users (username, email, display_name, password_hash, role, is_bot, bot_config, rc_user_id, rc_auth_token_enc, rc_token_expires_at, rc_last_login_at)
VALUES ($1, $2, $3, $4, 'user', FALSE, 'null', $5, $6, $7, NOW())
ON CONFLICT (rc_user_id) DO UPDATE SET
    username          = EXCLUDED.username,
    display_name      = EXCLUDED.display_name,
    rc_auth_token_enc = EXCLUDED.rc_auth_token_enc,
    rc_token_expires_at = EXCLUDED.rc_token_expires_at,
    rc_last_login_at  = NOW(),
    updated_at        = NOW()
RETURNING *;

-- name: UpdateRCToken :exec
UPDATE users SET
    rc_auth_token_enc   = $2,
    rc_token_expires_at = $3,
    rc_last_login_at    = NOW()
WHERE id = $1;

-- name: MarkLocalAuthReady :exec
UPDATE users SET
    password_hash     = $2,
    local_auth_ready  = TRUE
WHERE id = $1;
