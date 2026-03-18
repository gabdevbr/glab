package rocketchat

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client handles communication with the RocketChat REST API.
type Client struct {
	baseURL   string
	authToken string
	userID    string
	client    *http.Client
}

// NewClient creates a RocketChat API client.
func NewClient(baseURL, authToken, userID string) *Client {
	return &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		authToken: authToken,
		userID:    userID,
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ValidateToken checks that the auth token is valid by calling /api/v1/me.
// Returns the authenticated username, or an error if the token is expired/invalid.
func (c *Client) ValidateToken() (string, error) {
	body, err := c.doGet("/api/v1/me", nil)
	if err != nil {
		return "", fmt.Errorf("token validation failed (likely expired): %w", err)
	}
	var resp struct {
		Username string `json:"username"`
		Success  bool   `json:"success"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("invalid response from /api/v1/me: %w", err)
	}
	if !resp.Success {
		return "", fmt.Errorf("RC token is invalid or expired")
	}
	return resp.Username, nil
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
	AvatarURL string   `json:"-"` // Built from baseURL + username
}

// RCRoom represents a RocketChat room (channel, group, or DM).
type RCRoom struct {
	ID          string   `json:"_id"`
	Name        string   `json:"name"`
	Type        string   `json:"t"` // "c"=channel, "p"=private, "d"=DM
	Topic       string   `json:"topic"`
	Description string   `json:"description"`
	Usernames   []string `json:"usernames"`
	UsersCount  int      `json:"usersCount"`
}

// RCTimestamp handles both RocketChat timestamp formats:
// - String ISO 8601: "2024-01-15T10:30:00.000Z"
// - MongoDB EJSON:   {"$date": 1705312200000}
type RCTimestamp struct {
	Date int64
}

// MarshalJSON serializes as ISO 8601 string for consistent round-trip via JSONL files.
func (t RCTimestamp) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.UnixMilli(t.Date).UTC().Format(time.RFC3339Nano))
}

func (t *RCTimestamp) UnmarshalJSON(data []byte) error {
	// Try string first (REST API format)
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		parsed, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			// Try without nano
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

	// Try EJSON object: {"$date": 1234567890}
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

// RCReactions handles both formats from RocketChat:
// - map[string]{"usernames": [...]}  (when reactions exist)
// - [] (empty array when no reactions)
type RCReactions map[string]RCReaction

func (r *RCReactions) UnmarshalJSON(data []byte) error {
	// Try map first (normal case with reactions)
	var m map[string]RCReaction
	if err := json.Unmarshal(data, &m); err == nil {
		*r = m
		return nil
	}
	// Empty array or other non-map — treat as no reactions
	*r = nil
	return nil
}

// RCMessage represents a RocketChat message.
type RCMessage struct {
	ID        string      `json:"_id"`
	RoomID    string      `json:"rid"`
	Msg       string      `json:"msg"`
	Timestamp RCTimestamp `json:"ts"`
	User      struct {
		ID       string `json:"_id"`
		Username string `json:"username"`
	} `json:"u"`
	ThreadMsgID string       `json:"tmid"`
	Reactions   RCReactions `json:"reactions"`
	File *struct {
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
	Pinned   bool         `json:"pinned"`
}

// paginated is a generic response wrapper for paginated RC API endpoints.
type paginated[T any] struct {
	Items  []T `json:"-"`
	Count  int `json:"count"`
	Offset int `json:"offset"`
	Total  int `json:"total"`
}

func (c *Client) doGet(path string, params url.Values) ([]byte, error) {
	u, err := url.Parse(c.baseURL + path)
	if err != nil {
		return nil, fmt.Errorf("parsing URL: %w", err)
	}
	u.RawQuery = params.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
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

// fetchAllPaginated fetches all pages from a paginated endpoint.
// listKey is the JSON key containing the array (e.g. "users", "channels").
func fetchAllPaginated[T any](c *Client, path, listKey string, extraParams url.Values) ([]T, error) {
	const pageSize = 100
	var all []T
	offset := 0

	for {
		params := url.Values{}
		if extraParams != nil {
			for k, v := range extraParams {
				params[k] = v
			}
		}
		params.Set("count", strconv.Itoa(pageSize))
		params.Set("offset", strconv.Itoa(offset))

		body, err := c.doGet(path, params)
		if err != nil {
			return nil, fmt.Errorf("fetching %s (offset %d): %w", path, offset, err)
		}

		// Parse the total count from the response.
		var meta struct {
			Count  int `json:"count"`
			Offset int `json:"offset"`
			Total  int `json:"total"`
		}
		if err := json.Unmarshal(body, &meta); err != nil {
			return nil, fmt.Errorf("parsing pagination metadata: %w", err)
		}

		// Parse the list items.
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
func (c *Client) GetUsers() ([]RCUser, error) {
	users, err := fetchAllPaginated[RCUser](c, "/api/v1/users.list", "users", nil)
	if err != nil {
		return nil, err
	}
	// Don't set RC avatar URLs — they point to the old server and cause
	// broken images / CORS errors. The frontend falls back to initials.
	return users, nil
}

// GetChannels returns all public channels.
func (c *Client) GetChannels() ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](c, "/api/v1/channels.list", "channels", nil)
}

// GetGroups returns all private groups.
func (c *Client) GetGroups() ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](c, "/api/v1/groups.list", "groups", nil)
}

// GetDMs returns all direct message rooms.
func (c *Client) GetDMs() ([]RCRoom, error) {
	return fetchAllPaginated[RCRoom](c, "/api/v1/dm.list", "ims", nil)
}

// GetRoomMembers returns usernames of members in a room.
// roomType should be "c" (channel) or "p" (private group).
func (c *Client) GetRoomMembers(roomID, roomType string) ([]string, error) {
	endpoint := "/api/v1/channels.members"
	switch roomType {
	case "p":
		endpoint = "/api/v1/groups.members"
	}

	type member struct {
		Username string `json:"username"`
	}
	members, err := fetchAllPaginated[member](c, endpoint, "members", url.Values{
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
// roomType should be "channels", "groups", or "dm".
func (c *Client) GetMessages(roomID, roomType string, oldest, latest time.Time) ([]RCMessage, error) {
	endpoint := "/api/v1/channels.history"
	switch roomType {
	case "p":
		endpoint = "/api/v1/groups.history"
	case "d":
		endpoint = "/api/v1/dm.history"
	}

	const pageSize = 100
	var all []RCMessage
	latest_ := latest
	batch := 0
	start := time.Now()

	for {
		batch++
		batchStart := time.Now()
		params := url.Values{
			"roomId":    {roomID},
			"oldest":    {oldest.Format(time.RFC3339)},
			"latest":    {latest_.Format(time.RFC3339)},
			"count":     {strconv.Itoa(pageSize)},
			"inclusive": {"true"},
		}

		body, err := c.doGet(endpoint, params)
		if err != nil {
			log.Printf("    [batch %d] HTTP error after %v: %v", batch, time.Since(batchStart), err)
			return nil, fmt.Errorf("fetching messages for room %s: %w", roomID, err)
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

		all = append(all, resp.Messages...)
		log.Printf("    [batch %d] +%d msgs (total: %d, elapsed: %v)", batch, len(resp.Messages), len(all), time.Since(start).Round(time.Millisecond))

		// Messages come in reverse chronological order.
		// Move latest to the timestamp of the oldest message in this batch.
		oldestInBatch := resp.Messages[len(resp.Messages)-1]
		batchTime := time.UnixMilli(oldestInBatch.Timestamp.Date)
		if !batchTime.Before(latest_) {
			// No progress, we're done.
			break
		}
		latest_ = batchTime.Add(-time.Millisecond)

		if len(resp.Messages) < pageSize {
			break
		}
	}

	log.Printf("    Room %s: %d messages in %v (%d batches)", roomID, len(all), time.Since(start).Round(time.Millisecond), batch)
	return all, nil
}

// FileDownload holds the response from downloading a RocketChat file.
type FileDownload struct {
	Body        io.ReadCloser
	Size        int64  // from Content-Length; -1 if unknown
	ContentType string // from Content-Type header
}

// DownloadFile downloads a file from RocketChat. The caller must close Body.
func (c *Client) DownloadFile(fileURL string) (*FileDownload, error) {
	// Resolve relative URLs.
	u := fileURL
	if len(u) > 0 && u[0] == '/' {
		u = c.baseURL + u
	}

	req, err := http.NewRequest(http.MethodGet, u, nil)
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

	// Validate content-type: RC returns 200 with HTML login page when token expires.
	ct := resp.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "text/html") {
		resp.Body.Close()
		return nil, fmt.Errorf("received HTML instead of file for %s (likely expired token)", fileURL)
	}

	return &FileDownload{
		Body:        resp.Body,
		Size:        resp.ContentLength,
		ContentType: ct,
	}, nil
}
