package tests

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Every test package sits two folders below the module, which go run starts.
func CreateTestClient(t *testing.T) *mcp.ClientSession {
	t.Helper()

	command := exec.Command("go", "run", ".")
	command.Dir = filepath.Join("..", "..")
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "1.0.1"}, nil)

	session, err := client.Connect(context.Background(), &mcp.CommandTransport{Command: command}, nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { session.Close() })

	return session
}

func StructuredContent(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()

	content, isObject := result.StructuredContent.(map[string]any)
	if !isObject {
		t.Fatalf("structured content %v is not an object", result.StructuredContent)
	}

	return content
}
