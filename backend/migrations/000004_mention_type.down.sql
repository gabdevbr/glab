ALTER TABLE agents DROP CONSTRAINT IF EXISTS chk_slug_not_reserved;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_username_not_reserved;
ALTER TABLE mentions DROP COLUMN IF EXISTS mention_type;
