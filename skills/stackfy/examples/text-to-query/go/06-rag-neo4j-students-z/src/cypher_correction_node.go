package src

import (
	"context"
	"fmt"

	"rag-neo4j-students/src/prompts"
)

func createCypherCorrectionNode(llmClient *OpenRouterService, neo4jService *Neo4jService) node {
	return func(ctx context.Context, state GraphState) GraphState {
		fmt.Println("🔧 Auto-correcting Cypher query...")
		schema := neo4jService.GetSchema(ctx)
		systemPrompt := prompts.CypherCorrectionSystemPrompt(schema)
		userPrompt := prompts.CypherCorrectionUserPrompt(state.Query, state.ValidationError, state.Question)

		var data prompts.CypherCorrectionData
		if err := llmClient.GenerateStructured(ctx, systemPrompt, userPrompt, prompts.CypherCorrectionSchema, &data); err != nil {
			state.Error = "Query correction failed: " + err.Error()
			return state
		}

		fmt.Println("✅ Query corrected: " + data.Explanation)

		if state.OriginalQuery == "" {
			state.OriginalQuery = state.Query
		}
		state.Query = data.CorrectedQuery
		state.CorrectionAttempts++
		state.ValidationError = ""
		state.NeedsCorrection = false

		return state
	}
}
