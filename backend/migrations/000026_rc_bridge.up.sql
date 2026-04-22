-- RC Bridge: realtime RocketChat integration schema

-- Per-user RC session data
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rc_auth_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS rc_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rc_last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS local_auth_ready BOOLEAN NOT NULL DEFAULT FALSE;

-- Entity correlation: channels ↔ RC rooms
ALTER TABLE channels ADD COLUMN IF NOT EXISTS rc_room_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_rc_room_id ON channels(rc_room_id) WHERE rc_room_id IS NOT NULL;

-- Entity correlation: messages ↔ RC messages (loop prevention)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS rc_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_rc_message_id ON messages(rc_message_id) WHERE rc_message_id IS NOT NULL;

-- Entity correlation: files ↔ RC files
ALTER TABLE files ADD COLUMN IF NOT EXISTS rc_file_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_rc_file_id ON files(rc_file_id) WHERE rc_file_id IS NOT NULL;

-- Per-user/per-room sync cursor for resume after reconnection
CREATE TABLE IF NOT EXISTS rc_sync_cursor (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rc_room_id  TEXT        NOT NULL,
    last_seen_ts TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, rc_room_id)
);

-- Default app_config entry for the bridge (single JSON blob read by ConfigService).
-- The service returns defaultConfig() when this key is absent, so this insert is
-- only needed to make the row visible in the admin panel on first boot.
INSERT INTO app_config (key, value) VALUES
    ('rc_bridge', '{"enabled":false,"url":"https://chat.geovendas.com","login_mode":"dual","sync_scope":"all_user_rooms","max_concurrent_sessions":500,"outbound_enabled":true}')
ON CONFLICT (key) DO NOTHING;
