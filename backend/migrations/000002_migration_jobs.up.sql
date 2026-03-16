-- Migration jobs track each migration run.
CREATE TABLE migration_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    config JSONB NOT NULL DEFAULT '{}',
    started_by UUID REFERENCES users(id),
    phase TEXT NOT NULL DEFAULT '',
    progress JSONB NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-room export state for incremental/resume support (replaces manifest.json).
CREATE TABLE migration_room_state (
    rc_room_id TEXT PRIMARY KEY,
    rc_room_name TEXT NOT NULL DEFAULT '',
    rc_room_type TEXT NOT NULL DEFAULT '',
    message_count INT NOT NULL DEFAULT 0,
    latest_export TIMESTAMPTZ,
    job_id UUID REFERENCES migration_jobs(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log lines emitted during migration runs.
CREATE TABLE migration_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info'
        CHECK (level IN ('debug', 'info', 'warn', 'error')),
    phase TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_logs_job_id ON migration_logs (job_id, id);
