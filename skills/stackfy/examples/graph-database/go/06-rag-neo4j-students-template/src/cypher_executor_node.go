package src

func createCypherExecutorNode(neo4jService *Neo4jService) node {
	return func(state GraphState) GraphState {
		return state
	}
}
