-- Fix DM channel names: replace RC room IDs with participant usernames.
-- DMs migrated from RocketChat had name = rc.ID (a hash) when Name was empty.
UPDATE channels c
SET name = sub.dm_name
FROM (
    SELECT
        cm.channel_id,
        string_agg(u.display_name, ', ' ORDER BY u.display_name) AS dm_name
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    JOIN channels ch ON ch.id = cm.channel_id
    WHERE ch.type = 'dm'
    GROUP BY cm.channel_id
) sub
WHERE c.id = sub.channel_id
  AND c.type = 'dm'
  AND c.name !~ '[a-zA-Z ].*[a-zA-Z ]';
