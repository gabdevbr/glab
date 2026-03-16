package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// StreamChunk represents a single chunk of a streaming AI response.
type StreamChunk struct {
	Content      string
	FinishReason string
	Done         bool
}

// ChatMessage represents a single message in a chat completion request.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// BridgeClient is an SSE streaming client for the OpenClaw AI gateway.
type BridgeClient struct {
	httpClient *http.Client
}

// NewBridgeClient creates a new BridgeClient with a 120s timeout.
func NewBridgeClient() *BridgeClient {
	return &BridgeClient{
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// chatCompletionRequest is the request body for the OpenClaw API.
type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float32       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

// sseResponse is the parsed JSON from a data: line in the SSE stream.
type sseResponse struct {
	ID      string     `json:"id"`
	Choices []sseChoice `json:"choices"`
}

type sseChoice struct {
	Index        int      `json:"index"`
	Delta        sseDelta `json:"delta"`
	FinishReason *string  `json:"finish_reason"`
}

type sseDelta struct {
	Content string `json:"content"`
	Role    string `json:"role"`
}

// Stream sends a chat completion request and returns a channel of StreamChunks.
// The channel is closed when the stream ends or the context is cancelled.
func (b *BridgeClient) Stream(ctx context.Context, gatewayURL, token, model string, messages []ChatMessage, maxTokens int, temperature float32) (<-chan StreamChunk, error) {
	reqBody := chatCompletionRequest{
		Model:       model,
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		Stream:      true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := strings.TrimRight(gatewayURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("gateway returned %d: %s", resp.StatusCode, string(body))
	}

	ch := make(chan StreamChunk, 64)

	go func() {
		defer close(ch)
		defer resp.Body.Close()

		scanner := bufio.NewScanner(resp.Body)
		// Increase scanner buffer for large chunks
		scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

		for scanner.Scan() {
			line := scanner.Text()

			// Check context cancellation
			select {
			case <-ctx.Done():
				return
			default:
			}

			// Skip empty lines and SSE comments
			if line == "" || strings.HasPrefix(line, ":") {
				continue
			}

			// Handle data: prefix
			if !strings.HasPrefix(line, "data: ") {
				continue
			}

			data := strings.TrimPrefix(line, "data: ")

			// Terminal signal
			if data == "[DONE]" {
				ch <- StreamChunk{Done: true}
				return
			}

			// Parse the JSON chunk
			var sse sseResponse
			if err := json.Unmarshal([]byte(data), &sse); err != nil {
				slog.Warn("ai: failed to parse SSE chunk", "error", err, "data", data)
				continue
			}

			if len(sse.Choices) == 0 {
				continue
			}

			choice := sse.Choices[0]
			chunk := StreamChunk{
				Content: choice.Delta.Content,
			}

			if choice.FinishReason != nil {
				chunk.FinishReason = *choice.FinishReason
				if *choice.FinishReason == "stop" {
					chunk.Done = true
				}
			}

			select {
			case ch <- chunk:
			case <-ctx.Done():
				return
			}
		}

		if err := scanner.Err(); err != nil {
			slog.Error("ai: scanner error", "error", err)
		}
	}()

	return ch, nil
}
