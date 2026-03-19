DROP INDEX IF EXISTS idx_users_rc_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS rc_user_id;
