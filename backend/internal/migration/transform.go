package migration

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Fixed namespace for deterministic UUID generation.
// Must match migrate/internal/transform for consistency with existing migrated data.
var migrationNamespace = uuid.MustParse("f47ac10b-58cc-4372-a567-0e02b2c3d479")

// DeterministicID generates a deterministic UUID v5 from a key.
func DeterministicID(key string) uuid.UUID {
	return uuid.NewSHA1(migrationNamespace, []byte(key))
}

// IDMap holds the mapping from RocketChat IDs to Glab UUIDs.
type IDMap struct {
	Users        map[string]uuid.UUID
	Rooms        map[string]uuid.UUID
	Messages     map[string]uuid.UUID
	UsernameToID map[string]uuid.UUID
}

func NewIDMap() *IDMap {
	return &IDMap{
		Users:        make(map[string]uuid.UUID),
		Rooms:        make(map[string]uuid.UUID),
		Messages:     make(map[string]uuid.UUID),
		UsernameToID: make(map[string]uuid.UUID),
	}
}

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

type GlabChannel struct {
	ID          uuid.UUID
	Name        string
	Slug        string
	Description string
	Type        string
	Topic       string
	CreatedBy   uuid.UUID
	IsArchived  bool
	CreatedAt   time.Time
}

type GlabMember struct {
	ChannelID uuid.UUID
	UserID    uuid.UUID
	Role      string
	JoinedAt  time.Time
}

type GlabMessage struct {
	ID          uuid.UUID
	ChannelID   uuid.UUID
	UserID      uuid.UUID
	ThreadID    *uuid.UUID
	Content     string
	ContentType string
	EditedAt    *time.Time
	IsPinned    bool
	CreatedAt   time.Time
}

type GlabReaction struct {
	MessageID uuid.UUID
	UserID    uuid.UUID
	Emoji     string
	CreatedAt time.Time
}

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
)

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

func TransformUsers(rcUsers []RCUser, idMap *IDMap) []GlabUser {
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

func TransformChannels(rcRooms []RCRoom, idMap *IDMap, systemUserID uuid.UUID) []GlabChannel {
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
		if name == "" {
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

func TransformMembers(rcRooms []RCRoom, idMap *IDMap) []GlabMember {
	var members []GlabMember

	for _, rc := range rcRooms {
		channelID, ok := idMap.Rooms[rc.ID]
		if !ok {
			continue
		}

		for _, username := range rc.Usernames {
			userID, ok := idMap.UsernameToID[username]
			if !ok {
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

func TransformMessages(rcMsgs []RCMessage, idMap *IDMap) []GlabMessage {
	for _, rc := range rcMsgs {
		if _, exists := idMap.Messages[rc.ID]; !exists {
			idMap.Messages[rc.ID] = DeterministicID("msg:" + rc.ID)
		}
	}

	messages := make([]GlabMessage, 0, len(rcMsgs))

	for _, rc := range rcMsgs {
		msgID := idMap.Messages[rc.ID]

		channelID, ok := idMap.Rooms[rc.RoomID]
		if !ok {
			continue
		}

		userID, ok := idMap.Users[rc.User.ID]
		if !ok {
			continue
		}

		content := rc.Msg
		if content == "" {
			if rc.File != nil {
				content = fmt.Sprintf("[file: %s]", rc.File.Name)
			} else {
				content = "[empty message]"
			}
		}

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

func TransformReactions(rcMsgs []RCMessage, idMap *IDMap) []GlabReaction {
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
