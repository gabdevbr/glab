-- name: CreateCustomEmoji :one
INSERT INTO custom_emojis (name, aliases, mime_type, storage_path)
VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListCustomEmojis :many
SELECT * FROM custom_emojis ORDER BY name;

-- name: GetCustomEmojiByName :one
SELECT * FROM custom_emojis WHERE name = $1;

-- name: UpsertCustomEmoji :one
INSERT INTO custom_emojis (name, aliases, mime_type, storage_path)
VALUES ($1, $2, $3, $4)
ON CONFLICT (name) DO UPDATE SET
    aliases = EXCLUDED.aliases,
    mime_type = EXCLUDED.mime_type,
    storage_path = EXCLUDED.storage_path
RETURNING *;
