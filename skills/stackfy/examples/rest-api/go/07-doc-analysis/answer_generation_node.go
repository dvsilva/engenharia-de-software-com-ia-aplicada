package main

import (
	"context"
	"fmt"
	"os"
)

const systemPrompt = "You are a helpful AI assistant that can analyze documents and answer questions about them."

func aiMessage(text string) StateUpdate {
	return StateUpdate{Messages: []Message{{Role: "ai", Text: text}}}
}

func createAnswerGenerationNode(llmClient *OpenRouterService) Node {
	return func(ctx context.Context, state GraphState) StateUpdate {
		if state.DocumentBase64 == "" {
			return aiMessage("No document found in state")
		}

		fmt.Println("🤖 Sending document to multimodal model for analysis...")

		response, err := llmClient.GenerateWithDocument(ctx, systemPrompt, state.lastMessageText(), state.DocumentBase64)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Error in answerGenerationNode:", err)
			return aiMessage("Failed to generate answer: " + err.Error())
		}

		fmt.Printf("✅ Model: %s\n", response.Model)

		return aiMessage(response.Content)
	}
}
