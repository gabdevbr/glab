package handler

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// requireScope checks that the current request has the given API scope.
// JWT sessions always pass. API tokens must have the scope.
func requireScope(r *http.Request, scope string) bool {
	claims := auth.UserFromContext(r.Context())
	return auth.HasScope(claims, scope)
}

// requireChannelMember checks that the authenticated user is a member of the channel.
// Public channels are accessible to all authenticated users.
// Private and DM channels require membership.
func requireChannelMember(ctx context.Context, queries *repository.Queries, channelID pgtype.UUID, userID string) (int, error) {
	// Fetch channel to check type
	ch, err := queries.GetChannelByID(ctx, channelID)
	if err != nil {
		return http.StatusNotFound, fmt.Errorf("channel not found")
	}

	// Public channels: any authenticated user can access
	if ch.Type == "public" {
		return 0, nil
	}

	// Private/DM: require membership
	uid, err := parseUUID(userID)
	if err != nil {
		return http.StatusInternalServerError, fmt.Errorf("invalid user id")
	}

	isMember, err := queries.IsChannelMember(ctx, repository.IsChannelMemberParams{
		ChannelID: channelID,
		UserID:    uid,
	})
	if err != nil {
		return http.StatusInternalServerError, fmt.Errorf("failed to check membership")
	}

	if !isMember {
		return http.StatusForbidden, fmt.Errorf("not a member of this channel")
	}

	return 0, nil
}

// enrichMessagesWithFiles loads file records for any file-type messages and attaches them.
func enrichMessagesWithFiles(ctx context.Context, queries *repository.Queries, msgs []MessageResponse) {
	var fileMessageIDs []pgtype.UUID
	idxMap := make(map[string]int) // message ID string -> index in msgs

	for i, m := range msgs {
		if m.ContentType == "file" {
			uid, err := parseUUID(m.ID)
			if err == nil {
				fileMessageIDs = append(fileMessageIDs, uid)
				idxMap[m.ID] = i
			}
		}
	}

	if len(fileMessageIDs) == 0 {
		return
	}

	files, err := queries.ListFilesByMessageIDs(ctx, fileMessageIDs)
	if err != nil {
		return
	}

	for _, f := range files {
		msgIDStr := uuidToString(f.MessageID)
		if idx, ok := idxMap[msgIDStr]; ok {
			fr := fileToResponse(f)
			msgs[idx].File = &fr
		}
	}
}

// enrichMessagesWithReactions loads reactions for all messages and attaches them.
func enrichMessagesWithReactions(ctx context.Context, queries *repository.Queries, msgs []MessageResponse) {
	if len(msgs) == 0 {
		return
	}

	ids := make([]pgtype.UUID, len(msgs))
	idxMap := make(map[string]int, len(msgs))
	for i, m := range msgs {
		uid, err := parseUUID(m.ID)
		if err != nil {
			continue
		}
		ids[i] = uid
		idxMap[m.ID] = i
	}

	reactions, err := queries.GetReactionsForMessages(ctx, ids)
	if err != nil {
		return
	}

	for _, r := range reactions {
		msgIDStr := uuidToString(r.MessageID)
		if idx, ok := idxMap[msgIDStr]; ok {
			msgs[idx].Reactions = append(msgs[idx].Reactions, ReactionResponse{
				Emoji:    r.Emoji,
				UserID:   uuidToString(r.UserID),
				Username: r.Username,
			})
		}
	}

	// Ensure all messages have a non-nil reactions slice (empty array in JSON)
	for i := range msgs {
		if msgs[i].Reactions == nil {
			msgs[i].Reactions = []ReactionResponse{}
		}
	}
}

// enrichMessagesWithThreadSummaries loads thread summaries for all messages and attaches them.
func enrichMessagesWithThreadSummaries(ctx context.Context, queries *repository.Queries, msgs []MessageResponse) {
	if len(msgs) == 0 {
		return
	}

	ids := make([]pgtype.UUID, 0, len(msgs))
	idxMap := make(map[string]int, len(msgs))
	for i, m := range msgs {
		uid, err := parseUUID(m.ID)
		if err != nil {
			continue
		}
		ids = append(ids, uid)
		idxMap[m.ID] = i
	}

	summaries, err := queries.GetThreadSummariesForMessages(ctx, ids)
	if err != nil {
		return
	}

	for _, s := range summaries {
		msgIDStr := uuidToString(s.MessageID)
		if idx, ok := idxMap[msgIDStr]; ok {
			msgs[idx].ThreadSummary = &ThreadSummaryResponse{
				ReplyCount:  s.ReplyCount,
				LastReplyAt: timestampToString(s.LastReplyAt),
			}
		}
	}
}

// respondJSON writes a JSON response with the given status code.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

// respondError writes a JSON error response.
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// parseBody decodes the request body JSON into v.
func parseBody(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// parseUUID converts a UUID string to pgtype.UUID.
func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	// Remove hyphens
	clean := ""
	for _, c := range s {
		if c != '-' {
			clean += string(c)
		}
	}
	if len(clean) != 32 {
		return u, fmt.Errorf("invalid UUID: %s", s)
	}
	b, err := hex.DecodeString(clean)
	if err != nil {
		return u, fmt.Errorf("invalid UUID hex: %w", err)
	}
	copy(u.Bytes[:], b)
	u.Valid = true
	return u, nil
}

// uuidToString formats a pgtype.UUID as a standard UUID string.
func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// timestampToString formats a pgtype.Timestamptz as RFC3339, or empty string if invalid.
func timestampToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.Format(time.RFC3339)
}

// UserResponse is the safe JSON representation of a user (no password_hash).
type UserResponse struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	DisplayName  string `json:"display_name"`
	AvatarURL    string `json:"avatar_url,omitempty"`
	Role         string `json:"role"`
	Status       string `json:"status"`
	LastSeen     string `json:"last_seen,omitempty"`
	IsBot        bool   `json:"is_bot"`
	AutoHideDays int32  `json:"auto_hide_days"`
	ChannelSort  string `json:"channel_sort"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// resolveAvatarURL transforms a storage key like "avatars/{id}.png" into
// the public serving URL "/api/v1/users/{id}/avatar". External URLs pass through.
func resolveAvatarURL(raw string, userID string) string {
	if strings.HasPrefix(raw, "avatars/") {
		return "/api/v1/users/" + userID + "/avatar"
	}
	return raw
}

// userToResponse converts a repository.User to a safe UserResponse.
func userToResponse(u repository.User) UserResponse {
	uid := uuidToString(u.ID)
	return UserResponse{
		ID:           uid,
		Username:     u.Username,
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		AvatarURL:    resolveAvatarURL(u.AvatarUrl.String, uid),
		Role:         u.Role,
		Status:       u.Status,
		LastSeen:     timestampToString(u.LastSeen),
		IsBot:        u.IsBot,
		AutoHideDays: u.AutoHideDays,
		ChannelSort:  u.ChannelSort,
		CreatedAt:    timestampToString(u.CreatedAt),
		UpdatedAt:    timestampToString(u.UpdatedAt),
	}
}

// ChannelResponse is the JSON representation of a channel.
type ChannelResponse struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Description   string `json:"description,omitempty"`
	Type          string `json:"type"`
	Topic         string `json:"topic,omitempty"`
	CreatedBy     string `json:"created_by"`
	IsArchived    bool   `json:"is_archived"`
	ReadOnly      bool   `json:"read_only"`
	RetentionDays *int32 `json:"retention_days,omitempty"`
	LastMessageAt string `json:"last_message_at,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
	MemberCount   int    `json:"member_count,omitempty"`
	UnreadCount   int32  `json:"unread_count"`
	IsPinned      bool   `json:"is_pinned"`
	DMUserID      string `json:"dm_user_id,omitempty"`
	DMAvatarURL   string `json:"dm_avatar_url,omitempty"`
}

// channelToResponse converts a repository.Channel to ChannelResponse.
func channelToResponse(c repository.Channel) ChannelResponse {
	resp := ChannelResponse{
		ID:          uuidToString(c.ID),
		Name:        c.Name,
		Slug:        c.Slug,
		Description: c.Description.String,
		Type:        c.Type,
		Topic:       c.Topic.String,
		CreatedBy:   uuidToString(c.CreatedBy),
		IsArchived:  c.IsArchived,
		ReadOnly:      c.ReadOnly,
		LastMessageAt: timestampToString(c.LastMessageAt),
		CreatedAt:     timestampToString(c.CreatedAt),
		UpdatedAt:     timestampToString(c.UpdatedAt),
	}
	if c.RetentionDays.Valid {
		v := c.RetentionDays.Int32
		resp.RetentionDays = &v
	}
	return resp
}

// channelRowToResponse converts a ListChannelsForUserRow (with unread count) to ChannelResponse.
func channelRowToResponse(c repository.ListChannelsForUserRow) ChannelResponse {
	resp := ChannelResponse{
		ID:            uuidToString(c.ID),
		Name:          c.Name,
		Slug:          c.Slug,
		Description:   c.Description.String,
		Type:          c.Type,
		Topic:         c.Topic.String,
		CreatedBy:     uuidToString(c.CreatedBy),
		IsArchived:    c.IsArchived,
		ReadOnly:      c.ReadOnly,
		LastMessageAt: timestampToString(c.LastMessageAt),
		CreatedAt:     timestampToString(c.CreatedAt),
		UpdatedAt:     timestampToString(c.UpdatedAt),
		UnreadCount:   c.UnreadCount,
		IsPinned:      c.IsPinned,
	}
	if c.RetentionDays.Valid {
		v := c.RetentionDays.Int32
		resp.RetentionDays = &v
	}
	return resp
}

// SectionResponse is the JSON representation of a sidebar section.
type SectionResponse struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Position   int32    `json:"position"`
	ChannelIDs []string `json:"channel_ids"`
}

// MessageResponse is the JSON representation of a message with user info.
type MessageResponse struct {
	ID          string        `json:"id"`
	ChannelID   string        `json:"channel_id"`
	UserID      string        `json:"user_id"`
	ThreadID    string        `json:"thread_id,omitempty"`
	Content     string        `json:"content"`
	ContentType string        `json:"content_type"`
	EditedAt    string        `json:"edited_at,omitempty"`
	IsPinned    bool          `json:"is_pinned"`
	CreatedAt   string        `json:"created_at"`
	UpdatedAt   string        `json:"updated_at"`
	Username    string        `json:"username"`
	DisplayName string        `json:"display_name"`
	AvatarURL   string        `json:"avatar_url,omitempty"`
	IsBot           bool                   `json:"is_bot"`
	OriginalContent string                 `json:"original_content,omitempty"`
	File            *FileResponse          `json:"file,omitempty"`
	Reactions       []ReactionResponse     `json:"reactions"`
	ThreadSummary   *ThreadSummaryResponse `json:"thread_summary,omitempty"`
}

// ThreadSummaryResponse is the JSON representation of a thread summary.
type ThreadSummaryResponse struct {
	ReplyCount  int32  `json:"reply_count"`
	LastReplyAt string `json:"last_reply_at"`
}

// ReactionResponse is the JSON representation of a reaction.
type ReactionResponse struct {
	Emoji    string `json:"emoji"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
}
