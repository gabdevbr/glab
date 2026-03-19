ALTER TABLE users ADD COLUMN IF NOT EXISTS rc_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_rc_user_id ON users (rc_user_id) WHERE rc_user_id IS NOT NULL;
