package migration

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Loader handles bulk inserts into the Glab database.
// Uses the backend's shared connection pool.
type Loader struct {
	pool      *pgxpool.Pool
	uploadDir string
}

func NewLoader(pool *pgxpool.Pool, uploadDir string) *Loader {
	return &Loader{pool: pool, uploadDir: uploadDir}
}

func (l *Loader) UpsertUsers(ctx context.Context, users []GlabUser) error {
	if len(users) == 0 {
		return nil
	}

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

	return nil
}

func (l *Loader) UpsertChannels(ctx context.Context, channels []GlabChannel) error {
	if len(channels) == 0 {
		return nil
	}

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

	return nil
}

func (l *Loader) UpsertMembers(ctx context.Context, members []GlabMember) error {
	if len(members) == 0 {
		return nil
	}

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

	return nil
}

func (l *Loader) LoadRoomData(ctx context.Context, msgs []GlabMessage, reactions []GlabReaction, mentions []GlabMention) error {
	if len(msgs) == 0 {
		return nil
	}

	tx, err := l.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := l.copyMessagesIdempotent(ctx, tx, msgs); err != nil {
		return fmt.Errorf("loading messages: %w", err)
	}

	if err := l.insertReactions(ctx, tx, reactions); err != nil {
		return fmt.Errorf("loading reactions: %w", err)
	}

	if err := l.insertMentions(ctx, tx, mentions); err != nil {
		return fmt.Errorf("loading mentions: %w", err)
	}

	return tx.Commit(ctx)
}

func (l *Loader) copyMessagesIdempotent(ctx context.Context, tx pgx.Tx, msgs []GlabMessage) error {
	if len(msgs) == 0 {
		return nil
	}

	var parents, replies []GlabMessage
	for _, m := range msgs {
		if m.ThreadID == nil {
			parents = append(parents, m)
		} else {
			replies = append(replies, m)
		}
	}

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

	_, err = tx.Exec(ctx, `
		INSERT INTO messages (id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at)
		SELECT id, channel_id, user_id, thread_id, content, content_type, edited_at, is_pinned, created_at
		FROM _msg_staging
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		return fmt.Errorf("inserting parents: %w", err)
	}

	_, err = tx.Exec(ctx, "TRUNCATE _msg_staging")
	if err != nil {
		return fmt.Errorf("truncating staging: %w", err)
	}

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

func messageRows(msgs []GlabMessage) [][]interface{} {
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

func (l *Loader) insertReactions(ctx context.Context, tx pgx.Tx, reactions []GlabReaction) error {
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

func (l *Loader) insertMentions(ctx context.Context, tx pgx.Tx, mentions []GlabMention) error {
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

// SaveEmojiFile saves a custom emoji image to disk and returns the storage path.
func (l *Loader) SaveEmojiFile(name, extension string, body io.ReadCloser) (string, error) {
	dir := filepath.Join(l.uploadDir, "emojis")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("creating emoji dir: %w", err)
	}

	filename := name + "." + extension
	storagePath := filepath.Join(dir, filename)

	f, err := os.Create(storagePath)
	if err != nil {
		return "", fmt.Errorf("creating file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		return "", fmt.Errorf("writing file: %w", err)
	}

	return storagePath, nil
}

func (l *Loader) RebuildThreadSummaries(ctx context.Context) error {
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
	return err
}

func (l *Loader) RefreshSearchIndexes(ctx context.Context) error {
	query := `UPDATE messages SET content = content WHERE search_vector IS NULL`
	_, err := l.pool.Exec(ctx, query)
	return err
}
