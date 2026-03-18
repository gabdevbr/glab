package loader

import (
	"context"
	"fmt"
	"log"

	"github.com/gabdevbr/glab/migrate/internal/transform"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Loader handles bulk inserts into the Glab database.
type Loader struct {
	pool *pgxpool.Pool
}

// NewLoader creates a new database loader.
func NewLoader(pool *pgxpool.Pool) *Loader {
	return &Loader{pool: pool}
}

// UpsertUsers inserts users with ON CONFLICT DO UPDATE for idempotent re-runs.
func (l *Loader) UpsertUsers(ctx context.Context, users []transform.GlabUser) error {
	if len(users) == 0 {
		return nil
	}

	log.Printf("Upserting %d users...", len(users))

	batch := &pgx.Batch{}
	for _, u := range users {
		batch.Queue(`
			INSERT INTO users (id, username, email, display_name, avatar_url, password_hash, role, status, last_seen, is_bot, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			ON CONFLICT (id) DO UPDATE SET
				display_name = EXCLUDED.display_name,
				avatar_url = EXCLUDED.avatar_url,
				email = EXCLUDED.email
		`, u.ID, u.Username, u.Email, u.DisplayName, u.AvatarURL,
			u.PasswordHash, u.Role, u.Status, u.LastSeen, u.IsBot, u.CreatedAt)
	}

	br := l.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range users {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upserting user: %w", err)
		}
	}

	log.Printf("Upserted %d users", len(users))
	return nil
}

// UpsertChannels inserts channels with ON CONFLICT for idempotent re-runs.
func (l *Loader) UpsertChannels(ctx context.Context, channels []transform.GlabChannel) error {
	if len(channels) == 0 {
		return nil
	}

	log.Printf("Upserting %d channels...", len(channels))

	batch := &pgx.Batch{}
	for _, ch := range channels {
		batch.Queue(`
			INSERT INTO channels (id, name, slug, description, type, topic, created_by, is_archived, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				topic = EXCLUDED.topic
		`, ch.ID, ch.Name, ch.Slug, ch.Description, ch.Type,
			ch.Topic, ch.CreatedBy, ch.IsArchived, ch.CreatedAt)
	}

	br := l.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range channels {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upserting channel: %w", err)
		}
	}

	log.Printf("Upserted %d channels", len(channels))
	return nil
}

// UpsertMembers inserts memberships with ON CONFLICT DO NOTHING.
func (l *Loader) UpsertMembers(ctx context.Context, members []transform.GlabMember) error {
	if len(members) == 0 {
		return nil
	}

	log.Printf("Upserting %d memberships...", len(members))

	batch := &pgx.Batch{}
	for _, m := range members {
		batch.Queue(`
			INSERT INTO channel_members (channel_id, user_id, role, joined_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT DO NOTHING
		`, m.ChannelID, m.UserID, m.Role, m.JoinedAt)
	}

	br := l.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range members {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upserting member: %w", err)
		}
	}

	log.Printf("Upserted %d memberships", len(members))
	return nil
}

// LoadRoomData loads messages, reactions, and mentions for a single room.
// Uses temp table + COPY for messages (speed) and batch INSERT for reactions/mentions.
// All operations use ON CONFLICT DO NOTHING for idempotent re-runs.
func (l *Loader) LoadRoomData(ctx context.Context, msgs []transform.GlabMessage, reactions []transform.GlabReaction, mentions []transform.GlabMention) error {
	if len(msgs) == 0 {
		return nil
	}

	// Use a transaction so either all room data loads or none.
	tx, err := l.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Load messages via temp table + COPY + INSERT ON CONFLICT.
	if err := l.copyMessagesIdempotent(ctx, tx, msgs); err != nil {
		return fmt.Errorf("loading messages: %w", err)
	}

	// Load reactions via batch INSERT ON CONFLICT.
	if err := l.insertReactions(ctx, tx, reactions); err != nil {
		return fmt.Errorf("loading reactions: %w", err)
	}

	// Load mentions via batch INSERT ON CONFLICT.
	if err := l.insertMentions(ctx, tx, mentions); err != nil {
		return fmt.Errorf("loading mentions: %w", err)
	}

	return tx.Commit(ctx)
}

// copyMessagesIdempotent uses: CREATE TEMP TABLE → COPY → INSERT ON CONFLICT.
func (l *Loader) copyMessagesIdempotent(ctx context.Context, tx pgx.Tx, msgs []transform.GlabMessage) error {
	if len(msgs) == 0 {
		return nil
	}

	// Separate parents from thread replies for FK ordering.
	var parents, replies []transform.GlabMessage
	for _, m := range msgs {
		if m.ThreadID == nil {
			parents = append(parents, m)
		} else {
			replies = append(replies, m)
		}
	}

	// Create temp staging table.
	_, err := tx.Exec(ctx, `
		CREATE TEMP TABLE _msg_staging (
			id UUID,
			channel_id UUID,
			user_id UUID,
			thread_id UUID,
			content TEXT,
			content_type TEXT,
			edited_at TIMESTAMPTZ,
			is_pinned BOOLEAN,
			created_at TIMESTAMPTZ
		) ON COMMIT DROP
	`)
	if err != nil {
		return fmt.Errorf("creating temp table: %w", err)
	}

	// COPY parents to staging.
	if len(parents) > 0 {
		rows := messageRows(parents)
		_, err := tx.CopyFrom(ctx,
			pgx.Identifier{"_msg_staging"},
			[]string{"id", "channel_id", "user_id", "thread_id", "content", "content_type", "edited_at", "is_pinned", "created_at"},
			pgx.CopyFromRows(rows),
		)
		if err != nil {
			return fmt.Errorf("COPY parents to staging: %w", err)
		}
	}

	// Insert parents from staging to messages (ON CONFLICT DO NOTHING).
	_, err = tx.Exec(ctx, `
		INSERT INTO messages (id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at)
		SELECT id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at
		FROM _msg_staging
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		return fmt.Errorf("inserting parents: %w", err)
	}

	// Clear staging for replies.
	_, err = tx.Exec(ctx, "TRUNCATE _msg_staging")
	if err != nil {
		return fmt.Errorf("truncating staging: %w", err)
	}

	// COPY replies to staging.
	if len(replies) > 0 {
		rows := messageRows(replies)
		_, err := tx.CopyFrom(ctx,
			pgx.Identifier{"_msg_staging"},
			[]string{"id", "channel_id", "user_id", "thread_id", "content", "content_type", "edited_at", "is_pinned", "created_at"},
			pgx.CopyFromRows(rows),
		)
		if err != nil {
			return fmt.Errorf("COPY replies to staging: %w", err)
		}

		// Insert replies.
		_, err = tx.Exec(ctx, `
			INSERT INTO messages (id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at)
			SELECT id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at
			FROM _msg_staging
			ON CONFLICT (id) DO NOTHING
		`)
		if err != nil {
			return fmt.Errorf("inserting replies: %w", err)
		}
	}

	return nil
}

func messageRows(msgs []transform.GlabMessage) [][]interface{} {
	rows := make([][]interface{}, len(msgs))
	for i, m := range msgs {
		var threadID interface{}
		if m.ThreadID != nil {
			threadID = *m.ThreadID
		}
		var editedAt interface{}
		if m.EditedAt != nil {
			editedAt = *m.EditedAt
		}
		rows[i] = []interface{}{
			m.ID, m.ChannelID, m.UserID, threadID, m.Content,
			m.ContentType, editedAt, m.IsPinned, m.CreatedAt,
		}
	}
	return rows
}

// insertReactions uses batch INSERT ON CONFLICT DO NOTHING.
func (l *Loader) insertReactions(ctx context.Context, tx pgx.Tx, reactions []transform.GlabReaction) error {
	if len(reactions) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, r := range reactions {
		batch.Queue(`
			INSERT INTO reactions (message_id, user_id, emoji, created_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT DO NOTHING
		`, r.MessageID, r.UserID, r.Emoji, r.CreatedAt)
	}

	br := tx.SendBatch(ctx, batch)
	defer br.Close()

	for range reactions {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("inserting reaction: %w", err)
		}
	}

	return nil
}

// insertMentions uses batch INSERT ON CONFLICT DO NOTHING.
func (l *Loader) insertMentions(ctx context.Context, tx pgx.Tx, mentions []transform.GlabMention) error {
	if len(mentions) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, m := range mentions {
		batch.Queue(`
			INSERT INTO mentions (id, message_id, user_id, channel_id, created_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING
		`, m.ID, m.MessageID, m.UserID, m.ChannelID, m.CreatedAt)
	}

	br := tx.SendBatch(ctx, batch)
	defer br.Close()

	for range mentions {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("inserting mention: %w", err)
		}
	}

	return nil
}

// RebuildThreadSummaries recalculates thread_summaries from the imported messages.
func (l *Loader) RebuildThreadSummaries(ctx context.Context) error {
	log.Println("Rebuilding thread summaries...")

	query := `
		INSERT INTO thread_summaries (message_id, reply_count, last_reply_at, participant_ids)
		SELECT
			m.thread_id,
			COUNT(*)::int,
			MAX(m.created_at),
			ARRAY_AGG(DISTINCT m.user_id)
		FROM messages m
		WHERE m.thread_id IS NOT NULL
		GROUP BY m.thread_id
		ON CONFLICT (message_id) DO UPDATE SET
			reply_count = EXCLUDED.reply_count,
			last_reply_at = EXCLUDED.last_reply_at,
			participant_ids = EXCLUDED.participant_ids
	`

	_, err := l.pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("rebuilding thread summaries: %w", err)
	}

	log.Println("Thread summaries rebuilt")
	return nil
}

// RefreshSearchIndexes forces the search_vector trigger to re-fire for all messages.
func (l *Loader) RefreshSearchIndexes(ctx context.Context) error {
	log.Println("Refreshing search indexes (this may take a while)...")

	query := `
		UPDATE messages SET content = content
		WHERE search_vector IS NULL
	`

	result, err := l.pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("refreshing search indexes: %w", err)
	}

	log.Printf("Search indexes refreshed for %d messages", result.RowsAffected())
	return nil
}
