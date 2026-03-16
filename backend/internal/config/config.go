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
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	return cfg, nil
}
