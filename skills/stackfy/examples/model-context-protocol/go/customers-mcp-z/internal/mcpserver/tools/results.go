package tools

import (
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The original words every tool's failure as a listing failure.
func failure(err error) error {
	return fmt.Errorf("Failed to list customers. Error: %w", err)
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

func messageOf(answer json.RawMessage) string {
	var mutation struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(answer, &mutation); err != nil {
		return ""
	}

	return mutation.Message
}
