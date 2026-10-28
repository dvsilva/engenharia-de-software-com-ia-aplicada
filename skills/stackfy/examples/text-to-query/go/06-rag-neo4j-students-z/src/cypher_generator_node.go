package src

import (
	"context"
	"fmt"

	"rag-neo4j-students/src/prompts"
)

func currentStepQuestion(state GraphState) (string, bool) {
	if !hasMoreSteps(state) {
		return "", false
	}

	return state.SubQuestions[state.CurrentStep], true
}

func createCypherGeneratorNode(llmClient *OpenRouterService, neo4jService *Neo4jService) node {
	return func(ctx context.Context, state GraphState) GraphState {
		targetQuestion := state.Question
		if stepQuestion, isStep := currentStepQuestion(state); isStep {
			targetQuestion = stepQuestion
			fmt.Printf("🤖 Generating Cypher query for step %d/%d: \"%s\"\n", state.CurrentStep+1, len(state.SubQuestions), targetQuestion)
		} else {
			fmt.Println("🤖 Generating Cypher query...")
		}

		schema := neo4jService.GetSchema(ctx)
		systemPrompt := prompts.CypherGeneratorSystemPrompt(schema, prompts.SalesContext)

		var data prompts.CypherQueryData
		if err := llmClient.GenerateStructured(ctx, systemPrompt, prompts.CypherGeneratorUserPrompt(targetQuestion), prompts.CypherQuerySchema, &data); err != nil {
			state.Error = "Failed to generate query: " + err.Error()
			return state
		}

		fmt.Println("✅ Generated Cypher query: " + data.Query)
		if state.IsMultiStep && len(state.SubQueries) > 0 {
			state.SubQueries = append(state.SubQueries, data.Query)
		}
		state.Query = data.Query

		return state
	}
}
