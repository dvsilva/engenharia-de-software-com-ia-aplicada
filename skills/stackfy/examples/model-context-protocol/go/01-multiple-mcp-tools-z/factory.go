package main

func buildGraph(config ModelConfig) Graph {
	return buildGraphPipeline(NewOpenRouterService(config))
}
