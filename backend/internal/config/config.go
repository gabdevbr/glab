package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Port        int    `env:"PORT" envDefault:"8080"`
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL" envDefault:"redis://localhost:6379"`
	JWTSecret   string `env:"JWT_SECRET,required"`
	JWTExpiry   int    `env:"JWT_EXPIRY" envDefault:"604800"`
	UploadDir   string `env:"UPLOAD_DIR" envDefault:"./uploads"`
	CORSOrigin  string `env:"CORS_ORIGIN" envDefault:"http://localhost:3000"`

	// Error tracking — auto-creates GitHub issues on 5xx errors.
	GitHubToken     string `env:"GITHUB_TOKEN" envDefault:""`
	GitHubRepoOwner string `env:"GITHUB_REPO_OWNER" envDefault:"gabdevbr"`
	GitHubRepoName  string `env:"GITHUB_REPO_NAME" envDefault:"glab"`

	// RC bridge — AES-256 key (32 bytes, base64-encoded) for encrypting RC auth tokens.
	// If empty, tokens are stored as plain base64 (acceptable for dev; use a real key in prod).
	RCEncryptionKey string `env:"GLAB_RC_ENCRYPTION_KEY" envDefault:""`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	return cfg, nil
}
