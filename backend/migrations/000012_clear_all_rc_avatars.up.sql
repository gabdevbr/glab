-- Clear ALL remaining RocketChat avatar URLs (both single and double slash).
-- Previous migrations (007, 010) missed some due to ordering.
UPDATE users SET avatar_url = NULL
WHERE avatar_url LIKE '%chat.geovendas.com%avatar%';
