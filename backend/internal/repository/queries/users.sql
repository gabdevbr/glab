-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: ListUsers :many
SELECT id, username, email, display_name, avatar_url, role, status, last_seen, is_bot
FROM users ORDER BY display_name LIMIT $1 OFFSET $2;

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
