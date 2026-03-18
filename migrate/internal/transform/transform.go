package transform

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/gabdevbr/glab/migrate/internal/rocketchat"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Fixed namespace for deterministic UUID generation.
// Re-running the migration always produces the same UUIDs for the same RC IDs.
var migrationNamespace = uuid.MustParse("f47ac10b-58cc-4372-a567-0e02b2c3d479")

// DeterministicID generates a deterministic UUID v5 from a key.
func DeterministicID(key string) uuid.UUID {
	return uuid.NewSHA1(migrationNamespace, []byte(key))
}

// IDMap holds the mapping from RocketChat IDs to Glab UUIDs.
type IDMap struct {
	Users    map[string]uuid.UUID // RC user ID -> Glab UUID
	Rooms    map[string]uuid.UUID // RC room ID -> Glab channel UUID
	Messages map[string]uuid.UUID // RC msg ID -> Glab msg UUID
	// Reverse username lookup for reactions/mentions.
	UsernameToID map[string]uuid.UUID // RC username -> Glab user UUID
}

// NewIDMap creates an empty ID mapping.
func NewIDMap() *IDMap {
	return &IDMap{
		Users:        make(map[string]uuid.UUID),
		Rooms:        make(map[string]uuid.UUID),
		Messages:     make(map[string]uuid.UUID),
		UsernameToID: make(map[string]uuid.UUID),
	}
}

// GlabUser is the insert-ready user model for Glab.
type GlabUser struct {
	ID           uuid.UUID
	Username     string
	Email        string
	DisplayName  string
	AvatarURL    string
	PasswordHash string
	Role         string
	Status       string
	LastSeen     time.Time
	IsBot        bool
	CreatedAt    time.Time
}

// GlabChannel is the insert-ready channel model for Glab.
type GlabChannel struct {
	ID          uuid.UUID
	Name        string
	Slug        string
	Description string
	Type        string // "public", "private", "dm"
	Topic       string
	CreatedBy   uuid.UUID
	IsArchived  bool
	CreatedAt   time.Time
}

// GlabMember is the insert-ready channel member model.
type GlabMember struct {
	ChannelID uuid.UUID
	UserID    uuid.UUID
	Role      string
	JoinedAt  time.Time
}

// GlabMessage is the insert-ready message model for Glab.
type GlabMessage struct {
	ID          uuid.UUID
	ChannelID   uuid.UUID
	UserID      uuid.UUID
	ThreadID    *uuid.UUID // nil if not a thread reply
	Content     string
	ContentType string
	EditedAt    *time.Time
	IsPinned    bool
	CreatedAt   time.Time
}

// GlabReaction is the insert-ready reaction model.
type GlabReaction struct {
	MessageID uuid.UUID
	UserID    uuid.UUID
	Emoji     string
	CreatedAt time.Time
}

// GlabMention is the insert-ready mention model.
type GlabMention struct {
	ID        uuid.UUID
	MessageID uuid.UUID
	UserID    uuid.UUID
	ChannelID uuid.UUID
	CreatedAt time.Time
}

const tempPassword = "glab-migrated-2026"

var (
	slugRegexp    = regexp.MustCompile(`[^a-z0-9-]`)
	slugDashMulti = regexp.MustCompile(`-+`)
	mentionRegexp = regexp.MustCompile(`@(\w+)`)
	// RC quote reply: [ ](https://your-rc-server.com/channel/name?msg=RC_MSG_ID)
	rcQuoteRegexp = regexp.MustCompile(`\[ \]\(https?://[^\)]*\?msg=([a-zA-Z0-9]+)\)\s*`)
)

// cleanRCContent strips RocketChat-specific markdown artifacts from message content
// and returns the cleaned text plus the quoted RC message ID (if any).
func cleanRCContent(content string) (cleaned string, quotedMsgID string) {
	matches := rcQuoteRegexp.FindStringSubmatch(content)
	if len(matches) >= 2 {
		quotedMsgID = matches[1]
	}
	cleaned = rcQuoteRegexp.ReplaceAllString(content, "")
	cleaned = strings.TrimSpace(cleaned)
	return cleaned, quotedMsgID
}

// generateSlug creates a URL-safe slug from a name.
func generateSlug(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugRegexp.ReplaceAllString(s, "-")
	s = slugDashMulti.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "channel"
	}
	return s
}

// TransformUsers converts RocketChat users to Glab users and populates the IDMap.
func TransformUsers(rcUsers []rocketchat.RCUser, idMap *IDMap) []GlabUser {
	// Pre-generate a bcrypt hash for the temp password (same for all migrated users).
	hash, _ := bcrypt.GenerateFromPassword([]byte(tempPassword), bcrypt.DefaultCost)
	hashStr := string(hash)

	users := make([]GlabUser, 0, len(rcUsers))
	slugSeen := make(map[string]int)

	for _, rc := range rcUsers {
		if !rc.Active {
			continue
		}

		id := DeterministicID("user:" + rc.ID)
		idMap.Users[rc.ID] = id
		idMap.UsernameToID[rc.Username] = id

		email := ""
		if len(rc.Emails) > 0 {
			email = rc.Emails[0].Address
		}
		if email == "" {
			email = fmt.Sprintf("%s@migrated.glab.local", rc.Username)
		}

		role := "user"
		for _, r := range rc.Roles {
			if r == "admin" {
				role = "admin"
				break
			}
		}

		displayName := rc.Name
		if displayName == "" {
			displayName = rc.Username
		}

		// Deduplicate usernames (unlikely but safe).
		username := rc.Username
		if count, ok := slugSeen[username]; ok {
			username = fmt.Sprintf("%s-%d", username, count+1)
		}
		slugSeen[username]++

		users = append(users, GlabUser{
			ID:           id,
			Username:     username,
			Email:        email,
			DisplayName:  displayName,
			AvatarURL:    rc.AvatarURL,
			PasswordHash: hashStr,
			Role:         role,
			Status:       "offline",
			LastSeen:     time.Now(),
			IsBot:        false,
			CreatedAt:    time.Now(),
		})
	}

	return users
}

// TransformChannels converts RocketChat rooms to Glab channels and populates the IDMap.
// systemUserID is used as created_by for channels where the creator is unknown.
func TransformChannels(rcRooms []rocketchat.RCRoom, idMap *IDMap, systemUserID uuid.UUID) []GlabChannel {
	channels := make([]GlabChannel, 0, len(rcRooms))
	slugSeen := make(map[string]int)

	for _, rc := range rcRooms {
		id := DeterministicID("room:" + rc.ID)
		idMap.Rooms[rc.ID] = id

		typ := "public"
		switch rc.Type {
		case "c":
			typ = "public"
		case "p":
			typ = "private"
		case "d":
			typ = "dm"
		}

		name := rc.Name
		if name == "" && rc.Type == "d" && len(rc.Usernames) > 0 {
			// DMs: use participant usernames as display name.
			name = strings.Join(rc.Usernames, ", ")
		} else if name == "" {
			name = rc.ID
		}

		slug := generateSlug(name)
		if count, ok := slugSeen[slug]; ok {
			slug = fmt.Sprintf("%s-%d", slug, count+1)
		}
		slugSeen[slug]++

		channels = append(channels, GlabChannel{
			ID:          id,
			Name:        name,
			Slug:        slug,
			Description: rc.Description,
			Type:        typ,
			Topic:       rc.Topic,
			CreatedBy:   systemUserID,
			IsArchived:  false,
			CreatedAt:   time.Now(),
		})
	}

	return channels
}

// TransformMembers creates channel membership records from RC room member lists.
func TransformMembers(rcRooms []rocketchat.RCRoom, idMap *IDMap) []GlabMember {
	var members []GlabMember

	for _, rc := range rcRooms {
		channelID, ok := idMap.Rooms[rc.ID]
		if !ok {
			continue
		}

		for _, username := range rc.Usernames {
			userID, ok := idMap.UsernameToID[username]
			if !ok {
				log.Printf("  WARN: skipping member %q (not in imported users)", username)
				continue
			}

			members = append(members, GlabMember{
				ChannelID: channelID,
				UserID:    userID,
				Role:      "member",
				JoinedAt:  time.Now(),
			})
		}
	}

	return members
}

// TransformMessages converts RocketChat messages to Glab messages and populates the IDMap.
// It performs two passes: first to assign IDs, then to resolve thread references.
func TransformMessages(rcMsgs []rocketchat.RCMessage, idMap *IDMap) []GlabMessage {
	// First pass: assign UUIDs to all messages.
	for _, rc := range rcMsgs {
		if _, exists := idMap.Messages[rc.ID]; !exists {
			idMap.Messages[rc.ID] = DeterministicID("msg:" + rc.ID)
		}
	}

	// Second pass: build the message list.
	messages := make([]GlabMessage, 0, len(rcMsgs))

	for _, rc := range rcMsgs {
		msgID := idMap.Messages[rc.ID]

		channelID, ok := idMap.Rooms[rc.RoomID]
		if !ok {
			continue // Skip messages for rooms we didn't import
		}

		userID, ok := idMap.Users[rc.User.ID]
		if !ok {
			continue // Skip messages from users we didn't import
		}

		content := rc.Msg
		if content == "" {
			// File messages or system messages might have empty content.
			if rc.File != nil {
				content = fmt.Sprintf("[file: %s]", rc.File.Name)
			} else {
				content = "[empty message]"
			}
		}

		// Clean RC-specific markdown (quote replies like [ ](url?msg=ID))
		// and extract the quoted message ID to set as thread reference.
		content, quotedMsgID := cleanRCContent(content)

		contentType := "text"
		if rc.File != nil {
			contentType = "file"
		}

		var threadID *uuid.UUID
		if rc.ThreadMsgID != "" {
			if tid, ok := idMap.Messages[rc.ThreadMsgID]; ok {
				threadID = &tid
			}
		}
		// If no explicit thread but has a quote reply, use the quoted message as thread parent.
		if threadID == nil && quotedMsgID != "" {
			if tid, ok := idMap.Messages[quotedMsgID]; ok {
				threadID = &tid
			}
		}

		var editedAt *time.Time
		if rc.EditedAt != nil && rc.EditedAt.Date > 0 {
			t := time.UnixMilli(rc.EditedAt.Date)
			editedAt = &t
		}

		createdAt := time.UnixMilli(rc.Timestamp.Date)
		if createdAt.IsZero() {
			createdAt = time.Now()
		}

		messages = append(messages, GlabMessage{
			ID:          msgID,
			ChannelID:   channelID,
			UserID:      userID,
			ThreadID:    threadID,
			Content:     content,
			ContentType: contentType,
			EditedAt:    editedAt,
			IsPinned:    rc.Pinned,
			CreatedAt:   createdAt,
		})
	}

	// Third pass: clear thread_id for replies whose parent was skipped.
	// This happens when the parent message's author is an inactive user.
	included := make(map[uuid.UUID]bool, len(messages))
	for _, m := range messages {
		included[m.ID] = true
	}
	for i := range messages {
		if messages[i].ThreadID != nil && !included[*messages[i].ThreadID] {
			messages[i].ThreadID = nil
		}
	}

	return messages
}

// TransformReactions converts RocketChat reactions to Glab reactions.
func TransformReactions(rcMsgs []rocketchat.RCMessage, idMap *IDMap) []GlabReaction {
	var reactions []GlabReaction

	for _, rc := range rcMsgs {
		if len(rc.Reactions) == 0 {
			continue
		}

		msgID, ok := idMap.Messages[rc.ID]
		if !ok {
			continue
		}

		createdAt := time.UnixMilli(rc.Timestamp.Date)
		if createdAt.IsZero() {
			createdAt = time.Now()
		}

		for emoji, data := range rc.Reactions {
			// RC stores emoji as ":emoji_name:", strip the colons for Glab.
			cleanEmoji := strings.Trim(emoji, ":")

			for _, username := range data.Usernames {
				userID, ok := idMap.UsernameToID[username]
				if !ok {
					continue
				}

				reactions = append(reactions, GlabReaction{
					MessageID: msgID,
					UserID:    userID,
					Emoji:     cleanEmoji,
					CreatedAt: createdAt,
				})
			}
		}
	}

	return reactions
}

// ExtractMentions parses @username mentions from message content.
func ExtractMentions(messages []GlabMessage, idMap *IDMap) []GlabMention {
	var mentions []GlabMention

	for _, msg := range messages {
		matches := mentionRegexp.FindAllStringSubmatch(msg.Content, -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			username := match[1]
			userID, ok := idMap.UsernameToID[username]
			if !ok {
				continue
			}
			// Don't create self-mentions.
			if userID == msg.UserID {
				continue
			}

			mentions = append(mentions, GlabMention{
				ID:        DeterministicID(fmt.Sprintf("mention:%s:%s", msg.ID, username)),
				MessageID: msg.ID,
				UserID:    userID,
				ChannelID: msg.ChannelID,
				CreatedAt: msg.CreatedAt,
			})
		}
	}

	return mentions
}
