package s3uploader

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Config holds S3-compatible object storage configuration.
// Mirrors backend/internal/storage.S3Config.
type Config struct {
	Endpoint       string
	Region         string
	Bucket         string
	AccessKeyID    string
	SecretAccessKey string
	KeyPrefix      string
	ForcePathStyle bool
}

// Uploader streams files to S3-compatible object storage.
type Uploader struct {
	client *s3.Client
	cfg    Config
}

// New creates an S3 uploader and validates the connection.
func New(ctx context.Context, cfg Config) (*Uploader, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		)),
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("s3 load config: %w", err)
	}

	clientOpts := []func(*s3.Options){
		func(o *s3.Options) {
			o.UsePathStyle = cfg.ForcePathStyle
		},
	}
	if cfg.Endpoint != "" {
		clientOpts = append(clientOpts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		})
	}

	client := s3.NewFromConfig(awsCfg, clientOpts...)
	u := &Uploader{client: client, cfg: cfg}

	// Validate bucket access.
	if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(cfg.Bucket),
	}); err != nil {
		return nil, fmt.Errorf("s3 bucket %q not accessible: %w", cfg.Bucket, err)
	}

	return u, nil
}

func (u *Uploader) fullKey(key string) string {
	if u.cfg.KeyPrefix == "" {
		return key
	}
	return u.cfg.KeyPrefix + "/" + key
}

// Put streams data to the given key. Size must be the content length (from HTTP Content-Length).
func (u *Uploader) Put(ctx context.Context, key string, reader io.Reader, contentType string, size int64) error {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(u.cfg.Bucket),
		Key:         aws.String(u.fullKey(key)),
		Body:        reader,
		ContentType: aws.String(contentType),
	}
	if size > 0 {
		input.ContentLength = aws.Int64(size)
	}
	if _, err := u.client.PutObject(ctx, input); err != nil {
		return fmt.Errorf("s3 put %q: %w", key, err)
	}
	return nil
}

// Exists checks whether an object exists at the given key.
func (u *Uploader) Exists(ctx context.Context, key string) (bool, error) {
	_, err := u.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(u.cfg.Bucket),
		Key:    aws.String(u.fullKey(key)),
	})
	if err != nil {
		var nf *types.NotFound
		if errors.As(err, &nf) {
			return false, nil
		}
		// HeadObject also returns 404 as a generic smithy error in some providers.
		var apiErr interface{ HTTPStatusCode() int }
		if errors.As(err, &apiErr) && apiErr.HTTPStatusCode() == 404 {
			return false, nil
		}
		return false, fmt.Errorf("s3 exists %q: %w", key, err)
	}
	return true, nil
}
