package main

import "context"

type Message struct {
	Role string
	Text string
}

type GraphState struct {
	Messages       []Message
	DocumentBase64 string
	Error          string
}

type StateUpdate struct {
	Messages []Message
}

type Node func(ctx context.Context, state GraphState) StateUpdate

type Graph func(ctx context.Context, input GraphState) GraphState

func (state GraphState) lastMessageText() string {
	if len(state.Messages) == 0 {
		return ""
	}

	return state.Messages[len(state.Messages)-1].Text
}

func (state GraphState) apply(update StateUpdate) GraphState {
	state.Messages = append(append([]Message{}, state.Messages...), update.Messages...)

	return state
}

func buildDocumentQAGraph(llmClient *OpenRouterService) Graph {
	answerGeneration := createAnswerGenerationNode(llmClient)

	return func(ctx context.Context, input GraphState) GraphState {
		return input.apply(answerGeneration(ctx, input))
	}
}
