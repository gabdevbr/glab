package storage

import (
	"context"
	"io"
)

// StorageBackend is the interface all storage implementations must satisfy.
type StorageBackend interface {
	// Put stores data from reader under the given key with the given content type.
	Put(ctx context.Context, key string, reader io.Reader, contentType string, size int64) error

	// Get retrieves data for the given key. Caller must close the returned ReadCloser.
	Get(ctx context.Context, key string) (io.ReadCloser, error)

	// Delete removes the object at the given key. Returns nil if key does not exist.
	Delete(ctx context.Context, key string) error

	// Exists reports whether an object exists at the given key.
	Exists(ctx context.Context, key string) (bool, error)

	// Type returns the backend identifier: "local" or "s3".
	Type() string
}
