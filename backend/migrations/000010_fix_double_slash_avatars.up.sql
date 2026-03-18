-- Fix double-slash in avatar URLs caused by trailing slash in RC base URL.
UPDATE users SET avatar_url = REPLACE(avatar_url, '//avatar/', '/avatar/')
WHERE avatar_url LIKE '%//avatar/%';
