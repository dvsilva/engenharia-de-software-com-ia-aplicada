package mcpserver

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/application"
	"customers-mcp/internal/mcpserver/prompts"
	"customers-mcp/internal/mcpserver/resources"
	"customers-mcp/internal/mcpserver/tools"
)

const baseURL = "http://localhost:9999/v1"

func NewServer() *mcp.Server {
	service := application.NewCustomerService(baseURL)
	server := mcp.NewServer(&mcp.Implementation{Name: "@erickwendel/ew-customers-mcp", Version: "0.0.1"}, nil)

	tools.RegisterListCustomersTool(server, service)
	tools.RegisterGetCustomerTool(server, service)
	tools.RegisterCreateCustomerTool(server, service)
	prompts.RegisterFindCustomerPrompt(server)
	resources.RegisterAPIInfoResource(server, baseURL)
	tools.RegisterUpdateCustomerTool(server, service)
	tools.RegisterDeleteCustomerTool(server, service)

	return server
}
