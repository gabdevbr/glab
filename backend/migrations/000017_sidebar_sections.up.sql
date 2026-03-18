CREATE TABLE sidebar_sections (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sidebar_sections_user ON sidebar_sections(user_id, position);

ALTER TABLE channel_members ADD COLUMN section_id UUID REFERENCES sidebar_sections(id) ON DELETE SET NULL;
