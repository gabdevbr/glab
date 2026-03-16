package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey string

const claimsKey contextKey = "claims"

// Middleware returns a chi-compatible middleware that validates JWT tokens
// from the Authorization header and injects claims into the request context.
func Middleware(secret string) func(http.Handler) http.Handler {
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

			claims, err := ValidateToken(parts[1], secret)
			if err != nil {
				writeUnauthorized(w)
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
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

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
