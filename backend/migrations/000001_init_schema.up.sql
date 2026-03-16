CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- USERS
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(50)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    avatar_url  TEXT,
    password_hash TEXT NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'agent')),
    status      VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline', 'dnd')),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_bot      BOOLEAN NOT NULL DEFAULT FALSE,
    bot_config  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHANNELS
CREATE TABLE channels (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    type        VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
    topic       TEXT,
    created_by  UUID NOT NULL REFERENCES users(id),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHANNEL MEMBERS
CREATE TABLE channel_members (
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_msg_id UUID,
    muted           BOOLEAN NOT NULL DEFAULT FALSE,
    notifications   VARCHAR(20) NOT NULL DEFAULT 'default' CHECK (notifications IN ('default', 'all', 'mentions', 'none')),
    PRIMARY KEY (channel_id, user_id)
);

-- MESSAGES
CREATE TABLE messages (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id),
    thread_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    content       TEXT NOT NULL,
    content_type  VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'file', 'system')),
    edited_at     TIMESTAMPTZ,
    is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata      JSONB,
    search_vector TSVECTOR,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('portuguese', unaccent(coalesce(NEW.content, '')));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_search_vector_trigger
    BEFORE INSERT OR UPDATE OF content ON messages
    FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();

-- REACTIONS
CREATE TABLE reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);

-- FILES
CREATE TABLE files (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    user_id        UUID NOT NULL REFERENCES users(id),
    channel_id     UUID NOT NULL REFERENCES channels(id),
    filename       VARCHAR(255) NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(100) NOT NULL,
    size_bytes     BIGINT NOT NULL,
    storage_path   TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MENTIONS
CREATE TABLE mentions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THREAD SUMMARIES
CREATE TABLE thread_summaries (
    message_id      UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    reply_count     INTEGER NOT NULL DEFAULT 0,
    last_reply_at   TIMESTAMPTZ,
    participant_ids UUID[] NOT NULL DEFAULT '{}'
);

-- AGENTS
CREATE TABLE agents (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID UNIQUE REFERENCES users(id),
    slug                 VARCHAR(50) NOT NULL UNIQUE,
    name                 VARCHAR(100) NOT NULL,
    emoji                VARCHAR(10),
    avatar_url           TEXT,
    description          TEXT,
    scope                TEXT,
    status               VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    gateway_url          TEXT NOT NULL DEFAULT 'http://192.168.37.206:18789',
    gateway_token        TEXT,
    model                VARCHAR(100) NOT NULL DEFAULT 'anthropic/claude-sonnet-4-6',
    system_prompt        TEXT,
    max_tokens           INTEGER NOT NULL DEFAULT 4096,
    temperature          REAL NOT NULL DEFAULT 0.7,
    bridge_url           TEXT,
    use_bridge           BOOLEAN NOT NULL DEFAULT FALSE,
    max_context_messages INTEGER NOT NULL DEFAULT 20,
    auto_join_channels   TEXT[],
    capabilities         JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AGENT SESSIONS
CREATE TABLE agent_sessions (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title     VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AGENT USAGE
CREATE TABLE agent_usage (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES agents(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    channel_id      UUID,
    session_id      UUID REFERENCES agent_sessions(id),
    message_id      UUID REFERENCES messages(id),
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
    response_time_ms INTEGER NOT NULL DEFAULT 0,
    model_used      VARCHAR(100),
    source          VARCHAR(30) CHECK (source IN ('channel_mention', 'panel_chat')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_messages_channel_created ON messages (channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_messages_search ON messages USING GIN (search_vector);
CREATE INDEX idx_mentions_user_unread ON mentions (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_agent_usage_agent ON agent_usage (agent_id, created_at);
CREATE INDEX idx_channel_members_user ON channel_members (user_id);
CREATE INDEX idx_files_message ON files (message_id);
CREATE INDEX idx_files_channel ON files (channel_id);
CREATE INDEX idx_agent_sessions_agent_user ON agent_sessions (agent_id, user_id);

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agent_sessions_updated_at BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
