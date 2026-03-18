ALTER TABLE channels DROP COLUMN IF EXISTS read_only;
ALTER TABLE channels DROP COLUMN IF EXISTS retention_days;
ALTER TABLE channels DROP COLUMN IF EXISTS last_message_at;
ALTER TABLE channel_members DROP COLUMN IF EXISTS hidden;
ALTER TABLE users DROP COLUMN IF EXISTS auto_hide_days;
DROP TABLE IF EXISTS message_audit_log;
DELETE FROM app_config WHERE key IN ('message_edit_timeout', 'retention_policy');
