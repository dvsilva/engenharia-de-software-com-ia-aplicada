package tools

import (
	"context"
	"encoding/json"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/application"
	"customers-mcp/internal/domain"
)

type customerDeletion struct {
	ID string `json:"_id"`
}

func RegisterDeleteCustomerTool(server *mcp.Server, service *application.CustomerService) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_customer",
		Description: "Delete a customer by their _id",
		InputSchema: domain.Object(map[string]*jsonschema.Schema{
			"_id": domain.Text("MongoDB ObjectID of the customer to delete"),
		}, "_id"),
		OutputSchema: domain.CustomerMutationSchema(),
	}, func(_ context.Context, _ *mcp.CallToolRequest, deletion customerDeletion) (*mcp.CallToolResult, json.RawMessage, error) {
		answer, err := service.DeleteCustomer(deletion.ID)
		if err != nil {
			return nil, nil, failure(err)
		}

		return textResult(messageOf(answer)), answer, nil
	})
}
