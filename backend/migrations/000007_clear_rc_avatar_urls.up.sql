-- Clear broken RocketChat avatar URLs that cause CORS errors.
-- The frontend falls back to displaying user initials when avatar_url is NULL.
UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE '%chat.geovendas.com/avatar/%';
