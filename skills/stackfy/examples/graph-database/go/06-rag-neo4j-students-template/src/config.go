package src

type neo4jConfig struct {
	URI      string
	Username string
	Password string
}

type appConfig struct {
	Neo4j                 neo4jConfig
	MaxCorrectionAttempts int
	MaxSubQuestions       int
}

var Config = appConfig{
	Neo4j: neo4jConfig{
		URI:      "neo4j://localhost:7687",
		Username: "neo4j",
		Password: "password",
	},
	MaxCorrectionAttempts: 1,
	MaxSubQuestions:       3,
}
