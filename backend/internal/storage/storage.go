package storage

import (
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // register PNG decoder
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/draw"
)

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

	// Resize to 200px width maintaining aspect ratio.
	newW := 200
	newH := (origH * newW) / origW
	if newH == 0 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), srcImg, srcImg.Bounds(), draw.Over, nil)

	ext := filepath.Ext(storagePath)
	thumbPath := strings.TrimSuffix(storagePath, ext) + "_thumb.jpg"

	thumbFile, err := os.Create(thumbPath)
	if err != nil {
		return "", fmt.Errorf("creating thumbnail: %w", err)
	}
	defer thumbFile.Close()

	if err := jpeg.Encode(thumbFile, dst, &jpeg.Options{Quality: 80}); err != nil {
		os.Remove(thumbPath)
		return "", fmt.Errorf("encoding thumbnail: %w", err)
	}

	return thumbPath, nil
}
