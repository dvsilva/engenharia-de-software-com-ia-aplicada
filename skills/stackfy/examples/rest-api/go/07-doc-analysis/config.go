package main

import "os"

type ProviderSort struct {
	By        string `json:"by"`
	Partition string `json:"partition"`
}

type Provider struct {
	Sort ProviderSort `json:"sort"`
}

type ModelConfig struct {
	APIKey      string
	HasAPIKey   bool
	HTTPReferer string
	XTitle      string
	Models      []string
	Provider    Provider
	Temperature float64
}

func lookupAPIKey() (string, bool) {
	if key, found := os.LookupEnv("OPENROUTER_API_KEY"); found {
		return key, true
	}

	return os.LookupEnv("OPENAI_API_KEY")
}

func loadConfig() ModelConfig {
	apiKey, hasAPIKey := lookupAPIKey()

	return ModelConfig{
		APIKey:      apiKey,
		HasAPIKey:   hasAPIKey,
		HTTPReferer: "",
		XTitle:      "IA Devs - Document Q&A",
		Models:      []string{"google/gemini-2.5-flash-lite-preview-09-2025"},
		Provider:    Provider{Sort: ProviderSort{By: "throughput", Partition: "none"}},
		Temperature: 0.7,
	}
}
