-- Add all users to all public, non-archived channels.
-- After RC migration + DB restore, channel_members rows were lost.
INSERT INTO channel_members (channel_id, user_id)
SELECT c.id, u.id
FROM channels c
CROSS JOIN users u
WHERE c.type = 'public' AND c.is_archived = FALSE
ON CONFLICT (channel_id, user_id) DO NOTHING;
