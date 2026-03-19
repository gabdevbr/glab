package migration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// RCClient handles communication with the RocketChat REST API.
// All methods accept context.Context for cancellation support.
type RCClient struct {
	baseURL   string
	authToken string
	userID    string
	client    *http.Client
}

// NewRCClient creates a RocketChat API client.
func NewRCClient(baseURL, authToken, userID string) *RCClient {
	return &RCClient{
		baseURL:   strings.TrimRight(baseURL, "/"),
		authToken: authToken,
		userID:    userID,
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// RCUser represents a RocketChat user.
type RCUser struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Emails   []struct {
		Address string `json:"address"`
	} `json:"emails"`
	Roles     []string `json:"roles"`
	Active    bool     `json:"active"`
	AvatarURL string   `json:"-"`
}

// RCRoom represents a RocketChat room (channel, group, or DM).
type RCRoom struct {
	ID          string   `json:"_id"`
	Name        string   `json:"name"`
	Type        string   `json:"t"`
	Topic       string   `json:"topic"`
	Description string   `json:"description"`
	Usernames   []string `json:"usernames"`
	UsersCount  int      `json:"usersCount"`
}

// RCTimestamp handles both RocketChat timestamp formats.
type RCTimestamp struct {
	Date int64
}

func (t RCTimestamp) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.UnixMilli(t.Date).UTC().Format(time.RFC3339Nano))
}

func (t *RCTimestamp) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		parsed, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			parsed, err = time.Parse("2006-01-02T15:04:05.000Z", s)
			if err != nil {
				parsed, err = time.Parse(time.RFC3339, s)
				if err != nil {
					return fmt.Errorf("cannot parse timestamp string %q: %w", s, err)
				}
			}
		}
		t.Date = parsed.UnixMilli()
		return nil
	}

	var obj struct {
		Date int64 `json:"$date"`
	}
	if err := json.Unmarshal(data, &obj); err == nil {
		t.Date = obj.Date
		return nil
	}

	return fmt.Errorf("cannot unmarshal timestamp: %s", string(data))
}

// RCReaction holds usernames for a single emoji reaction.
type RCReaction struct {
	Usernames []string `json:"usernames"`
}

// RCReactions handles both map and empty array formats from RocketChat.
type RCReactions map[string]RCReaction

func (r *RCReactions) UnmarshalJSON(data []byte) error {
	var m map[string]RCReaction
	if err := json.Unmarshal(data, &m); err == nil {
		*r = m
		return nil
	}
	*r = nil
	return nil
}

// RCMessage represents a RocketChat message.
type RCMessage struct {
	ID        string      `json:"_id"`
	RoomID    string      `json:"rid"`
	Msg       string      `json:"msg"`
	Timestamp RCTimestamp  `json:"ts"`
	User      struct {
		ID       string `json:"_id"`
		Username string `json:"username"`
	} `json:"u"`
	ThreadMsgID string      `json:"tmid"`
	Reactions   RCReactions `json:"reactions"`
	File        *struct {
		ID   string `json:"_id"`
		Name string `json:"name"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	} `json:"file"`
	Attachments []struct {
		Title    string `json:"title"`
		ImageURL string `json:"image_url"`
	} `json:"attachments"`
	EditedAt *RCTimestamp `json:"editedAt"`
	Pinned   bool        `json:"pinned"`
}

func (c *RCClient) doGet(ctx context.Context, path string, params url.Values) ([]byte, error) {
	u, err := url.Parse(c.baseURL + path)
	if err != nil {
		return nil, fmt.Errorf("parsing URL: %w", err)
	}
	u.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("X-Auth-Token", c.authToken)
	req.Header.Set("X-User-Id", c.userID)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}

// TestConnection verifies the RC credentials are valid.
func (c *RCClient) TestConnection(ctx context.Context) error {
	_, err := c.doGet(ctx, "/api/v1/me", nil)
	return err
}

func fetchAllPaginated[T any](ctx context.Context, c *RCClient, path, listKey string, extraParams url.Values) ([]T, error) {
	const pageSize = 100
	var all []T
	offset := 0

	for {
		if err := ctx.Err(); err != nil {
			return all, err
		}

		params := url.Values{}
		if extraParams != nil {
			for k, v := range extraParams {
				params[k] = v
			}
		}
		params.Set("count", strconv.Itoa(pageSize))
		params.Set("offset", strconv.Itoa(offset))

		body, err := c.doGet(ctx, path, params)
		if err != nil {
			return nil, fmt.Errorf("fetching %s (offset %d): %w", path, offset, err)
		}

		var meta struct {
			Count  int `json:"count"`
			Offset int `json:"offset"`
			Total  int `json:"total"`
		}
		if err := json.Unmarshal(body, &meta); err != nil {
			return nil, fmt.Errorf("parsing pagination metadata: %w", err)
		}

		var raw map[string]json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, fmt.Errorf("parsing response: %w", err)
		}

		listData, ok := raw[listKey]
		if !ok {
			return nil, fmt.Errorf("key %q not found in response", listKey)
		}

		var items []T
		if err := json.Unmarshal(listData, &items); err != nil {
			return nil, fmt.Errorf("parsing %s list: %w", listKey, err)
		}

		all = append(all, items...)

		if len(all) >= meta.Total || len(items) == 0 {
			break
		}
		offset += pageSize
	}

	return all, nil
}

// GetUsers returns all users from RocketChat.
func (c *RCClient) GetUsers(ctx context.Context) ([]RCUser, error) {
	users, err := fetchAllPaginated[RCUser](ctx, c, "/api/v1/users.list", "users", nil)
	if err != nil {
		return nil, err
	}
	for i := range users {
		users[i].AvatarURL = fmt.Sprintf("%s/avatar/%s", c.baseURL, users[i].Username)
	}
	return users, nil
}

// GetChannels returns all public channels.
func (c *RCClient) GetChannels(ctx context.Context) ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](ctx, c, "/api/v1/channels.list", "channels", nil)
}

// GetGroups returns all private groups.
func (c *RCClient) GetGroups(ctx context.Context) ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](ctx, c, "/api/v1/groups.list", "groups", nil)
}

// GetDMs returns all direct message rooms.
func (c *RCClient) GetDMs(ctx context.Context) ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](ctx, c, "/api/v1/dm.list", "ims", nil)
}

// GetRoomMembers returns usernames of members in a room.
// roomType should be "c" (channel) or "p" (private group).
func (c *RCClient) GetRoomMembers(ctx context.Context, roomID, roomType string) ([]string, error) {
	endpoint := "/api/v1/channels.members"
	switch roomType {
	case "p":
		endpoint = "/api/v1/groups.members"
	case "d":
		endpoint = "/api/v1/dm.members"
	}

	type member struct {
		Username string `json:"username"`
	}
	members, err := fetchAllPaginated[member](ctx, c, endpoint, "members", url.Values{
		"roomId": {roomID},
	})
	if err != nil {
		return nil, err
	}
	usernames := make([]string, len(members))
	for i, m := range members {
		usernames[i] = m.Username
	}
	return usernames, nil
}

// GetMessages returns messages from a room within a time range.
func (c *RCClient) GetMessages(ctx context.Context, roomID, roomType string, oldest, latest time.Time) ([]RCMessage, error) {
	endpoint := "/api/v1/channels.history"
	switch roomType {
	case "p":
		endpoint = "/api/v1/groups.history"
	case "d":
		endpoint = "/api/v1/dm.history"
	}

	const (
		pageSize   = 100
		maxBatches = 1000 // safety limit: 100k messages per room max
	)
	var all []RCMessage
	latest_ := latest
	seen := make(map[string]bool) // track message IDs to avoid duplicates

	for batch := 1; batch <= maxBatches; batch++ {
		if err := ctx.Err(); err != nil {
			return all, err
		}

		params := url.Values{
			"roomId": {roomID},
			"oldest": {oldest.Format(time.RFC3339Nano)},
			"latest": {latest_.Format(time.RFC3339Nano)},
			"count":  {strconv.Itoa(pageSize)},
		}

		body, err := c.doGet(ctx, endpoint, params)
		if err != nil {
			return nil, fmt.Errorf("fetching messages for room %s (batch %d): %w", roomID, batch, err)
		}

		var resp struct {
			Messages []RCMessage `json:"messages"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("parsing messages: %w", err)
		}

		if len(resp.Messages) == 0 {
			break
		}

		// Deduplicate messages using IDs
		newCount := 0
		for _, m := range resp.Messages {
			if !seen[m.ID] {
				seen[m.ID] = true
				all = append(all, m)
				newCount++
			}
		}

		// No new messages means we're stuck in a loop
		if newCount == 0 {
			break
		}

		// Messages come in reverse chronological order.
		// Move latest to the timestamp of the oldest message in this batch.
		oldestInBatch := resp.Messages[len(resp.Messages)-1]
		batchTime := time.UnixMilli(oldestInBatch.Timestamp.Date)
		if !batchTime.Before(latest_) {
			break
		}
		latest_ = batchTime.Add(-time.Millisecond)

		if len(resp.Messages) < pageSize {
			break
		}
	}

	return all, nil
}

// RCCustomEmoji represents a custom emoji from RocketChat.
type RCCustomEmoji struct {
	ID        string   `json:"_id"`
	Name      string   `json:"name"`
	Aliases   []string `json:"aliases"`
	Extension string   `json:"extension"`
}

// GetCustomEmojis returns all custom emojis from RocketChat.
func (c *RCClient) GetCustomEmojis(ctx context.Context) ([]RCCustomEmoji, error) {
	body, err := c.doGet(ctx, "/api/v1/emoji-custom.list", nil)
	if err != nil {
		return nil, fmt.Errorf("fetching custom emojis: %w", err)
	}

	var resp struct {
		Emojis struct {
			Update []RCCustomEmoji `json:"update"`
		} `json:"emojis"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parsing custom emojis: %w", err)
	}

	return resp.Emojis.Update, nil
}

// ValidateToken checks that the RC auth token is valid by calling /api/v1/me.
func (c *RCClient) ValidateToken(ctx context.Context) (string, error) {
	body, err := c.doGet(ctx, "/api/v1/me", nil)
	if err != nil {
		return "", fmt.Errorf("RC token validation failed (likely expired): %w", err)
	}
	var resp struct {
		Username string `json:"username"`
		Success  bool   `json:"success"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("invalid response from RC /api/v1/me: %w", err)
	}
	if !resp.Success {
		return "", fmt.Errorf("RC token is invalid or expired")
	}
	return resp.Username, nil
}

// EmojiImageURL returns the URL for a custom emoji image.
func (c *RCClient) EmojiImageURL(name, extension string) string {
	return fmt.Sprintf("%s/emoji-custom/%s.%s", c.baseURL, name, extension)
}

// DownloadFile downloads a file from RocketChat.
func (c *RCClient) DownloadFile(ctx context.Context, fileURL string) (io.ReadCloser, error) {
	u := fileURL
	if len(u) > 0 && u[0] == '/' {
		u = c.baseURL + u
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("creating download request: %w", err)
	}
	req.Header.Set("X-Auth-Token", c.authToken)
	req.Header.Set("X-User-Id", c.userID)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("downloading file: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("download returned %d for %s", resp.StatusCode, fileURL)
	}

	// Reject HTML responses — RC returns 200 with login page when token expires.
	ct := resp.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "text/html") {
		resp.Body.Close()
		return nil, fmt.Errorf("received HTML instead of file for %s (token likely expired)", fileURL)
	}

	return resp.Body, nil
}
