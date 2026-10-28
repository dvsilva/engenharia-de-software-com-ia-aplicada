package src

import (
	"context"
	"fmt"
	"strings"

	"rag-neo4j-students/src/prompts"
)

func createQueryPlannerNode(llmClient *OpenRouterService) node {
	return func(ctx context.Context, state GraphState) GraphState {
		var data prompts.QueryAnalysisData
		err := llmClient.GenerateStructured(ctx, prompts.QueryAnalyzerSystemPrompt(), prompts.QueryAnalyzerUserPrompt(state.Question), prompts.QueryAnalysisSchema, &data)
		if err != nil {
			fmt.Println("⚠️  Failed to analyze query, assuming simple")
			state.Error = err.Error()
			state.IsMultiStep = false
			return state
		}

		if !data.RequiresDecomposition || len(data.SubQuestions) == 0 {
			return state
		}

		var formatted strings.Builder
		for index, question := range data.SubQuestions {
			fmt.Fprintf(&formatted, "\n   %d. %s", index+1, question)
		}
		fmt.Printf("📊 Complex query - %d steps:%s\n", len(data.SubQuestions), formatted.String())

		state.IsMultiStep = true
		state.SubQuestions = data.SubQuestions
		state.CurrentStep = 0
		state.SubQueries = []string{}
		state.SubResults = []Row{}

		return state
	}
}
