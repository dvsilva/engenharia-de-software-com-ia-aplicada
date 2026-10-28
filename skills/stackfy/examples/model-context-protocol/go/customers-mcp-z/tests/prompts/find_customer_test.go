package prompts_test

import (
	"context"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/tests"
)

func TestCustomerPrompts(t *testing.T) {
	session := tests.CreateTestClient(t)

	t.Run("renders find_customer_prompt", func(t *testing.T) {
		result, err := session.GetPrompt(context.Background(), &mcp.GetPromptParams{
			Name:      "find_customer_prompt",
			Arguments: map[string]string{"name": "John"},
		})
		if err != nil {
			t.Fatal(err)
		}
		text := result.Messages[0].Content.(*mcp.TextContent).Text

		if !strings.Contains(text, "get_customer") {
			t.Fatal("the prompt does not mention the get_customer tool")
		}
		if !strings.Contains(text, "John") {
			t.Fatal("the prompt does not include the query")
		}
	})
}
