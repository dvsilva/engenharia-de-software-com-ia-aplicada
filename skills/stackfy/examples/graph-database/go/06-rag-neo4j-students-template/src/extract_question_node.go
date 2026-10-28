package src

import (
	"fmt"
	"os"
	"strings"
)

func createExtractQuestionNode() node {
	return func(state GraphState) GraphState {
		if len(state.Messages) == 0 {
			fmt.Fprintln(os.Stderr, "No messages in state")
			state.Error = "No messages provided"
			return state
		}

		question := state.Messages[len(state.Messages)-1].Text

		if strings.TrimSpace(question) == "" {
			fmt.Fprintln(os.Stderr, "Extracted question is empty")
			state.Error = "No valid question found in messages"
			return state
		}

		fmt.Printf("📝 Extracted question: \"%s\"\n", question)
		state.Question = question

		return state
	}
}
