-- name: RegisterDeviceToken :exec
INSERT INTO device_tokens (user_id, token, platform)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, token) DO UPDATE SET updated_at = now();

-- name: UnregisterDeviceToken :exec
DELETE FROM device_tokens WHERE user_id = $1 AND token = $2;

-- name: GetDeviceTokensForUser :many
SELECT * FROM device_tokens WHERE user_id = $1;

-- name: GetDeviceTokensForUsers :many
SELECT * FROM device_tokens WHERE user_id = ANY($1::uuid[]);

-- name: DeleteAllDeviceTokensForUser :exec
DELETE FROM device_tokens WHERE user_id = $1;
