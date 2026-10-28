package main

import "context"

type Node func(ctx context.Context, state GraphState) GraphState

type Graph func(ctx context.Context, state GraphState) GraphState

func buildGraphPipeline(service *OpenRouterService) Graph {
	intentParser := intentNode(service)
	agent := agentNode(service)

	return func(ctx context.Context, state GraphState) GraphState {
		state = intentParser(ctx, state)
		if state.Error != "" {
			return state
		}

		return agent(ctx, state)
	}
}
