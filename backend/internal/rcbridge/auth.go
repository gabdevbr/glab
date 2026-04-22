package rcbridge

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

// rcLoginRequest is the body for RC /api/v1/login.
type rcLoginRequest struct {
	User     string `json:"user"`
	Password string `json:"password"`
}

// rcLoginResponse is the response from RC /api/v1/login.
type rcLoginResponse struct {
	Status string `json:"status"`
	Data   struct {
		AuthToken string `json:"authToken"`
		UserID    string `json:"userId"`
		Me        struct {
			Username    string `json:"username"`
			Email       string `json:"emails"`
			Name        string `json:"name"`
			DisplayName string `json:"displayName"`
		} `json:"me"`
	} `json:"data"`
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// RCLoginResult holds the resolved Glab user after delegated login.
type RCLoginResult struct {
	User      repository.User
	AuthToken string
	UserID    string
}

// Authenticator handles delegated login against RocketChat.
type Authenticator struct {
	rcURL      string
	encKey     []byte // AES-256 key, 32 bytes. Empty = no encryption (dev mode).
	queries    *repository.Queries
	httpClient *http.Client
}

// NewAuthenticator creates an Authenticator.
// encKeyBase64 is the base64-encoded 32-byte AES key (from GLAB_RC_ENCRYPTION_KEY env).
// If empty, token is stored as-is (only acceptable in dev).
func NewAuthenticator(rcURL, encKeyBase64 string, q *repository.Queries) (*Authenticator, error) {
	a := &Authenticator{
		rcURL:      strings.TrimRight(rcURL, "/"),
		queries:    q,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
	if encKeyBase64 != "" {
		key, err := base64.StdEncoding.DecodeString(encKeyBase64)
		if err != nil {
			return nil, fmt.Errorf("rcbridge: invalid encryption key: %w", err)
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("rcbridge: encryption key must be 32 bytes (got %d)", len(key))
		}
		a.encKey = key
	}
	return a, nil
}

// LoginAndUpsert authenticates the user against RC, then creates/updates the Glab user.
// Returns the Glab user and the raw RC auth token (for DDP session use).
func (a *Authenticator) LoginAndUpsert(ctx context.Context, username, password string) (RCLoginResult, error) {
	body, _ := json.Marshal(rcLoginRequest{User: username, Password: password})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.rcURL+"/api/v1/login", bytes.NewReader(body))
	if err != nil {
		return RCLoginResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return RCLoginResult{}, fmt.Errorf("rc login request failed: %w", err)
	}
	defer resp.Body.Close()

	var rc rcLoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&rc); err != nil {
		return RCLoginResult{}, fmt.Errorf("rc login response parse: %w", err)
	}
	if rc.Status != "success" {
		msg := rc.Message
		if msg == "" {
			msg = rc.Error
		}
		if msg == "" {
			msg = "unauthorized"
		}
		return RCLoginResult{}, fmt.Errorf("rc login: %s", msg)
	}

	encToken, err := a.encryptToken(rc.Data.AuthToken)
	if err != nil {
		return RCLoginResult{}, fmt.Errorf("rcbridge: encrypt token: %w", err)
	}

	// Derive email — RC may not return it in login response; use placeholder if absent.
	email := username
	if !strings.Contains(email, "@") {
		email = username + "@rc.bridge"
	}
	displayName := rc.Data.Me.Name
	if displayName == "" {
		displayName = username
	}

	tokenEnc := pgtype.Text{String: encToken, Valid: true}
	now := pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true}

	user, err := a.queries.UpsertUserByRCLogin(ctx, repository.UpsertUserByRCLoginParams{
		Username:         username,
		Email:            email,
		DisplayName:      displayName,
		PasswordHash:     "!rc-delegated",
		RcUserID:         pgtype.Text{String: rc.Data.UserID, Valid: true},
		RcAuthTokenEnc:   tokenEnc,
		RcTokenExpiresAt: now,
	})
	if err != nil {
		return RCLoginResult{}, fmt.Errorf("rcbridge: upsert user: %w", err)
	}

	return RCLoginResult{
		User:      user,
		AuthToken: rc.Data.AuthToken,
		UserID:    rc.Data.UserID,
	}, nil
}

// DecryptToken decrypts a stored RC auth token.
func (a *Authenticator) DecryptToken(enc string) (string, error) {
	return a.decryptToken(enc)
}

// encryptToken AES-GCM encrypts the token (base64-encoded output).
// Falls back to base64 identity if no key configured.
func (a *Authenticator) encryptToken(token string) (string, error) {
	if len(a.encKey) == 0 {
		return base64.StdEncoding.EncodeToString([]byte(token)), nil
	}
	block, err := aes.NewCipher(a.encKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nonce, nonce, []byte(token), nil)
	return base64.StdEncoding.EncodeToString(ct), nil
}

// decryptToken reverses encryptToken.
func (a *Authenticator) decryptToken(enc string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	if len(a.encKey) == 0 {
		return string(data), nil
	}
	block, err := aes.NewCipher(a.encKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt token: %w", err)
	}
	return string(plain), nil
}
