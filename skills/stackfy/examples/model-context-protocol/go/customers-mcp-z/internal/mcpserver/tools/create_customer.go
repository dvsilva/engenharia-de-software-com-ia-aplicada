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

func RegisterCreateCustomerTool(server *mcp.Server, service *application.CustomerService) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_customer",
		Description: "Create a customers",
		InputSchema: domain.Object(map[string]*jsonschema.Schema{
			"name":  domain.Text("Full name of the customer"),
			"phone": domain.Text("phone number of the customer"),
		}, "name", "phone"),
		OutputSchema: domain.Object(map[string]*jsonschema.Schema{
			"id":      domain.Text("MongoDB ObjectID of newerly created customer"),
			"message": domain.Text("Confirmation message"),
		}, "id", "message"),
	}, func(_ context.Context, _ *mcp.CallToolRequest, customer domain.NewCustomer) (*mcp.CallToolResult, json.RawMessage, error) {
		created, err := service.CreateCustomer(customer)
		if err != nil {
			return nil, nil, failure(err)
		}

		return textResult(jsontext.Compact(created)), created, nil
	})
}
