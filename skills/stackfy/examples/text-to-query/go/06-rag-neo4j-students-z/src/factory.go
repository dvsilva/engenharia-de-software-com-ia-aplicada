package src

func buildSalesQAGraph() (Graph, *Neo4jService) {
	llmClient := NewOpenRouterService()
	neo4jService := NewNeo4jService()

	return buildSalesGraph(llmClient, neo4jService), neo4jService
}
