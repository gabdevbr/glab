package errtrack

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gabdevbr/glab/backend/internal/auth"
)

// Config holds GitHub issue reporter settings.
type Config struct {
	GitHubToken string
	RepoOwner   string
	RepoName    string
}

// Reporter creates GitHub issues for server errors.
type Reporter struct {
	cfg     Config
	client  *http.Client
	seen    map[string]time.Time // dedup by error message
	mu      sync.Mutex
	deduTTL time.Duration
}

// NewReporter creates a new error reporter.
func NewReporter(cfg Config) *Reporter {
	return &Reporter{
		cfg:     cfg,
		client:  &http.Client{Timeout: 10 * time.Second},
		seen:    make(map[string]time.Time),
		deduTTL: 1 * time.Hour,
	}
}

// Enabled returns true if the reporter is configured.
func (r *Reporter) Enabled() bool {
	return r.cfg.GitHubToken != "" && r.cfg.RepoOwner != "" && r.cfg.RepoName != ""
}

// Report files a GitHub issue for a 5xx error if not recently reported.
func (r *Reporter) Report(method, path, errMsg string, status int, userID string) {
	if !r.Enabled() {
		return
	}

	deduKey := fmt.Sprintf("%s %s: %s", method, path, errMsg)

	r.mu.Lock()
	if lastSeen, ok := r.seen[deduKey]; ok && time.Since(lastSeen) < r.deduTTL {
		r.mu.Unlock()
		return
	}
	r.seen[deduKey] = time.Now()
	// Prune old entries
	for k, v := range r.seen {
		if time.Since(v) > r.deduTTL {
			delete(r.seen, k)
		}
	}
	r.mu.Unlock()

	go r.createIssue(method, path, errMsg, status, userID)
}

func (r *Reporter) createIssue(method, path, errMsg string, status int, userID string) {
	title := fmt.Sprintf("[auto] %d on %s %s", status, method, path)

	body := fmt.Sprintf("## Automated Error Report\n\n"+
		"**Status:** %d\n"+
		"**Method:** %s\n"+
		"**Path:** %s\n"+
		"**Error:** %s\n"+
		"**User:** %s\n"+
		"**Time:** %s\n",
		status, method, path, errMsg, userID, time.Now().UTC().Format(time.RFC3339))

	payload, _ := json.Marshal(map[string]interface{}{
		"title":  title,
		"body":   body,
		"labels": []string{"bug", "auto-reported"},
	})

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues", r.cfg.RepoOwner, r.cfg.RepoName)
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		slog.Error("errtrack: failed to create request", "error", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+r.cfg.GitHubToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		slog.Error("errtrack: failed to create issue", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		slog.Error("errtrack: GitHub API error", "status", resp.StatusCode)
		return
	}

	slog.Info("errtrack: issue created", "title", title)
}

// statusCapture wraps ResponseWriter to capture the status code and error body.
type statusCapture struct {
	http.ResponseWriter
	status int
	body   []byte
}

func (s *statusCapture) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusCapture) Write(b []byte) (int, error) {
	if s.status >= 500 {
		s.body = append(s.body, b...)
	}
	return s.ResponseWriter.Write(b)
}

// Middleware returns an HTTP middleware that reports 5xx errors.
func (r *Reporter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !r.Enabled() {
			next.ServeHTTP(w, req)
			return
		}

		sc := &statusCapture{ResponseWriter: w, status: 200}
		next.ServeHTTP(sc, req)

		if sc.status >= 500 {
			errMsg := ""
			var errResp map[string]string
			if json.Unmarshal(sc.body, &errResp) == nil {
				errMsg = errResp["error"]
			}
			if errMsg == "" {
				errMsg = string(sc.body)
			}

			userID := "anonymous"
			if claims := auth.UserFromContext(req.Context()); claims != nil {
				userID = claims.UserID
			}

			r.Report(req.Method, req.URL.Path, errMsg, sc.status, userID)
		}
	})
}
