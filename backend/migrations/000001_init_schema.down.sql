-- Drop triggers first
DROP TRIGGER IF EXISTS agent_sessions_updated_at ON agent_sessions;
DROP TRIGGER IF EXISTS agents_updated_at ON agents;
DROP TRIGGER IF EXISTS messages_updated_at ON messages;
DROP TRIGGER IF EXISTS channels_updated_at ON channels;
DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP TRIGGER IF EXISTS messages_search_vector_trigger ON messages;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS messages_search_vector_update();

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS agent_usage;
DROP TABLE IF EXISTS agent_sessions;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS thread_summaries;
DROP TABLE IF EXISTS mentions;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS channel_members;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS users;

-- Drop extensions
DROP EXTENSION IF EXISTS "unaccent";
DROP EXTENSION IF EXISTS "uuid-ossp";
