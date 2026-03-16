package loader

import (
	"context"
	"fmt"
	"log"

	"github.com/geovendas/glab/migrate/internal/transform"
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

// LoadUsers bulk-inserts users using pgx COPY protocol.
func (l *Loader) LoadUsers(ctx context.Context, users []transform.GlabUser) error {
	if len(users) == 0 {
		return nil
	}

	log.Printf("Loading %d users...", len(users))

	rows := make([][]interface{}, len(users))
	for i, u := range users {
		rows[i] = []interface{}{
			u.ID, u.Username, u.Email, u.DisplayName, u.AvatarURL,
			u.PasswordHash, u.Role, u.Status, u.LastSeen, u.IsBot, u.CreatedAt,
		}
	}

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"users"},
		[]string{"id", "username", "email", "display_name", "avatar_url",
			"password_hash", "role", "status", "last_seen", "is_bot", "created_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("COPY users: %w", err)
	}

	log.Printf("Loaded %d users", len(users))
	return nil
}

// LoadChannels bulk-inserts channels.
func (l *Loader) LoadChannels(ctx context.Context, channels []transform.GlabChannel) error {
	if len(channels) == 0 {
		return nil
	}

	log.Printf("Loading %d channels...", len(channels))

	rows := make([][]interface{}, len(channels))
	for i, ch := range channels {
		rows[i] = []interface{}{
			ch.ID, ch.Name, ch.Slug, ch.Description, ch.Type,
			ch.Topic, ch.CreatedBy, ch.IsArchived, ch.CreatedAt,
		}
	}

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"channels"},
		[]string{"id", "name", "slug", "description", "type",
			"topic", "created_by", "is_archived", "created_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("COPY channels: %w", err)
	}

	log.Printf("Loaded %d channels", len(channels))
	return nil
}

// LoadMembers bulk-inserts channel memberships.
func (l *Loader) LoadMembers(ctx context.Context, members []transform.GlabMember) error {
	if len(members) == 0 {
		return nil
	}

	log.Printf("Loading %d memberships...", len(members))

	rows := make([][]interface{}, len(members))
	for i, m := range members {
		rows[i] = []interface{}{
			m.ChannelID, m.UserID, m.Role, m.JoinedAt,
		}
	}

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"channel_members"},
		[]string{"channel_id", "user_id", "role", "joined_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("COPY channel_members: %w", err)
	}

	log.Printf("Loaded %d memberships", len(members))
	return nil
}

// LoadMessages bulk-inserts messages using pgx COPY for maximum throughput.
// Messages are loaded in batches to handle thread FK dependencies:
// parent messages first, then thread replies.
func (l *Loader) LoadMessages(ctx context.Context, messages []transform.GlabMessage) error {
	if len(messages) == 0 {
		return nil
	}

	log.Printf("Loading %d messages...", len(messages))

	// Separate parent messages from thread replies to respect FK ordering.
	var parents, replies []transform.GlabMessage
	for _, m := range messages {
		if m.ThreadID == nil {
			parents = append(parents, m)
		} else {
			replies = append(replies, m)
		}
	}

	if err := l.copyMessages(ctx, parents); err != nil {
		return fmt.Errorf("loading parent messages: %w", err)
	}

	if err := l.copyMessages(ctx, replies); err != nil {
		return fmt.Errorf("loading thread replies: %w", err)
	}

	log.Printf("Loaded %d messages (%d parents, %d replies)", len(messages), len(parents), len(replies))
	return nil
}

func (l *Loader) copyMessages(ctx context.Context, messages []transform.GlabMessage) error {
	if len(messages) == 0 {
		return nil
	}

	rows := make([][]interface{}, len(messages))
	for i, m := range messages {
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

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"messages"},
		[]string{"id", "channel_id", "user_id", "thread_id", "content",
			"content_type", "edited_at", "is_pinned", "created_at"},
		pgx.CopyFromRows(rows),
	)
	return err
}

// LoadReactions bulk-inserts reactions.
func (l *Loader) LoadReactions(ctx context.Context, reactions []transform.GlabReaction) error {
	if len(reactions) == 0 {
		return nil
	}

	log.Printf("Loading %d reactions...", len(reactions))

	rows := make([][]interface{}, len(reactions))
	for i, r := range reactions {
		rows[i] = []interface{}{
			r.MessageID, r.UserID, r.Emoji, r.CreatedAt,
		}
	}

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"reactions"},
		[]string{"message_id", "user_id", "emoji", "created_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("COPY reactions: %w", err)
	}

	log.Printf("Loaded %d reactions", len(reactions))
	return nil
}

// LoadMentions bulk-inserts mentions.
func (l *Loader) LoadMentions(ctx context.Context, mentions []transform.GlabMention) error {
	if len(mentions) == 0 {
		return nil
	}

	log.Printf("Loading %d mentions...", len(mentions))

	rows := make([][]interface{}, len(mentions))
	for i, m := range mentions {
		rows[i] = []interface{}{
			m.ID, m.MessageID, m.UserID, m.ChannelID, m.CreatedAt,
		}
	}

	_, err := l.pool.CopyFrom(ctx,
		pgx.Identifier{"mentions"},
		[]string{"id", "message_id", "user_id", "channel_id", "created_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return fmt.Errorf("COPY mentions: %w", err)
	}

	log.Printf("Loaded %d mentions", len(mentions))
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
// This works by doing a no-op UPDATE on the content column, which triggers the
// messages_search_vector_update() function.
func (l *Loader) RefreshSearchIndexes(ctx context.Context) error {
	log.Println("Refreshing search indexes (this may take a while)...")

	// Process in batches to avoid locking the entire table.
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
