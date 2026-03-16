-- name: CreateMigrationJob :one
INSERT INTO migration_jobs (status, config, started_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetMigrationJob :one
SELECT * FROM migration_jobs WHERE id = $1;

-- name: GetLatestMigrationJob :one
SELECT * FROM migration_jobs ORDER BY created_at DESC LIMIT 1;

-- name: GetRunningMigrationJob :one
SELECT * FROM migration_jobs WHERE status = 'running' LIMIT 1;

-- name: UpdateMigrationJobStatus :exec
UPDATE migration_jobs
SET status = $2, error = $3, updated_at = NOW(),
    started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END
WHERE id = $1;

-- name: UpdateMigrationJobPhase :exec
UPDATE migration_jobs
SET phase = $2, progress = $3, updated_at = NOW()
WHERE id = $1;

-- name: ListMigrationJobs :many
SELECT * FROM migration_jobs ORDER BY created_at DESC LIMIT $1;

-- name: UpsertMigrationRoomState :exec
INSERT INTO migration_room_state (rc_room_id, rc_room_name, rc_room_type, message_count, latest_export, job_id, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (rc_room_id) DO UPDATE SET
    rc_room_name = EXCLUDED.rc_room_name,
    message_count = migration_room_state.message_count + EXCLUDED.message_count,
    latest_export = EXCLUDED.latest_export,
    job_id = EXCLUDED.job_id,
    updated_at = NOW();

-- name: GetMigrationRoomState :one
SELECT * FROM migration_room_state WHERE rc_room_id = $1;

-- name: ListMigrationRoomStates :many
SELECT * FROM migration_room_state ORDER BY rc_room_name;

-- name: CreateMigrationLog :one
INSERT INTO migration_logs (job_id, level, phase, message, detail)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, created_at;

-- name: ListMigrationLogs :many
SELECT * FROM migration_logs
WHERE job_id = $1 AND id > $2
ORDER BY id
LIMIT $3;

-- name: CountMigrationLogs :one
SELECT COUNT(*) FROM migration_logs WHERE job_id = $1;
