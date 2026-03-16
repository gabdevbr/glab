-- Add mention_type to distinguish individual vs group mentions
ALTER TABLE mentions ADD COLUMN mention_type VARCHAR(10) NOT NULL DEFAULT 'user';
-- Values: 'user' (individual @username), 'all' (@all/@channel), 'here' (@here)

-- Prevent reserved keywords from being used as usernames or agent slugs
ALTER TABLE users ADD CONSTRAINT chk_username_not_reserved
  CHECK (username NOT IN ('all', 'here', 'channel'));

ALTER TABLE agents ADD CONSTRAINT chk_slug_not_reserved
  CHECK (slug NOT IN ('all', 'here', 'channel'));
