package resources

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const apiInfoURI = "customers://api-info"

const apiInfo = `
Customers API

  Base URL : %s
  Endpoints:
    GET    /customers          — list all customers
    GET    /customers/:id      — get customer by id
    POST   /customers          — create customer  { name, phone }
    PUT    /customers/:id      — update customer  { name, phone }
    DELETE /customers/:id      — delete customer

  Customer shape: { _id: string, name: string, phone: string }
`

func RegisterAPIInfoResource(server *mcp.Server, baseURL string) {
	server.AddResource(&mcp.Resource{
		URI:         apiInfoURI,
		Name:        apiInfoURI,
		Description: "describes the customers rest API that this MCP server wraps",
	}, func(_ context.Context, _ *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{
			URI:      apiInfoURI,
			MIMEType: "text/plain",
			Text:     fmt.Sprintf(apiInfo, baseURL),
		}}}, nil
	})
}
