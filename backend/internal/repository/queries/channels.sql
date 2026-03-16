-- name: GetChannelByID :one
SELECT * FROM channels WHERE id = $1;

-- name: GetChannelBySlug :one
SELECT * FROM channels WHERE slug = $1;

-- name: ListChannelsForUser :many
SELECT c.* FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1 AND c.is_archived = FALSE
ORDER BY c.name;

-- name: ListPublicChannels :many
SELECT * FROM channels WHERE type = 'public' AND is_archived = FALSE ORDER BY name;

-- name: CreateChannel :one
INSERT INTO channels (name, slug, description, type, topic, created_by)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: UpdateChannel :one
UPDATE channels SET
    name = coalesce(sqlc.narg('name'), name),
    description = coalesce(sqlc.narg('description'), description),
    topic = coalesce(sqlc.narg('topic'), topic),
    is_archived = coalesce(sqlc.narg('is_archived'), is_archived)
WHERE id = $1 RETURNING *;

-- name: DeleteChannel :exec
DELETE FROM channels WHERE id = $1;

-- name: GetDMChannel :one
SELECT c.* FROM channels c
JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.user_id = $1
JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id = $2
WHERE c.type = 'dm';
