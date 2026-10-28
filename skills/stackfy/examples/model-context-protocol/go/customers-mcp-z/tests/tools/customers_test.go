package tools_test

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/tests"
)

func callTool(t *testing.T, session *mcp.ClientSession, name string, arguments map[string]any) map[string]any {
	t.Helper()

	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: arguments})
	if err != nil {
		t.Fatal(err)
	}

	return tests.StructuredContent(t, result)
}

func TestCustomerMCPSuite(t *testing.T) {
	session := tests.CreateTestClient(t)

	t.Run("lists all customers", func(t *testing.T) {
		result := callTool(t, session, "list_customers", map[string]any{})

		if _, isList := result["customers"].([]any); !isList {
			t.Fatalf("customers %v is not a list", result["customers"])
		}
	})

	t.Run("creates a customer", func(t *testing.T) {
		result := callTool(t, session, "create_customer", map[string]any{"name": "Ana", "phone": "999-000-111"})

		if result["id"] == "" || result["id"] == nil {
			t.Fatal("the result has no id")
		}
		if result["message"] != "user Ana created!" {
			t.Fatalf("message %v, expected user Ana created!", result["message"])
		}
	})

	t.Run("updates a customer", func(t *testing.T) {
		created := callTool(t, session, "create_customer", map[string]any{"name": "Xuxa da Silva", "phone": "12331236"})
		result := callTool(t, session, "update_customer", map[string]any{"_id": created["id"], "name": "Jozé da silva", "phone": "12331236"})

		if result["message"] == "" || result["message"] == nil {
			t.Fatal("the result has no message")
		}
		if result["id"] != created["id"] {
			t.Fatalf("id %v, expected %v", result["id"], created["id"])
		}
	})

	t.Run("deletes a customer", func(t *testing.T) {
		created := callTool(t, session, "create_customer", map[string]any{"name": "Mariazina", "phone": "654566456"})
		result := callTool(t, session, "delete_customer", map[string]any{"_id": created["id"]})

		if result["message"] != "User "+created["id"].(string)+" deleted!" {
			t.Fatalf("message %v does not confirm the deletion", result["message"])
		}
		if result["id"] != created["id"] {
			t.Fatalf("id %v, expected %v", result["id"], created["id"])
		}
	})
}
