package src

func createCypherCorrectionNode(neo4jService *Neo4jService) node {
	return func(state GraphState) GraphState {
		return state
	}
}
