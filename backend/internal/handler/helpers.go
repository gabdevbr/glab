package handler

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/geovendas/glab/backend/internal/repository"
)

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
	ID          string `json:"id"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Role        string `json:"role"`
	Status      string `json:"status"`
	LastSeen    string `json:"last_seen,omitempty"`
	IsBot       bool   `json:"is_bot"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// userToResponse converts a repository.User to a safe UserResponse.
func userToResponse(u repository.User) UserResponse {
	return UserResponse{
		ID:          uuidToString(u.ID),
		Username:    u.Username,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		AvatarURL:   u.AvatarUrl.String,
		Role:        u.Role,
		Status:      u.Status,
		LastSeen:    timestampToString(u.LastSeen),
		IsBot:       u.IsBot,
		CreatedAt:   timestampToString(u.CreatedAt),
		UpdatedAt:   timestampToString(u.UpdatedAt),
	}
}

// ChannelResponse is the JSON representation of a channel.
type ChannelResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description,omitempty"`
	Type        string `json:"type"`
	Topic       string `json:"topic,omitempty"`
	CreatedBy   string `json:"created_by"`
	IsArchived  bool   `json:"is_archived"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	MemberCount int    `json:"member_count,omitempty"`
}

// channelToResponse converts a repository.Channel to ChannelResponse.
func channelToResponse(c repository.Channel) ChannelResponse {
	return ChannelResponse{
		ID:          uuidToString(c.ID),
		Name:        c.Name,
		Slug:        c.Slug,
		Description: c.Description.String,
		Type:        c.Type,
		Topic:       c.Topic.String,
		CreatedBy:   uuidToString(c.CreatedBy),
		IsArchived:  c.IsArchived,
		CreatedAt:   timestampToString(c.CreatedAt),
		UpdatedAt:   timestampToString(c.UpdatedAt),
	}
}

// MessageResponse is the JSON representation of a message with user info.
type MessageResponse struct {
	ID          string `json:"id"`
	ChannelID   string `json:"channel_id"`
	UserID      string `json:"user_id"`
	ThreadID    string `json:"thread_id,omitempty"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
	EditedAt    string `json:"edited_at,omitempty"`
	IsPinned    bool   `json:"is_pinned"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	IsBot       bool   `json:"is_bot"`
}
