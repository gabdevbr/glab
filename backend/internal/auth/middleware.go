package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

type contextKey string

const claimsKey contextKey = "claims"

// APITokenPrefix is the prefix for all Glab API tokens.
const APITokenPrefix = "glb_"

// Middleware returns a chi-compatible middleware that validates both JWT tokens
// and API tokens (glb_ prefix) from the Authorization header.
func Middleware(secret string, queries *repository.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				writeUnauthorized(w)
				return
			}

			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeUnauthorized(w)
				return
			}

			token := parts[1]

			var claims *Claims

			if strings.HasPrefix(token, APITokenPrefix) {
				// API token auth
				c, err := validateAPIToken(r.Context(), queries, token)
				if err != nil {
					writeUnauthorized(w)
					return
				}
				claims = c
			} else {
				// JWT auth
				c, err := ValidateToken(token, secret)
				if err != nil {
					writeUnauthorized(w)
					return
				}
				c.Auth = AuthTypeJWT
				claims = c
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// validateAPIToken hashes the token, looks it up, checks expiry, and returns Claims.
func validateAPIToken(ctx context.Context, queries *repository.Queries, token string) (*Claims, error) {
	hash := sha256.Sum256([]byte(token))
	hashHex := hex.EncodeToString(hash[:])

	row, err := queries.GetAPITokenByHash(ctx, hashHex)
	if err != nil {
		return nil, err
	}

	// Check expiry
	if row.ExpiresAt.Valid && row.ExpiresAt.Time.Before(time.Now()) {
		return nil, errTokenExpired
	}

	// Update last_used_at asynchronously
	go func() {
		_ = queries.UpdateTokenLastUsed(context.Background(), row.ID)
	}()

	return &Claims{
		UserID:   uuidToString(row.UserID),
		Username: row.Username,
		Role:     row.UserRole,
		Auth:     AuthTypeAPIToken,
		Scopes:   row.Scopes,
	}, nil
}

// uuidToString formats a pgtype.UUID as a standard UUID string.
func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// UserFromContext extracts the JWT claims from the request context.
// Returns nil if no claims are present.
func UserFromContext(ctx context.Context) *Claims {
	claims, ok := ctx.Value(claimsKey).(*Claims)
	if !ok {
		return nil
	}
	return claims
}

// HasScope checks if the current auth context has the given scope.
// JWT sessions always return true (full access).
// API tokens must have the scope in their scopes list.
func HasScope(claims *Claims, scope string) bool {
	if claims == nil {
		return false
	}
	// JWT users have full access
	if claims.Auth == AuthTypeJWT || claims.Auth == "" {
		return true
	}
	// API tokens: check scopes
	for _, s := range claims.Scopes {
		if s == scope || s == "admin" {
			return true
		}
	}
	return false
}

type tokenExpiredError struct{}

func (tokenExpiredError) Error() string { return "token expired" }

var errTokenExpired error = tokenExpiredError{}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
