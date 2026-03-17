-- Normalize storage_path and thumbnail_path in files from absolute paths
-- (e.g. /data/uploads/2026/03/uuid.png) to relative keys (2026/03/uuid.png).
--
-- Strategy: strip any leading path up to and including the upload root.
-- We match on the year-partitioned pattern /YYYY/MM/ to find where the
-- relative key starts, making this robust to any upload dir configuration.

UPDATE files
SET storage_path = regexp_replace(storage_path, '^.*/(\d{4}/\d{2}/.+)$', '\1')
WHERE storage_path ~ '^/.*/\d{4}/\d{2}/.+$';

UPDATE files
SET thumbnail_path = regexp_replace(thumbnail_path, '^.*/(\d{4}/\d{2}/.+)$', '\1')
WHERE thumbnail_path IS NOT NULL
  AND thumbnail_path ~ '^/.*/\d{4}/\d{2}/.+$';

-- Normalize custom_emojis.storage_path (strip directory prefix, keep filename only)
UPDATE custom_emojis
SET storage_path = regexp_replace(storage_path, '^.*/([^/]+)$', '\1')
WHERE storage_path LIKE '/%';
