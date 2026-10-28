package tools

import (
	"context"
	"encoding/json"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/application"
	"customers-mcp/internal/domain"
	"customers-mcp/internal/jsontext"
)

type customerList struct {
	Customers []json.RawMessage `json:"customers"`
}

func RegisterListCustomersTool(server *mcp.Server, service *application.CustomerService) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_customers",
		Description: "List all customers",
		InputSchema: domain.Object(map[string]*jsonschema.Schema{}),
		OutputSchema: domain.Object(map[string]*jsonschema.Schema{
			"customers": {Type: "array", Items: domain.CustomerSchema(), Description: "Array of all customers"},
		}, "customers"),
	}, func(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, customerList, error) {
		customers, err := service.ListCustomers()
		if err != nil {
			return nil, customerList{}, failure(err)
		}

		return textResult(jsontext.Indented(customers)), customerList{Customers: customers}, nil
	})
}
