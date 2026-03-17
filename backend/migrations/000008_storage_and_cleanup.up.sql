-- Runtime config table (mutable via admin panel — NOT env vars)
CREATE TABLE app_config (
    key        VARCHAR(100) PRIMARY KEY,
    value      JSONB        NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by UUID         REFERENCES users(id)
);

-- Default configs: storage backend and AI gateway
INSERT INTO app_config (key, value) VALUES
  ('storage',    '{"backend":"local","local":{"base_dir":"/data/uploads"},"s3":{}}'::jsonb),
  ('ai_gateway', '{"url":"","token":"","default_model":"anthropic/claude-sonnet-4-6"}'::jsonb);

-- Track which backend each file lives on (supports mixed-backend during migration)
ALTER TABLE files ADD COLUMN storage_backend VARCHAR(20) NOT NULL DEFAULT 'local';

-- Remove hardcoded gateway default from agents schema
ALTER TABLE agents ALTER COLUMN gateway_url SET DEFAULT '';
