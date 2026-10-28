package src

import (
	"context"
	"fmt"
	"os"

	"rag-neo4j-students/src/prompts"
)

const noResultsMessage = "No data found matching your query."

func withAnswer(state GraphState, data prompts.AnalyticalResponseData) GraphState {
	state.Messages = append(state.Messages, Message{Role: "ai", Text: data.Answer})
	state.Answer = data.Answer
	state.FollowUpQuestions = data.FollowUpQuestions

	return state
}

func handleErrorResponse(ctx context.Context, state GraphState, llmClient *OpenRouterService) GraphState {
	var data prompts.AnalyticalResponseData
	err := llmClient.GenerateStructured(ctx, prompts.AnalyticalSystemPrompt(), prompts.ErrorResponsePrompt(state.Error, state.Question), prompts.AnalyticalResponseSchema, &data)
	if err != nil {
		answer := "An error ocurred: " + err.Error()
		state.Messages = append(state.Messages, Message{Role: "ai", Text: answer})
		state.Error = err.Error()
		state.Answer = answer
		state.FollowUpQuestions = []string{}
		return state
	}

	return withAnswer(state, data)
}

func successPrompt(state GraphState) string {
	if !state.IsMultiStep || len(state.SubResults) == 0 || len(state.SubQuestions) == 0 || len(state.SubQueries) == 0 {
		return prompts.AnalyticalUserPrompt(state.Question, state.Query, stringify(state.DBResults))
	}

	fmt.Printf("📊 Synthesizing %d step results...\n", len(state.SubResults))
	steps := make([]prompts.Step, len(state.SubResults))
	for index, row := range state.SubResults {
		steps[index] = prompts.Step{StepNumber: index + 1, Question: at(state.SubQuestions, index), Query: at(state.SubQueries, index), Results: encode(row)}
	}

	return prompts.MultiStepSynthesisPrompt(state.Question, steps)
}

func at(items []string, index int) string {
	if index < len(items) {
		return items[index]
	}

	return ""
}

func handleSuccessResponse(ctx context.Context, state GraphState, llmClient *OpenRouterService) GraphState {
	var data prompts.AnalyticalResponseData
	if err := llmClient.GenerateStructured(ctx, prompts.AnalyticalSystemPrompt(), successPrompt(state), prompts.AnalyticalResponseSchema, &data); err != nil {
		fmt.Fprintln(os.Stderr, "Failed to generate analytical response")
		state.Error = "Reponse generation faild: " + err.Error()
		return state
	}

	fmt.Println("✅ Generated analytical response")

	return withAnswer(state, data)
}

func handleNoResultsResponse(ctx context.Context, state GraphState, llmClient *OpenRouterService) GraphState {
	fmt.Println("💬 Generating no-results response...")

	question := state.Question
	if question == "" {
		question = "your query"
	}
	query := state.Query
	if query == "" {
		query = "N/A"
	}

	var data prompts.AnalyticalResponseData
	if err := llmClient.GenerateStructured(ctx, prompts.NoResultsPrompt(question, query), prompts.AnalyticalSystemPrompt(), prompts.AnalyticalResponseSchema, &data); err != nil {
		state.Messages = append(state.Messages, Message{Role: "ai", Text: noResultsMessage})
		state.Error = err.Error()
		state.Answer = noResultsMessage
		state.FollowUpQuestions = []string{}
		return state
	}

	return withAnswer(state, data)
}

func createAnalyticalResponseNode(llmClient *OpenRouterService) node {
	return func(ctx context.Context, state GraphState) GraphState {
		if state.Error != "" {
			return handleErrorResponse(ctx, state, llmClient)
		}
		if len(state.DBResults) == 0 {
			return handleNoResultsResponse(ctx, state, llmClient)
		}

		return handleSuccessResponse(ctx, state, llmClient)
	}
}
