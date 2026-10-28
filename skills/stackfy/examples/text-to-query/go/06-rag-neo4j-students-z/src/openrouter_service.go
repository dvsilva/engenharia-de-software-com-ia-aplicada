package src

import (
	"context"
	"encoding/json"
	"errors"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const openRouterBaseURL = "https://openrouter.ai/api/v1"

type OpenRouterService struct {
	client openai.Client
}

func baseURL() string {
	if url := os.Getenv("OPENAI_BASE_URL"); url != "" {
		return url
	}

	return openRouterBaseURL
}

func NewOpenRouterService() *OpenRouterService {
	client := openai.NewClient(
		option.WithAPIKey(Config.APIKey),
		option.WithBaseURL(baseURL()),
		option.WithHeader("HTTP-Referer", Config.HTTPReferer),
		option.WithHeader("X-Title", Config.XTitle),
		option.WithJSONSet("models", Config.Models),
		option.WithJSONSet("provider", Config.Provider),
	)

	return &OpenRouterService{client: client}
}

func (service *OpenRouterService) GenerateStructured(ctx context.Context, systemPrompt, userPrompt string, schema json.RawMessage, target any) error {
	completion, err := service.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:       shared.ChatModel(Config.Models[0]),
		Temperature: openai.Float(Config.Temperature),
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(systemPrompt),
			openai.UserMessage(userPrompt),
		},
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
			OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
				JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
					Name:   "extract",
					Strict: openai.Bool(true),
					Schema: schema,
				},
			},
		},
	})
	if err != nil {
		return err
	}
	if len(completion.Choices) == 0 {
		return errors.New("the model answered no choice")
	}

	return json.Unmarshal([]byte(completion.Choices[0].Message.Content), target)
}
