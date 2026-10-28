package src

func createAnalyticalResponseNode() node {
	return func(state GraphState) GraphState {
		state.Messages = append(state.Messages, Message{Role: "ai", Text: "hello world"})

		return state
	}
}
