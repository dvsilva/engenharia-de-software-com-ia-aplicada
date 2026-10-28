package src

func buildSalesQAGraph() (Graph, *Neo4jService) {
	neo4jService := NewNeo4jService()

	return buildSalesGraph(neo4jService), neo4jService
}
