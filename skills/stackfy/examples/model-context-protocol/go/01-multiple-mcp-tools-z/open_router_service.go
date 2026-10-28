package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const openRouterBaseURL = "https://openrouter.ai/api/v1"

const recursionLimit = 25

type OpenRouterService struct {
	config ModelConfig
	client openai.Client
	tools  []AgentTool
}

type conversation struct {
	messages    []openai.ChatCompletionMessageParamUnion
	lastMessage string
}

func (dialog *conversation) add(message openai.ChatCompletionMessageParamUnion, text string) {
	dialog.messages = append(dialog.messages, message)
	dialog.lastMessage = text
}

func baseURL() string {
	if url := os.Getenv("OPENAI_BASE_URL"); url != "" {
		return url
	}

	return openRouterBaseURL
}

func printJSON(label string, value any) {
	encoded, _ := json.MarshalIndent(value, "", "  ")
	fmt.Println(label, string(encoded))
}

func NewOpenRouterService(config ModelConfig) *OpenRouterService {
	client := openai.NewClient(
		option.WithAPIKey(config.APIKey),
		option.WithBaseURL(baseURL()),
		option.WithHeader("HTTP-Referer", config.HTTPReferer),
		option.WithHeader("X-Title", config.XTitle),
		option.WithJSONSet("models", config.Models),
		option.WithJSONSet("provider", config.Provider),
	)

	return &OpenRouterService{config: config, client: client}
}

func (service *OpenRouterService) getTools() ([]AgentTool, error) {
	if len(service.tools) > 0 {
		return service.tools, nil
	}

	tools, err := getMCPTools(context.Background())
	if err != nil {
		return nil, err
	}
	service.tools = tools

	return tools, nil
}

func (service *OpenRouterService) newDialog(systemPrompt, userPrompt string) *conversation {
	dialog := &conversation{}
	dialog.add(openai.SystemMessage(systemPrompt), systemPrompt)
	dialog.add(openai.UserMessage(userPrompt), userPrompt)

	return dialog
}

func (service *OpenRouterService) complete(ctx context.Context, dialog *conversation, configure func(*openai.ChatCompletionNewParams)) (openai.ChatCompletionMessage, error) {
	params := openai.ChatCompletionNewParams{
		Model:       shared.ChatModel(service.config.Models[0]),
		Temperature: openai.Float(service.config.Temperature),
		MaxTokens:   openai.Int(service.config.MaxTokens),
		Messages:    dialog.messages,
	}
	configure(&params)

	fmt.Println("\n🧠 LLM thinking...")
	fmt.Printf(" (last message: \"%s\")\n", dialog.lastMessage)

	completion, err := service.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return openai.ChatCompletionMessage{}, err
	}
	if len(completion.Choices) == 0 {
		return openai.ChatCompletionMessage{}, errors.New("the model answered no choice")
	}

	choice := completion.Choices[0]
	if len(choice.Message.ToolCalls) > 0 {
		names := make([]string, 0, len(choice.Message.ToolCalls))
		for _, call := range choice.Message.ToolCalls {
			names = append(names, call.Function.Name)
		}
		fmt.Printf("🎯 Decided to call: %s\n", strings.Join(names, ", "))
	}
	if choice.FinishReason == "length" {
		return openai.ChatCompletionMessage{}, errors.New("could not parse response content as the length limit was reached")
	}

	return choice.Message, nil
}

func (service *OpenRouterService) GenerateStructured(ctx context.Context, systemPrompt, userPrompt string, schema json.RawMessage, target any) error {
	dialog := service.newDialog(systemPrompt, userPrompt)

	message, err := service.complete(ctx, dialog, func(params *openai.ChatCompletionNewParams) {
		params.ResponseFormat = openai.ChatCompletionNewParamsResponseFormatUnion{
			OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
				JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
					Name:   "extract",
					Strict: openai.Bool(true),
					Schema: schema,
				},
			},
		}
	})
	if err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(message.Content), target); err != nil {
		return err
	}

	dialog.add(message.ToParam(), message.Content)
	printJSON("✅ LLM Response:", map[string]any{"messages": dialog.messages, "structuredResponse": target})

	return nil
}

func runTool(ctx context.Context, tools map[string]AgentTool, call openai.ChatCompletionMessageToolCallUnion) string {
	name := call.Function.Name
	fmt.Printf("🔧 Tool called: %s → %s\n", name, call.Function.Arguments)

	output, err := invokeTool(ctx, tools, name, call.Function.Arguments)
	if err != nil {
		output = fmt.Sprintf("Error invoking tool '%s' with kwargs %s with error: %s\n Please fix the error and try again.", name, call.Function.Arguments, err)
	}

	fmt.Printf("✅ Tool done:   %s → %s\n", name, output)

	return output
}

func invokeTool(ctx context.Context, tools map[string]AgentTool, name, rawArguments string) (string, error) {
	tool, found := tools[name]
	if !found {
		return "", fmt.Errorf("tool %q not found", name)
	}

	arguments := map[string]any{}
	if strings.TrimSpace(rawArguments) != "" {
		if err := json.Unmarshal([]byte(rawArguments), &arguments); err != nil {
			return "", err
		}
	}

	return tool.Invoke(ctx, arguments)
}

func (service *OpenRouterService) GenerateWithTools(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	tools, err := service.getTools()
	if err != nil {
		return "", err
	}

	definitions := make([]openai.ChatCompletionToolUnionParam, 0, len(tools))
	byName := map[string]AgentTool{}
	for _, tool := range tools {
		definitions = append(definitions, tool.Definition)
		byName[tool.Name] = tool
	}

	dialog := service.newDialog(systemPrompt, userPrompt)

	for steps := 1; steps <= recursionLimit; steps += 2 {
		message, err := service.complete(ctx, dialog, func(params *openai.ChatCompletionNewParams) {
			params.Tools = definitions
		})
		if err != nil {
			return "", err
		}

		dialog.add(message.ToParam(), message.Content)

		if len(message.ToolCalls) == 0 {
			printJSON("✅ LLM Response:", map[string]any{"messages": dialog.messages})
			return message.Content, nil
		}

		for _, call := range message.ToolCalls {
			output := runTool(ctx, byName, call)
			dialog.add(openai.ToolMessage(output, call.ID), output)
		}
	}

	return "", fmt.Errorf("recursion limit of %d reached without hitting a stop condition", recursionLimit)
}
