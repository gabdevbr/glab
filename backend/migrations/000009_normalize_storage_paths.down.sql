-- Path normalization is intentionally not reversed.
-- Restoring absolute paths would require knowing the original UPLOAD_DIR,
-- which is not stored in the database.
SELECT 1;
