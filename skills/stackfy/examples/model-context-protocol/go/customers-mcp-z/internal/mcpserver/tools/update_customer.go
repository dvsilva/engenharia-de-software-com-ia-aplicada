package tools

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/application"
	"customers-mcp/internal/domain"
)

func RegisterUpdateCustomerTool(server *mcp.Server, service *application.CustomerService) {
	mcp.AddTool(server, &mcp.Tool{
		Name:         "update_customer",
		Description:  "Update an existing customer's name and/or phone number by their _id",
		InputSchema:  domain.CustomerUpdateSchema(),
		OutputSchema: domain.CustomerMutationSchema(),
	}, func(_ context.Context, _ *mcp.CallToolRequest, customer domain.CustomerUpdate) (*mcp.CallToolResult, json.RawMessage, error) {
		answer, err := service.UpdateCustomer(customer)
		if err != nil {
			return nil, nil, failure(err)
		}

		return textResult(messageOf(answer)), answer, nil
	})
}
