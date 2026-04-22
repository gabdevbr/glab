package rcbridge

import (
	"context"
	"log/slog"
	"sync"
)

// SessionPool manages per-user RC DDP sessions.
type SessionPool struct {
	sessions map[string]*Session // keyed by Glab userID
	mu       sync.RWMutex
	maxSize  int
}

func newSessionPool(maxSize int) *SessionPool {
	return &SessionPool{
		sessions: make(map[string]*Session),
		maxSize:  maxSize,
	}
}

// Attach creates a DDP session for the user if one doesn't exist yet.
// The session starts in a background goroutine.
func (p *SessionPool) Attach(ctx context.Context, s *Session) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if _, exists := p.sessions[s.userID]; exists {
		return // already have a live session
	}

	if p.maxSize > 0 && len(p.sessions) >= p.maxSize {
		slog.Warn("rcbridge: session pool full, skipping", "user_id", s.userID, "size", len(p.sessions))
		return
	}

	p.sessions[s.userID] = s
	go func() {
		if err := s.Start(ctx); err != nil {
			slog.Warn("rcbridge: session failed to start", "user_id", s.userID, "error", err)
		}
		// Remove from pool when session ends
		p.mu.Lock()
		delete(p.sessions, s.userID)
		p.mu.Unlock()
	}()
}

// Detach stops and removes the session for a user.
func (p *SessionPool) Detach(userID string) {
	p.mu.Lock()
	s, ok := p.sessions[userID]
	if ok {
		delete(p.sessions, userID)
	}
	p.mu.Unlock()

	if s != nil {
		s.Stop()
	}
}

// Get returns the active session for a user (nil if none).
func (p *SessionPool) Get(userID string) *Session {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.sessions[userID]
}

// Size returns the number of active sessions.
func (p *SessionPool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.sessions)
}

// StopAll stops all sessions (called on bridge shutdown).
func (p *SessionPool) StopAll() {
	p.mu.Lock()
	sessions := make([]*Session, 0, len(p.sessions))
	for _, s := range p.sessions {
		sessions = append(sessions, s)
	}
	p.sessions = make(map[string]*Session)
	p.mu.Unlock()

	for _, s := range sessions {
		s.Stop()
	}
}
