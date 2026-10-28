package src

type Message struct {
	Role string
	Text string
}

type GraphState struct {
	Messages           []Message
	Question           string
	Query              string
	OriginalQuery      string
	DBResults          []map[string]any
	CorrectionAttempts int
	ValidationError    string
	NeedsCorrection    bool
	IsMultiStep        bool
	SubQuestions       []string
	CurrentStep        int
	SubQueries         []string
	SubResults         [][]map[string]any
	Answer             string
	FollowUpQuestions  []string
	Error              string
}

type node func(GraphState) GraphState

type Graph func(GraphState) GraphState

func hasMoreSteps(state GraphState) bool {
	return state.IsMultiStep && state.CurrentStep < len(state.SubQuestions)
}

func buildSalesGraph(neo4jService *Neo4jService) Graph {
	extractQuestion := createExtractQuestionNode()
	queryPlanner := createQueryPlannerNode()
	cypherGenerator := createCypherGeneratorNode(neo4jService)
	cypherExecutor := createCypherExecutorNode(neo4jService)
	cypherCorrection := createCypherCorrectionNode(neo4jService)
	analyticalResponse := createAnalyticalResponseNode()

	return func(state GraphState) GraphState {
		state = extractQuestion(state)
		if state.Error != "" {
			return state
		}

		state = cypherGenerator(queryPlanner(state))

		for {
			state = cypherExecutor(state)

			if state.NeedsCorrection && state.CorrectionAttempts < 1 {
				state = cypherCorrection(state)
				continue
			}
			if hasMoreSteps(state) {
				state = cypherGenerator(state)
				continue
			}

			return analyticalResponse(state)
		}
	}
}
