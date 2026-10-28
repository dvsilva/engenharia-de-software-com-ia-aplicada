package src

import (
	"context"
	"fmt"
)

const validationFailed = "Query validation failed - syntax or structure error"

type execution struct {
	rows    []Row
	failure string
	failed  bool
}

func executeQuery(ctx context.Context, query string, neo4jService *Neo4jService) execution {
	if !neo4jService.ValidateQuery(ctx, query) {
		return execution{failure: validationFailed, failed: true}
	}

	rows, err := neo4jService.Query(ctx, query, nil)
	if err != nil {
		return execution{failure: err.Error(), failed: true}
	}
	if len(rows) == 0 {
		return execution{rows: []Row{}}
	}

	fmt.Printf("✅ Retrieved %d result(s)\n", len(rows))

	return execution{rows: rows}
}

func progressSteps(state GraphState, rows []Row) GraphState {
	state.SubResults = append(state.SubResults, rows...)
	state.DBResults = rows
	state.CurrentStep++
	state.NeedsCorrection = false

	totalSteps := len(state.SubQuestions)
	fmt.Printf("✅ Step %d/%d completed\n", state.CurrentStep, totalSteps)
	if hasMoreSteps(state) {
		fmt.Printf("➡️  Moving to step %d...\n", state.CurrentStep)
		return state
	}

	fmt.Printf("✅ All %d steps completed - synthesizing results\n", totalSteps)

	return state
}

func createCypherExecutorNode(neo4jService *Neo4jService) node {
	return func(ctx context.Context, state GraphState) GraphState {
		result := executeQuery(ctx, state.Query, neo4jService)

		if result.failed {
			if state.CorrectionAttempts < Config.MaxCorrectionAttempts {
				fmt.Println("🔍 Will attempt to auto-correct query...")
				state.ValidationError = result.failure
				if state.OriginalQuery == "" {
					state.OriginalQuery = state.Query
				}
				state.NeedsCorrection = true
				return state
			}

			state.Error = "Invalid Cypher query - correction failed"
			return state
		}

		if state.IsMultiStep && len(state.SubQuestions) > 0 {
			return progressSteps(state, result.rows)
		}

		state.DBResults = result.rows
		if len(result.rows) == 0 {
			state.Error = "No results found"
			return state
		}
		state.NeedsCorrection = false

		return state
	}
}
