package main

import (
	"fmt"
	"os"
)

type ProviderSort struct {
	By        string `json:"by"`
	Partition string `json:"partition"`
}

type Provider struct {
	Sort ProviderSort `json:"sort"`
}

type ModelConfig struct {
	APIKey      string
	HTTPReferer string
	XTitle      string
	Provider    Provider
	Models      []string
	Temperature float64
	MaxTokens   int64
}

func loadConfig() ModelConfig {
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "Assertion failed: OPENROUTER_API_KEY is not set in environment variables")
	}

	return ModelConfig{
		APIKey:      apiKey,
		HTTPReferer: "",
		XTitle:      "IA Devs - Transforming Services into Tools",
		Models:      []string{"arcee-ai/trinity-large-preview:free"},
		Provider:    Provider{Sort: ProviderSort{By: "throughput", Partition: "none"}},
		Temperature: 0.7,
		MaxTokens:   2048,
	}
}
