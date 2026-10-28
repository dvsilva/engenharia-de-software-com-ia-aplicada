package ollama

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const defaultHost = "http://127.0.0.1:11434"

type Message struct {
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	Thinking  string     `json:"thinking,omitempty"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
	ToolName  string     `json:"tool_name,omitempty"`
}

type ToolCall struct {
	ID       string       `json:"id,omitempty"`
	Function FunctionCall `json:"function"`
}

type FunctionCall struct {
	Index     *int            `json:"index,omitempty"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type Tool struct {
	Type     string             `json:"type"`
	Function FunctionDefinition `json:"function"`
}

type FunctionDefinition struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []Tool    `json:"tools,omitempty"`
	Stream   bool      `json:"stream"`
}

type ChatResponse struct {
	Message Message `json:"message"`
}

type ResponseError struct {
	StatusCode int
	Message    string
}

func (failure *ResponseError) Error() string {
	return failure.Message
}

func Host() string {
	host := strings.TrimSpace(os.Getenv("OLLAMA_HOST"))
	if host == "" {
		return defaultHost
	}
	if !strings.Contains(host, "://") {
		host = "http://" + host
	}

	return strings.TrimSuffix(host, "/")
}

func Chat(ctx context.Context, request ChatRequest) (ChatResponse, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return ChatResponse{}, err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, Host()+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return ChatResponse{}, err
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return ChatResponse{}, err
	}
	if response.StatusCode >= http.StatusBadRequest {
		return ChatResponse{}, responseError(response.StatusCode, payload)
	}

	var chat ChatResponse
	if err := json.Unmarshal(payload, &chat); err != nil {
		return ChatResponse{}, fmt.Errorf("invalid chat response: %w", err)
	}

	return chat, nil
}

func responseError(statusCode int, payload []byte) *ResponseError {
	var body struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(payload, &body) != nil || body.Error == "" {
		return &ResponseError{StatusCode: statusCode, Message: strings.TrimSpace(string(payload))}
	}

	return &ResponseError{StatusCode: statusCode, Message: body.Error}
}
