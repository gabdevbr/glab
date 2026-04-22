DROP TABLE IF EXISTS rc_sync_cursor;
DROP INDEX IF EXISTS idx_files_rc_file_id;
DROP INDEX IF EXISTS idx_messages_rc_message_id;
DROP INDEX IF EXISTS idx_channels_rc_room_id;

ALTER TABLE files DROP COLUMN IF EXISTS rc_file_id;
ALTER TABLE messages DROP COLUMN IF EXISTS rc_message_id;
ALTER TABLE channels DROP COLUMN IF EXISTS rc_room_id;
ALTER TABLE users DROP COLUMN IF EXISTS local_auth_ready;
ALTER TABLE users DROP COLUMN IF EXISTS rc_last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS rc_token_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS rc_auth_token_enc;

DELETE FROM app_config WHERE key = 'rc_bridge';
