-- New columns on channels
ALTER TABLE channels ADD COLUMN read_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN retention_days INTEGER DEFAULT NULL;
ALTER TABLE channels ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT NOW();

-- New column on channel_members
ALTER TABLE channel_members ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- New column on users
ALTER TABLE users ADD COLUMN auto_hide_days INTEGER NOT NULL DEFAULT 0;

-- Message audit log table
CREATE TABLE message_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    message_created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by VARCHAR(20) NOT NULL
);
CREATE INDEX idx_audit_log_channel ON message_audit_log(channel_id);
CREATE INDEX idx_audit_log_deleted_at ON message_audit_log(deleted_at);

-- Seed default config entries
INSERT INTO app_config (key, value) VALUES
    ('message_edit_timeout', '{"seconds": 900}'),
    ('retention_policy', '{"default_days": 0, "minimum_days": 7}')
ON CONFLICT (key) DO NOTHING;

-- Backfill last_message_at from existing messages
UPDATE channels c SET last_message_at = sub.last_msg
FROM (
    SELECT channel_id, MAX(created_at) AS last_msg
    FROM messages
    GROUP BY channel_id
) sub
WHERE c.id = sub.channel_id AND sub.last_msg IS NOT NULL;
