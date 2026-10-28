package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const openRouterBaseURL = "https://openrouter.ai/api/v1"

var errMissingCredentials = errors.New("Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.")

type LLMResponse struct {
	Model   string
	Content string
}

type OpenRouterService struct {
	config ModelConfig
	client openai.Client
}

func baseURL() string {
	if url := os.Getenv("OPENAI_BASE_URL"); url != "" {
		return url
	}

	return openRouterBaseURL
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

func (service *OpenRouterService) complete(ctx context.Context, systemPrompt, userPrompt, documentBase64 string) (LLMResponse, error) {
	if !service.config.HasAPIKey {
		return LLMResponse{}, errMissingCredentials
	}

	completion, err := service.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:       shared.ChatModel(service.config.Models[0]),
		Temperature: openai.Float(service.config.Temperature),
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(systemPrompt),
			openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
				openai.TextContentPart(userPrompt),
				openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
					URL: "data:application/pdf;base64," + documentBase64,
				}),
			}),
		},
	})
	if err != nil {
		return LLMResponse{}, err
	}

	content := ""
	if len(completion.Choices) > 0 {
		content = completion.Choices[0].Message.Content
	}

	model := completion.Model
	if model == "" {
		model = service.config.Models[0]
	}

	return LLMResponse{Model: model, Content: content}, nil
}

func (service *OpenRouterService) GenerateWithDocument(ctx context.Context, systemPrompt, userPrompt, documentBase64 string) (LLMResponse, error) {
	response, err := service.complete(ctx, systemPrompt, userPrompt, documentBase64)
	if err != nil {
		return LLMResponse{}, fmt.Errorf("Multimodal generation failed: %w", err)
	}

	return response, nil
}
