-- name: AddChannelMember :exec
INSERT INTO channel_members (channel_id, user_id, role)
VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: RemoveChannelMember :exec
DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2;

-- name: GetChannelMembers :many
SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.is_bot, cm.role, cm.joined_at
FROM channel_members cm
JOIN users u ON u.id = cm.user_id
WHERE cm.channel_id = $1
ORDER BY u.display_name;

-- name: IsChannelMember :one
SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2);

-- name: UpdateLastRead :exec
UPDATE channel_members SET last_read_msg_id = $3 WHERE channel_id = $1 AND user_id = $2;

-- name: GetUnreadCount :one
SELECT COUNT(*) FROM messages m
JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
WHERE m.channel_id = $1
  AND (cm.last_read_msg_id IS NULL OR m.created_at > (SELECT created_at FROM messages WHERE id = cm.last_read_msg_id));

-- name: GetChannelMember :one
SELECT * FROM channel_members WHERE channel_id = $1 AND user_id = $2;

-- name: SetChannelHidden :exec
UPDATE channel_members SET hidden = $3, muted = $3 WHERE channel_id = $1 AND user_id = $2;

-- name: UnhideChannel :exec
UPDATE channel_members SET hidden = FALSE WHERE channel_id = $1 AND user_id = $2;

-- name: SetChannelSection :exec
UPDATE channel_members SET section_id = $3 WHERE channel_id = $1 AND user_id = $2;

-- name: ClearChannelSection :exec
UPDATE channel_members SET section_id = NULL WHERE channel_id = $1 AND user_id = $2;

-- name: GetChannelSectionsForUser :many
SELECT cm.channel_id, cm.section_id FROM channel_members cm
WHERE cm.user_id = $1 AND cm.hidden = FALSE AND cm.section_id IS NOT NULL;
