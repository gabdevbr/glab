-- name: CreateFile :one
INSERT INTO files (message_id, user_id, channel_id, filename, original_name, mime_type, size_bytes, storage_path, thumbnail_path)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;

-- name: GetFileByID :one
SELECT * FROM files WHERE id = $1;

-- name: ListFilesByMessage :many
SELECT * FROM files WHERE message_id = $1;

-- name: ListFilesByChannel :many
SELECT * FROM files WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: ListFilesByMessageIDs :many
SELECT * FROM files WHERE message_id = ANY(@message_ids::uuid[]);
