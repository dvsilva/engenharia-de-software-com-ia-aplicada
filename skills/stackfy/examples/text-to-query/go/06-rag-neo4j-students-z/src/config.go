package src

import "os"

type neo4jConfig struct {
	URI      string
	Username string
	Password string
}

type providerSort struct {
	By        string `json:"by"`
	Partition string `json:"partition"`
}

type providerConfig struct {
	Sort providerSort `json:"sort"`
}

type appConfig struct {
	APIKey                string
	HTTPReferer           string
	XTitle                string
	Models                []string
	Provider              providerConfig
	Temperature           float64
	Neo4j                 neo4jConfig
	MaxCorrectionAttempts int
	MaxSubQuestions       int
}

var Config = appConfig{
	APIKey:      os.Getenv("OPENROUTER_API_KEY"),
	HTTPReferer: "",
	XTitle:      "IA Devs - Sales Analytics Reporter",
	Models:      []string{"arcee-ai/trinity-large-preview:free"},
	Provider: providerConfig{
		Sort: providerSort{By: "throughput", Partition: "none"},
	},
	Temperature: 0.7,
	Neo4j: neo4jConfig{
		URI:      "neo4j://localhost:7687",
		Username: "neo4j",
		Password: "password",
	},
	MaxCorrectionAttempts: 1,
	MaxSubQuestions:       3,
}
