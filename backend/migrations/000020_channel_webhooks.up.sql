CREATE TABLE IF NOT EXISTS channel_webhooks (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    agent_id   UUID        REFERENCES agents(id) ON DELETE SET NULL,
    name       TEXT        NOT NULL,
    token      TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_by UUID        NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_webhooks_channel ON channel_webhooks(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_webhooks_token   ON channel_webhooks(token);
