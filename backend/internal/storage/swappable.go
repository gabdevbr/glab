package storage

import (
	"context"
	"fmt"
	"io"
	"sync"
)

// SwappableBackend wraps a StorageBackend and allows hot-swapping the active
// backend at runtime (e.g. when the admin changes storage configuration).
// All reads/writes are protected by an RWMutex.
type SwappableBackend struct {
	mu      sync.RWMutex
	backend StorageBackend
}

// NewSwappableBackend creates a SwappableBackend with the given initial backend.
func NewSwappableBackend(b StorageBackend) *SwappableBackend {
	return &SwappableBackend{backend: b}
}

// Swap atomically replaces the active backend.
func (s *SwappableBackend) Swap(b StorageBackend) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.backend = b
}

// Current returns the active backend (for inspection, not direct use).
func (s *SwappableBackend) Current() StorageBackend {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.backend
}

func (s *SwappableBackend) get() (StorageBackend, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.backend == nil {
		return nil, fmt.Errorf("no storage backend configured")
	}
	return s.backend, nil
}

func (s *SwappableBackend) Put(ctx context.Context, key string, reader io.Reader, contentType string, size int64) error {
	b, err := s.get()
	if err != nil {
		return err
	}
	return b.Put(ctx, key, reader, contentType, size)
}

func (s *SwappableBackend) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	b, err := s.get()
	if err != nil {
		return nil, err
	}
	return b.Get(ctx, key)
}

func (s *SwappableBackend) Delete(ctx context.Context, key string) error {
	b, err := s.get()
	if err != nil {
		return err
	}
	return b.Delete(ctx, key)
}

func (s *SwappableBackend) Exists(ctx context.Context, key string) (bool, error) {
	b, err := s.get()
	if err != nil {
		return false, err
	}
	return b.Exists(ctx, key)
}

func (s *SwappableBackend) Type() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.backend == nil {
		return "none"
	}
	return s.backend.Type()
}
