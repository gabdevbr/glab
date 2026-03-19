package giphy

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/repository"
)

const configKey = "giphy"

// Config holds the Giphy API configuration stored in app_config.
type Config struct {
	APIKey string `json:"api_key"`
}

// ConfigService loads and saves Giphy configuration.
type ConfigService struct {
	queries *repository.Queries
}

// NewConfigService creates a ConfigService.
func NewConfigService(q *repository.Queries) *ConfigService {
	return &ConfigService{queries: q}
}

// Load returns the current Giphy config from the database.
func (s *ConfigService) Load(ctx context.Context) (Config, error) {
	row, err := s.queries.GetAppConfig(ctx, configKey)
	if err != nil {
		return Config{}, fmt.Errorf("loading giphy config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(row.Value, &cfg); err != nil {
		return Config{}, fmt.Errorf("parsing giphy config: %w", err)
	}
	return cfg, nil
}

// Save persists the Giphy config to the database.
func (s *ConfigService) Save(ctx context.Context, cfg Config, updatedBy *pgtype.UUID) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshaling giphy config: %w", err)
	}
	var userID pgtype.UUID
	if updatedBy != nil {
		userID = *updatedBy
	}
	_, err = s.queries.UpsertAppConfig(ctx, repository.UpsertAppConfigParams{
		Key:       configKey,
		Value:     data,
		UpdatedBy: userID,
	})
	return err
}

// Gif represents a single GIF result from the Giphy API.
type Gif struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	PreviewURL string `json:"preview_url"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
}

// Client communicates with the Giphy API.
type Client struct {
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a Giphy API client.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Search searches for GIFs matching the query.
func (c *Client) Search(ctx context.Context, query string, limit int) ([]Gif, error) {
	u := fmt.Sprintf("https://api.giphy.com/v1/gifs/search?api_key=%s&q=%s&limit=%s&rating=g",
		url.QueryEscape(c.apiKey),
		url.QueryEscape(query),
		strconv.Itoa(limit),
	)
	return c.fetch(ctx, u)
}

// Trending returns currently trending GIFs.
func (c *Client) Trending(ctx context.Context, limit int) ([]Gif, error) {
	u := fmt.Sprintf("https://api.giphy.com/v1/gifs/trending?api_key=%s&limit=%s&rating=g",
		url.QueryEscape(c.apiKey),
		strconv.Itoa(limit),
	)
	return c.fetch(ctx, u)
}

type giphyAPIResponse struct {
	Data []struct {
		ID     string `json:"id"`
		Title  string `json:"title"`
		Images struct {
			Original struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"original"`
			FixedHeightSmall struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"fixed_height_small"`
		} `json:"images"`
	} `json:"data"`
}

func (c *Client) fetch(ctx context.Context, rawURL string) ([]Gif, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("building giphy request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("giphy API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("giphy API returned HTTP %d", resp.StatusCode)
	}

	var apiResp giphyAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("parsing giphy response: %w", err)
	}

	gifs := make([]Gif, 0, len(apiResp.Data))
	for _, d := range apiResp.Data {
		w, _ := strconv.Atoi(d.Images.FixedHeightSmall.Width)
		h, _ := strconv.Atoi(d.Images.FixedHeightSmall.Height)
		gifs = append(gifs, Gif{
			ID:         d.ID,
			Title:      d.Title,
			URL:        d.Images.Original.URL,
			PreviewURL: d.Images.FixedHeightSmall.URL,
			Width:      w,
			Height:     h,
		})
	}
	return gifs, nil
}
