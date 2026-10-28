package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

type AgentTool struct {
	Name       string
	Definition openai.ChatCompletionToolUnionParam
	Invoke     func(ctx context.Context, arguments map[string]any) (string, error)
}

type MCPServer struct {
	Name    string
	Command string
	Args    []string
	Env     map[string]string
}

// The official TypeScript SDK hands a stdio server only these variables of its client.
var inheritedVariables = []string{"HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"}

func serverEnvironment(variables map[string]string) []string {
	environment := []string{}

	for _, name := range inheritedVariables {
		if value, found := os.LookupEnv(name); found {
			environment = append(environment, name+"="+value)
		}
	}
	for name, value := range variables {
		environment = append(environment, name+"="+value)
	}

	return environment
}

func resultText(result *mcp.CallToolResult) string {
	texts := make([]string, 0, len(result.Content))

	for _, content := range result.Content {
		if text, isText := content.(*mcp.TextContent); isText {
			texts = append(texts, text.Text)
			continue
		}

		encoded, _ := content.MarshalJSON()
		texts = append(texts, string(encoded))
	}

	return strings.Join(texts, "\n")
}

func toolParameters(schema any) shared.FunctionParameters {
	parameters := shared.FunctionParameters{}
	encoded, _ := json.Marshal(schema)
	_ = json.Unmarshal(encoded, &parameters)

	return parameters
}

func mcpTool(session *mcp.ClientSession, tool *mcp.Tool) AgentTool {
	return AgentTool{
		Name: tool.Name,
		Definition: openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
			Name:        tool.Name,
			Description: openai.String(tool.Description),
			Parameters:  toolParameters(tool.InputSchema),
		}),
		Invoke: func(ctx context.Context, arguments map[string]any) (string, error) {
			result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool.Name, Arguments: arguments})
			if err != nil {
				return "", err
			}
			if result.IsError {
				return "", errors.New(resultText(result))
			}

			return resultText(result), nil
		},
	}
}

func connectServer(ctx context.Context, server MCPServer) ([]AgentTool, error) {
	client := mcp.NewClient(&mcp.Implementation{Name: "multiple-mcp-tools", Version: "1.0.0"}, &mcp.ClientOptions{
		LoggingMessageHandler: func(_ context.Context, request *mcp.LoggingMessageRequest) {
			fmt.Printf("[%s] %v\n", server.Name, request.Params.Data)
		},
	})

	command := exec.Command(server.Command, server.Args...)
	command.Env = serverEnvironment(server.Env)
	command.Stderr = os.Stderr

	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: command}, nil)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", server.Name, err)
	}

	tools := []AgentTool{}
	for tool, err := range session.Tools(ctx, nil) {
		if err != nil {
			return nil, fmt.Errorf("%s: %w", server.Name, err)
		}
		tools = append(tools, mcpTool(session, tool))
	}

	return tools, nil
}

func getMCPTools(ctx context.Context) ([]AgentTool, error) {
	tools := []AgentTool{}

	for _, server := range []MCPServer{getMongoDBTool(), getFSTool()} {
		serverTools, err := connectServer(ctx, server)
		if err != nil {
			return nil, err
		}
		tools = append(tools, serverTools...)
	}

	return append(tools, getCSVToJSONTool()), nil
}
