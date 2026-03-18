-- name: ListSidebarSections :many
SELECT * FROM sidebar_sections WHERE user_id = $1 ORDER BY position;

-- name: CreateSidebarSection :one
INSERT INTO sidebar_sections (user_id, name, position)
VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM sidebar_sections WHERE user_id = $1), 0))
RETURNING *;

-- name: UpdateSidebarSection :exec
UPDATE sidebar_sections SET name = $2 WHERE id = $1 AND user_id = $3;

-- name: DeleteSidebarSection :exec
DELETE FROM sidebar_sections WHERE id = $1 AND user_id = $2;

-- name: UpdateSidebarSectionPosition :exec
UPDATE sidebar_sections SET position = $2 WHERE id = $1 AND user_id = $3;

-- name: GetSidebarSection :one
SELECT * FROM sidebar_sections WHERE id = $1 AND user_id = $2;
