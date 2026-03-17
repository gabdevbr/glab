package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalBackend stores files on the local filesystem under a base directory.
type LocalBackend struct {
	baseDir string
}

// NewLocalBackend creates a LocalBackend rooted at baseDir.
func NewLocalBackend(baseDir string) *LocalBackend {
	return &LocalBackend{baseDir: baseDir}
}

// EnsureDir creates the base directory if it does not exist.
func (b *LocalBackend) EnsureDir() error {
	return os.MkdirAll(b.baseDir, 0o755)
}

// FullPath returns the absolute path for a relative storage key.
// Used by the file handler to call http.ServeFile directly (avoids copy).
func (b *LocalBackend) FullPath(key string) string {
	return filepath.Join(b.baseDir, filepath.FromSlash(key))
}

func (b *LocalBackend) Put(_ context.Context, key string, reader io.Reader, _ string, _ int64) error {
	dst := b.FullPath(key)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("local put mkdir: %w", err)
	}
	f, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("local put create: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, reader); err != nil {
		os.Remove(dst)
		return fmt.Errorf("local put write: %w", err)
	}
	return nil
}

func (b *LocalBackend) Get(_ context.Context, key string) (io.ReadCloser, error) {
	f, err := os.Open(b.FullPath(key))
	if err != nil {
		return nil, fmt.Errorf("local get: %w", err)
	}
	return f, nil
}

func (b *LocalBackend) Delete(_ context.Context, key string) error {
	err := os.Remove(b.FullPath(key))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (b *LocalBackend) Exists(_ context.Context, key string) (bool, error) {
	_, err := os.Stat(b.FullPath(key))
	if os.IsNotExist(err) {
		return false, nil
	}
	return err == nil, err
}

func (b *LocalBackend) Type() string { return "local" }
