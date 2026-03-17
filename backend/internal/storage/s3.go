package storage

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Config holds configuration for any S3-compatible object storage provider.
type S3Config struct {
	Endpoint        string // custom endpoint URL (leave empty for AWS)
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	KeyPrefix       string // optional prefix for all keys
	ForcePathStyle  bool   // required for some providers (MinIO, IBM COS)
}

// S3Backend stores files in any S3-compatible object storage.
// Supports AWS S3, IBM Cloud Object Storage, Zadara, MinIO, etc.
type S3Backend struct {
	client *s3.Client
	cfg    S3Config
}

// NewS3Backend creates and validates an S3Backend from the given config.
func NewS3Backend(ctx context.Context, cfg S3Config) (*S3Backend, error) {
	opts := []func(*config.LoadOptions) error{
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		)),
	}

	awsCfg, err := config.LoadDefaultConfig(ctx, opts...)
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
	return &S3Backend{client: client, cfg: cfg}, nil
}

func (b *S3Backend) fullKey(key string) string {
	if b.cfg.KeyPrefix == "" {
		return key
	}
	return b.cfg.KeyPrefix + "/" + key
}

func (b *S3Backend) Put(ctx context.Context, key string, reader io.Reader, contentType string, size int64) error {
	_, err := b.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(b.cfg.Bucket),
		Key:           aws.String(b.fullKey(key)),
		Body:          reader,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return fmt.Errorf("s3 put %q: %w", key, err)
	}
	return nil
}

func (b *S3Backend) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := b.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(b.cfg.Bucket),
		Key:    aws.String(b.fullKey(key)),
	})
	if err != nil {
		return nil, fmt.Errorf("s3 get %q: %w", key, err)
	}
	return out.Body, nil
}

func (b *S3Backend) Delete(ctx context.Context, key string) error {
	_, err := b.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(b.cfg.Bucket),
		Key:    aws.String(b.fullKey(key)),
	})
	if err != nil {
		var nsk *types.NoSuchKey
		if errors.As(err, &nsk) {
			return nil
		}
		return fmt.Errorf("s3 delete %q: %w", key, err)
	}
	return nil
}

func (b *S3Backend) Exists(ctx context.Context, key string) (bool, error) {
	_, err := b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.cfg.Bucket),
		Key:    aws.String(b.fullKey(key)),
	})
	if err != nil {
		var nf *types.NotFound
		if errors.As(err, &nf) {
			return false, nil
		}
		return false, fmt.Errorf("s3 exists %q: %w", key, err)
	}
	return true, nil
}

func (b *S3Backend) Type() string { return "s3" }

// TestConnection performs a lightweight check (HeadBucket) to verify credentials
// and bucket access without modifying any data.
func (b *S3Backend) TestConnection(ctx context.Context) error {
	_, err := b.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(b.cfg.Bucket),
	})
	if err != nil {
		return fmt.Errorf("s3 connection test failed: %w", err)
	}
	return nil
}
