-- name: UpsertThreadSummary :exec
INSERT INTO thread_summaries (message_id, reply_count, last_reply_at, participant_ids)
VALUES (@message_id, 1, NOW(), ARRAY[@user_id::uuid])
ON CONFLICT (message_id) DO UPDATE SET
    reply_count = thread_summaries.reply_count + 1,
    last_reply_at = NOW(),
    participant_ids = CASE
        WHEN @user_id::uuid = ANY(thread_summaries.participant_ids) THEN thread_summaries.participant_ids
        ELSE array_append(thread_summaries.participant_ids, @user_id::uuid)
    END;

-- name: GetThreadSummary :one
SELECT * FROM thread_summaries WHERE message_id = $1;

-- name: GetThreadSummariesForMessages :many
SELECT * FROM thread_summaries WHERE message_id = ANY($1::uuid[]);
