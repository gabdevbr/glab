// Package push provides Apple Push Notification Service (APNs) integration.
// It sends push notifications to iOS devices when messages arrive for offline users.
//
// Configuration is stored in the app_config table (key: "apns_config"):
//
//	{
//	  "key_id": "ABC123",
//	  "team_id": "DEF456",
//	  "bundle_id": "com.glab.ios",
//	  "key_base64": "<base64-encoded .p8 key>",
//	  "environment": "production"  // or "sandbox"
//	}
package push

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// APNsConfig holds the configuration for APNs.
type APNsConfig struct {
	KeyID       string `json:"key_id"`
	TeamID      string `json:"team_id"`
	BundleID    string `json:"bundle_id"`
	KeyBase64   string `json:"key_base64"`
	Environment string `json:"environment"` // "production" or "sandbox"
}

// APNsPayload is the JSON payload sent to APNs.
type APNsPayload struct {
	APS  APSPayload        `json:"aps"`
	Data map[string]string  `json:"data,omitempty"`
}

// APSPayload is the "aps" dictionary in the push notification.
type APSPayload struct {
	Alert APSAlert `json:"alert"`
	Badge *int     `json:"badge,omitempty"`
	Sound string   `json:"sound,omitempty"`
}

// APSAlert is the alert content.
type APSAlert struct {
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	Body     string `json:"body"`
}

// Service sends push notifications via APNs HTTP/2 API.
type Service struct {
	config *APNsConfig
	client *http.Client
	mu     sync.RWMutex
	token  string
	tokenExp time.Time
}

// NewService creates a new push notification service.
// Returns nil if config is not set (push disabled).
func NewService(config *APNsConfig) *Service {
	if config == nil || config.KeyID == "" || config.TeamID == "" {
		return nil
	}
	return &Service{
		config: config,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send sends a push notification to a specific device token.
func (s *Service) Send(ctx context.Context, deviceToken string, payload APNsPayload) error {
	if s == nil {
		return nil // push disabled
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	url := s.baseURL() + "/3/device/" + deviceToken
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	token, err := s.getToken()
	if err != nil {
		return fmt.Errorf("get auth token: %w", err)
	}

	req.Header.Set("Authorization", "bearer "+token)
	req.Header.Set("apns-topic", s.config.BundleID)
	req.Header.Set("apns-push-type", "alert")
	req.Header.Set("apns-priority", "10")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		slog.Warn("APNs error", "status", resp.StatusCode, "body", string(respBody), "device_token", deviceToken[:8]+"...")
		return fmt.Errorf("APNs returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// SendToChannel sends a push notification for a new message to all offline members.
func (s *Service) SendToChannel(ctx context.Context, deviceTokens []string, senderName string, channelName string, content string, channelID string, messageID string) {
	if s == nil || len(deviceTokens) == 0 {
		return
	}

	// Truncate content for push
	body := content
	if len(body) > 200 {
		body = body[:200] + "..."
	}

	payload := APNsPayload{
		APS: APSPayload{
			Alert: APSAlert{
				Title: channelName,
				Subtitle: senderName,
				Body:  body,
			},
			Sound: "default",
		},
		Data: map[string]string{
			"channel_id": channelID,
			"message_id": messageID,
			"type":       "message",
		},
	}

	for _, token := range deviceTokens {
		go func(t string) {
			if err := s.Send(ctx, t, payload); err != nil {
				slog.Warn("push send failed", "error", err)
			}
		}(token)
	}
}

func (s *Service) baseURL() string {
	if s.config.Environment == "sandbox" {
		return "https://api.sandbox.push.apple.com"
	}
	return "https://api.push.apple.com"
}

// getToken returns a cached or fresh JWT for APNs authentication.
func (s *Service) getToken() (string, error) {
	s.mu.RLock()
	if s.token != "" && time.Now().Before(s.tokenExp) {
		defer s.mu.RUnlock()
		return s.token, nil
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after acquiring write lock
	if s.token != "" && time.Now().Before(s.tokenExp) {
		return s.token, nil
	}

	key, err := s.parseKey()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss": s.config.TeamID,
		"iat": now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = s.config.KeyID

	signed, err := token.SignedString(key)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	s.token = signed
	s.tokenExp = now.Add(50 * time.Minute) // APNs tokens valid for 1 hour
	return s.token, nil
}

func (s *Service) parseKey() (*ecdsa.PrivateKey, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(s.config.KeyBase64)
	if err != nil {
		return nil, fmt.Errorf("decode key: %w", err)
	}

	block, _ := pem.Decode(keyBytes)
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse key: %w", err)
	}

	ecKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not ECDSA")
	}

	return ecKey, nil
}
