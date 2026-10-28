package src

import (
	"context"
	"fmt"
)

const recursionLimit = 25

type Message struct {
	Role string
	Text string
}

type GraphState struct {
	Messages           []Message
	Question           string
	Query              string
	OriginalQuery      string
	DBResults          []Row
	CorrectionAttempts int
	ValidationError    string
	NeedsCorrection    bool
	IsMultiStep        bool
	SubQuestions       []string
	CurrentStep        int
	SubQueries         []string
	SubResults         []Row
	Answer             string
	FollowUpQuestions  []string
	Error              string
}

type node func(context.Context, GraphState) GraphState

type Graph func(context.Context, GraphState) (GraphState, error)

const (
	extractQuestion    = "extractQuestion"
	queryPlanner       = "queryPlanner"
	cypherGenerator    = "cypherGenerator"
	cypherExecutor     = "cypherExecutor"
	cypherCorrection   = "cypherCorrection"
	analyticalResponse = "analyticalResponse"
	end                = ""
)

func hasMoreSteps(state GraphState) bool {
	return state.IsMultiStep && len(state.SubQuestions) > 0 && state.CurrentStep < len(state.SubQuestions)
}

func afterExtraction(state GraphState) string {
	if state.Error != "" {
		return end
	}

	return queryPlanner
}

func afterExecution(state GraphState) string {
	if state.NeedsCorrection && state.CorrectionAttempts < 1 {
		return cypherCorrection
	}
	if hasMoreSteps(state) {
		return cypherGenerator
	}

	return analyticalResponse
}

func buildSalesGraph(llmClient *OpenRouterService, neo4jService *Neo4jService) Graph {
	nodes := map[string]node{
		extractQuestion:    createExtractQuestionNode(),
		queryPlanner:       createQueryPlannerNode(llmClient),
		cypherGenerator:    createCypherGeneratorNode(llmClient, neo4jService),
		cypherExecutor:     createCypherExecutorNode(neo4jService),
		cypherCorrection:   createCypherCorrectionNode(llmClient, neo4jService),
		analyticalResponse: createAnalyticalResponseNode(llmClient),
	}
	edges := map[string]func(GraphState) string{
		extractQuestion:    afterExtraction,
		queryPlanner:       func(GraphState) string { return cypherGenerator },
		cypherGenerator:    func(GraphState) string { return cypherExecutor },
		cypherExecutor:     afterExecution,
		cypherCorrection:   func(GraphState) string { return cypherExecutor },
		analyticalResponse: func(GraphState) string { return end },
	}

	return func(ctx context.Context, state GraphState) (GraphState, error) {
		for step, current := 1, extractQuestion; current != end; step++ {
			if step > recursionLimit {
				return state, fmt.Errorf("Recursion limit of %d reached without hitting a stop condition. You can increase the limit by setting the \"recursionLimit\" config key.", recursionLimit)
			}

			state = nodes[current](ctx, state)
			current = edges[current](state)
		}

		return state, nil
	}
}
