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

type foundCustomer struct {
	Customer json.RawMessage `json:"customer"`
}

func RegisterGetCustomerTool(server *mcp.Server, service *application.CustomerService) {
	nullableCustomer := &jsonschema.Schema{
		AnyOf:       []*jsonschema.Schema{domain.CustomerSchema(), {Type: "null"}},
		Description: "Customer details if found, otherwise null!",
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:         "get_customer",
		Description:  "Find a customer by _id, name, or phone number",
		InputSchema:  domain.CustomerQuerySchema(),
		OutputSchema: domain.Object(map[string]*jsonschema.Schema{"customer": nullableCustomer}, "customer"),
	}, func(_ context.Context, _ *mcp.CallToolRequest, query domain.CustomerQuery) (*mcp.CallToolResult, foundCustomer, error) {
		customer, err := service.FindCustomer(query)
		if err != nil {
			return nil, foundCustomer{}, failure(err)
		}

		return textResult(jsontext.Compact(customer)), foundCustomer{Customer: customer}, nil
	})
}
