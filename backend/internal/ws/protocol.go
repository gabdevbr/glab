package ws

import "encoding/json"

// Envelope is the wire format for all WebSocket messages.
type Envelope struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Client -> Server events.
const (
	EventMessageSend    = "message.send"
	EventMessageEdit    = "message.edit"
	EventMessageDelete  = "message.delete"
	EventMessagePin     = "message.pin"
	EventMessageUnpin   = "message.unpin"
	EventReactionAdd    = "reaction.add"
	EventReactionRemove = "reaction.remove"
	EventTypingStart    = "typing.start"
	EventTypingStop     = "typing.stop"
	EventPresenceUpdate = "presence.update"
	EventChannelRead    = "channel.read"
	EventSubscribe      = "subscribe"
	EventUnsubscribe    = "unsubscribe"

	// AI events - Client -> Server
	EventAIPrompt = "ai.prompt" // {agent_slug, session_id?, content}
	EventAIStop   = "ai.stop"   // {agent_slug, channel_id?}
)

// Server -> Client events.
const (
	EventAck             = "ack"
	EventHello           = "hello"
	EventMessageNew      = "message.new"
	EventMessageEdited   = "message.edited"
	EventMessageDeleted  = "message.deleted"
	EventMessagePinned   = "message.pinned"
	EventMessageUnpinned = "message.unpinned"
	EventReactionUpdated = "reaction.updated"
	EventThreadUpdated   = "thread.updated"
	EventTyping          = "typing"
	EventPresence        = "presence"
	EventNotification    = "notification"
	EventChannelNew      = "channel.new"

	// AI events - Server -> Client
	EventAIChunk      = "ai.chunk"       // streaming in channel (broadcast)
	EventAIPanelChunk = "ai.panel.chunk" // streaming in panel (to user only)
	EventAIToolUse    = "ai.tool_use"    // tool use status (future)

	// Migration events - Server -> Client (admin only)
	EventMigrationLog      = "migration.log"
	EventMigrationStatus   = "migration.status"
	EventMigrationProgress = "migration.progress"
)

// --- Client -> Server payloads ---

// MessageSendPayload is sent by the client to create a new message.
type MessageSendPayload struct {
	ChannelID string `json:"channel_id"`
	Content   string `json:"content"`
	ThreadID  string `json:"thread_id,omitempty"`
}

// MessageEditPayload is sent by the client to edit an existing message.
type MessageEditPayload struct {
	MessageID string `json:"message_id"`
	Content   string `json:"content"`
}

// MessageDeletePayload is sent by the client to delete a message.
type MessageDeletePayload struct {
	MessageID string `json:"message_id"`
}

// PinPayload is sent by the client to pin or unpin a message.
type PinPayload struct {
	MessageID string `json:"message_id"`
}

// ReactionPayload is sent by the client to add or remove a reaction.
type ReactionPayload struct {
	MessageID string `json:"message_id"`
	Emoji     string `json:"emoji"`
}

// SubscribePayload is sent by the client to subscribe to channels.
type SubscribePayload struct {
	ChannelIDs []string `json:"channel_ids"`
}

// UnsubscribePayload is sent by the client to unsubscribe from channels.
type UnsubscribePayload struct {
	ChannelIDs []string `json:"channel_ids"`
}

// ChannelReadPayload is sent by the client to mark a channel as read.
type ChannelReadPayload struct {
	ChannelID string `json:"channel_id"`
	MessageID string `json:"message_id"`
}

// TypingPayload is sent by the client to indicate typing status.
type TypingPayload struct {
	ChannelID string `json:"channel_id"`
}

// PresenceUpdatePayload is sent by the client to update their presence status.
type PresenceUpdatePayload struct {
	Status string `json:"status"`
}

// --- Server -> Client payloads ---

// HelloPayload is sent to the client after a successful connection.
type HelloPayload struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Version  string `json:"version"`
}

// AckPayload is sent to the client to acknowledge a request.
type AckPayload struct {
	OK    bool            `json:"ok"`
	Error string          `json:"error,omitempty"`
	Data  json.RawMessage `json:"data,omitempty"`
}

// FilePayload is the file info attached to a message.new event.
type FilePayload struct {
	ID           string `json:"id"`
	MessageID    string `json:"message_id,omitempty"`
	UserID       string `json:"user_id"`
	ChannelID    string `json:"channel_id"`
	Filename     string `json:"filename"`
	OriginalName string `json:"original_name"`
	MimeType     string `json:"mime_type"`
	SizeBytes    int64  `json:"size_bytes"`
	HasThumbnail bool   `json:"has_thumbnail"`
	CreatedAt    string `json:"created_at"`
}

// MessageNewPayload is broadcast when a new message is created.
type MessageNewPayload struct {
	ID          string       `json:"id"`
	ChannelID   string       `json:"channel_id"`
	UserID      string       `json:"user_id"`
	Username    string       `json:"username"`
	DisplayName string       `json:"display_name"`
	AvatarURL   string       `json:"avatar_url,omitempty"`
	Content     string       `json:"content"`
	ContentType string       `json:"content_type"`
	ThreadID    string       `json:"thread_id,omitempty"`
	IsBot       bool         `json:"is_bot"`
	CreatedAt   string       `json:"created_at"`
	File        *FilePayload `json:"file,omitempty"`
}

// MessageEditedPayload is broadcast when a message is edited.
type MessageEditedPayload struct {
	ID              string `json:"id"`
	ChannelID       string `json:"channel_id"`
	Content         string `json:"content"`
	EditedAt        string `json:"edited_at"`
	OriginalContent string `json:"original_content,omitempty"`
}

// MessageDeletedPayload is broadcast when a message is deleted.
type MessageDeletedPayload struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
}

// TypingBroadcast is broadcast to indicate a user's typing status.
type TypingBroadcast struct {
	ChannelID   string `json:"channel_id"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsTyping    bool   `json:"is_typing"`
}

// PresenceBroadcast is broadcast to indicate a user's presence status.
type PresenceBroadcast struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Status   string `json:"status"`
}

// ReactionUpdatedPayload is broadcast when a reaction is added or removed.
type ReactionUpdatedPayload struct {
	MessageID string `json:"message_id"`
	ChannelID string `json:"channel_id"`
	Emoji     string `json:"emoji"`
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Action    string `json:"action"` // "add" or "remove"
}

// ThreadUpdatedPayload is broadcast when a thread summary changes.
type ThreadUpdatedPayload struct {
	MessageID    string `json:"message_id"`
	ChannelID    string `json:"channel_id"`
	ReplyCount   int32  `json:"reply_count"`
	LastReplyAt  string `json:"last_reply_at"`
}

// ChannelNewPayload is sent to a user when they are added to a new channel (e.g. DM creation).
type ChannelNewPayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Type        string `json:"type"`
	CreatedBy   string `json:"created_by"`
	DMUserID    string `json:"dm_user_id,omitempty"`
	DMAvatarURL string `json:"dm_avatar_url,omitempty"`
	MemberCount int    `json:"member_count,omitempty"`
	CreatedAt   string `json:"created_at"`
}

// --- AI payloads ---

// AIPromptPayload is sent by the client to request an AI response.
type AIPromptPayload struct {
	AgentSlug string `json:"agent_slug"`
	SessionID string `json:"session_id,omitempty"`
	Content   string `json:"content"`
}

// AIStopPayload is sent by the client to cancel an active AI stream.
type AIStopPayload struct {
	AgentSlug string `json:"agent_slug"`
	ChannelID string `json:"channel_id,omitempty"`
}

// AIChunkPayload is broadcast when an AI agent streams a response in a channel.
type AIChunkPayload struct {
	ChannelID  string `json:"channel_id"`
	AgentSlug  string `json:"agent_slug"`
	AgentName  string `json:"agent_name"`
	AgentEmoji string `json:"agent_emoji"`
	Content    string `json:"content"`
	Done       bool   `json:"done"`
	MessageID  string `json:"message_id,omitempty"`
}

// AIPanelChunkPayload is sent to a specific user when streaming in the agent panel.
type AIPanelChunkPayload struct {
	AgentSlug string `json:"agent_slug"`
	SessionID string `json:"session_id"`
	Content   string `json:"content"`
	Done      bool   `json:"done"`
	MessageID string `json:"message_id,omitempty"`
}

// MakeEnvelope creates an Envelope with the given event type and payload.
func MakeEnvelope(eventType string, payload interface{}) (Envelope, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{
		Type:    eventType,
		Payload: raw,
	}, nil
}
