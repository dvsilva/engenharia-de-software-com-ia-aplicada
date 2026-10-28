package main

import (
	"context"
	"fmt"
	"os"
)

const agentApology = "Sorry, I had trouble processing the request."

func agentNode(service *OpenRouterService) Node {
	return func(ctx context.Context, state GraphState) GraphState {
		fmt.Println("🤖 Agent node processing...")

		userMessage := agentUserPrompt(state.Intent, state.FileName, state.FileContent)

		answer, err := service.GenerateWithTools(ctx, agentSystemPrompt, userMessage)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Agent error:", err)
			state = state.withMessage("assistant", agentApology)
			state.Error = err.Error()
			return state
		}

		state = state.withMessage("assistant", answer)
		state.Error = ""

		return state
	}
}
