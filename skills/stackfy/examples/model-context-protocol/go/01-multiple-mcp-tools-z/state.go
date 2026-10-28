package main

type Message struct {
	Role string
	Text string
}

type GraphState struct {
	Messages    []Message
	Answer      string
	Intent      string
	FileContent string
	FileName    string
	Error       string
}

func (state GraphState) withMessage(role, text string) GraphState {
	state.Messages = append(append([]Message{}, state.Messages...), Message{Role: role, Text: text})

	return state
}

func (state GraphState) lastMessageText() string {
	if len(state.Messages) == 0 {
		return ""
	}

	return state.Messages[len(state.Messages)-1].Text
}
