package storage

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // register PNG decoder
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/draw"
)

// --- FileService (legacy — used by handlers until Phase 5 migration) ---

// FileService handles file storage on the local filesystem.
type FileService struct {
	uploadDir string
}

// NewFileService creates a new FileService and ensures the upload directory exists.
func NewFileService(uploadDir string) *FileService {
	return &FileService{uploadDir: uploadDir}
}

// EnsureDir creates the upload directory structure.
func (s *FileService) EnsureDir() error {
	return os.MkdirAll(s.uploadDir, 0o755)
}

// Save stores a multipart file to disk with a date-based directory structure.
// Returns the generated filename and the full storage path.
func (s *FileService) Save(file multipart.File, header *multipart.FileHeader) (filename, storagePath string, err error) {
	now := time.Now()
	dir := filepath.Join(s.uploadDir, now.Format("2006"), now.Format("01"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", fmt.Errorf("creating upload dir: %w", err)
	}

	ext := filepath.Ext(header.Filename)
	filename = uuid.New().String() + ext
	storagePath = filepath.Join(dir, filename)

	dst, err := os.Create(storagePath)
	if err != nil {
		return "", "", fmt.Errorf("creating file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(storagePath)
		return "", "", fmt.Errorf("writing file: %w", err)
	}

	return filename, storagePath, nil
}

// GenerateThumbnail creates a thumbnail for image files (JPEG/PNG).
// Returns the thumbnail path or empty string if not an image.
func (s *FileService) GenerateThumbnail(storagePath, mimeType string) (thumbnailPath string, err error) {
	return generateThumbnailFromPath(storagePath, mimeType)
}

// --- StorageService (new — backends-aware) ---

// StorageService wraps a SwappableBackend and handles key generation,
// thumbnail creation, and file serving (local or S3 proxy).
type StorageService struct {
	backend  *SwappableBackend
	local    *LocalBackend // kept for http.ServeFile optimization
}

// NewStorageService creates a StorageService with the given swappable backend.
// local is the LocalBackend (needed for zero-copy serving when backend is local).
func NewStorageService(b *SwappableBackend, local *LocalBackend) *StorageService {
	return &StorageService{backend: b, local: local}
}

// generateKey produces a date-partitioned object key: YYYY/MM/<uuid><ext>
func generateKey(ext string) string {
	now := time.Now()
	return fmt.Sprintf("%s/%s/%s%s", now.Format("2006"), now.Format("01"), uuid.New().String(), ext)
}

// Save stores a multipart file via the active backend and returns the
// relative storage key and generated filename.
func (s *StorageService) Save(ctx context.Context, file multipart.File, header *multipart.FileHeader, mimeType string) (filename, key string, err error) {
	ext := filepath.Ext(header.Filename)
	key = generateKey(ext)
	filename = uuid.New().String() + ext // for DB filename field

	// Read into buffer so we know the size (required for S3 PutObject).
	data, err := io.ReadAll(file)
	if err != nil {
		return "", "", fmt.Errorf("reading upload: %w", err)
	}

	if err := s.backend.Put(ctx, key, bytes.NewReader(data), mimeType, int64(len(data))); err != nil {
		return "", "", fmt.Errorf("storing file: %w", err)
	}
	return filename, key, nil
}

// GenerateThumbnail creates a thumbnail for image files and stores it via the
// active backend. Returns the thumbnail key or empty string if not applicable.
func (s *StorageService) GenerateThumbnail(ctx context.Context, key, mimeType string) (thumbKey string, err error) {
	lower := strings.ToLower(mimeType)
	if !strings.HasPrefix(lower, "image/jpeg") && !strings.HasPrefix(lower, "image/png") {
		return "", nil
	}

	// Fetch source image.
	rc, err := s.backend.Get(ctx, key)
	if err != nil {
		return "", fmt.Errorf("fetching source for thumbnail: %w", err)
	}
	defer rc.Close()

	srcImg, _, err := image.Decode(rc)
	if err != nil {
		return "", fmt.Errorf("decoding image: %w", err)
	}

	bounds := srcImg.Bounds()
	origW := bounds.Dx()
	if origW == 0 {
		return "", nil
	}

	origH := bounds.Dy()
	newW := 200
	newH := (origH * newW) / origW
	if newH == 0 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), srcImg, srcImg.Bounds(), draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 80}); err != nil {
		return "", fmt.Errorf("encoding thumbnail: %w", err)
	}

	// Derive thumbnail key from original key.
	ext := filepath.Ext(key)
	thumbKey = strings.TrimSuffix(key, ext) + "_thumb.jpg"

	data := buf.Bytes()
	if err := s.backend.Put(ctx, thumbKey, bytes.NewReader(data), "image/jpeg", int64(len(data))); err != nil {
		return "", fmt.Errorf("storing thumbnail: %w", err)
	}
	return thumbKey, nil
}

// ServeFile writes the file identified by key to w.
// For local backends, it uses http.ServeFile for efficient zero-copy serving.
// For S3 backends, it proxies through the backend.
func (s *StorageService) ServeFile(w http.ResponseWriter, r *http.Request, key, mimeType, originalName, backendType string) {
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+originalName+"\"")

	if (backendType == "local" || backendType == "") && s.local != nil {
		http.ServeFile(w, r, s.local.FullPath(key))
		return
	}

	rc, err := s.backend.Get(r.Context(), key)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	defer rc.Close()
	io.Copy(w, rc) //nolint:errcheck
}

// ServeThumbnail writes the thumbnail identified by key to w.
func (s *StorageService) ServeThumbnail(w http.ResponseWriter, r *http.Request, key, backendType string) {
	w.Header().Set("Content-Type", "image/jpeg")

	if (backendType == "local" || backendType == "") && s.local != nil {
		http.ServeFile(w, r, s.local.FullPath(key))
		return
	}

	rc, err := s.backend.Get(r.Context(), key)
	if err != nil {
		http.Error(w, "thumbnail not found", http.StatusNotFound)
		return
	}
	defer rc.Close()
	io.Copy(w, rc) //nolint:errcheck
}

// Delete removes a blob from the appropriate backend.
func (s *StorageService) Delete(ctx context.Context, key, backendType string) error {
	if (backendType == "local" || backendType == "") && s.local != nil {
		return s.local.Delete(ctx, key)
	}
	return s.backend.Delete(ctx, key)
}

// Backend returns the underlying swappable backend.
func (s *StorageService) Backend() *SwappableBackend {
	return s.backend
}

// --- shared helpers ---

func generateThumbnailFromPath(storagePath, mimeType string) (thumbnailPath string, err error) {
	lower := strings.ToLower(mimeType)
	if !strings.HasPrefix(lower, "image/jpeg") && !strings.HasPrefix(lower, "image/png") {
		return "", nil
	}

	src, err := os.Open(storagePath)
	if err != nil {
		return "", fmt.Errorf("opening source: %w", err)
	}
	defer src.Close()

	srcImg, _, err := image.Decode(src)
	if err != nil {
		return "", fmt.Errorf("decoding image: %w", err)
	}

	bounds := srcImg.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()

	if origW == 0 {
		return "", nil
	}

	newW := 200
	newH := (origH * newW) / origW
	if newH == 0 {
		newH = 1
	}

	dstImg := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.ApproxBiLinear.Scale(dstImg, dstImg.Bounds(), srcImg, srcImg.Bounds(), draw.Over, nil)

	ext := filepath.Ext(storagePath)
	thumbPath := strings.TrimSuffix(storagePath, ext) + "_thumb.jpg"

	thumbFile, err := os.Create(thumbPath)
	if err != nil {
		return "", fmt.Errorf("creating thumbnail: %w", err)
	}
	defer thumbFile.Close()

	if err := jpeg.Encode(thumbFile, dstImg, &jpeg.Options{Quality: 80}); err != nil {
		os.Remove(thumbPath)
		return "", fmt.Errorf("encoding thumbnail: %w", err)
	}

	return thumbPath, nil
}
