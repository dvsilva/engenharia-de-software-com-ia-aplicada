package prompts

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/domain"
	"customers-mcp/internal/jsontext"
)

const instruction = "Please find the customer matching the following query using the get_customer or list_customers tool.\nQuery: "

func queryArguments() []*mcp.PromptArgument {
	properties := domain.CustomerQueryProperties()
	arguments := make([]*mcp.PromptArgument, 0, len(domain.CustomerQueryFields))

	for _, name := range domain.CustomerQueryFields {
		arguments = append(arguments, &mcp.PromptArgument{Name: name, Description: properties[name].Description})
	}

	return arguments
}

// A map marshals its keys sorted, which is also the schema's order: _id, name, phone.
func knownArguments(given map[string]string) map[string]string {
	known := map[string]string{}

	for _, name := range domain.CustomerQueryFields {
		if value, found := given[name]; found {
			known[name] = value
		}
	}

	return known
}

func RegisterFindCustomerPrompt(server *mcp.Server) {
	server.AddPrompt(&mcp.Prompt{
		Name:        "find_customer_prompt",
		Description: "Prompt to search a customer using any combination of _id, name or phone",
		Arguments:   queryArguments(),
	}, func(_ context.Context, request *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		query := jsontext.Compact(knownArguments(request.Params.Arguments))

		return &mcp.GetPromptResult{Messages: []*mcp.PromptMessage{{
			Role:    "user",
			Content: &mcp.TextContent{Text: instruction + query},
		}}}, nil
	})
}
