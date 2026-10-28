package resources_test

import (
	"context"
	"testing"

	"customers-mcp/tests"
)

func TestCustomerResources(t *testing.T) {
	session := tests.CreateTestClient(t)

	t.Run("lists the customers://api-info resource", func(t *testing.T) {
		result, err := session.ListResources(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}

		for _, resource := range result.Resources {
			if resource.URI != "customers://api-info" {
				continue
			}
			if resource.Description != "describes the customers rest API that this MCP server wraps" {
				t.Fatalf("description %q is not the API's", resource.Description)
			}
			return
		}
		t.Fatal("customers://api-info is not listed")
	})
}
