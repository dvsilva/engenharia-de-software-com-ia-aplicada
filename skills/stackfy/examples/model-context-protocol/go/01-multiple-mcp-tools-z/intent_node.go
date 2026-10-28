package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

const intentApology = "Sorry, I had trouble understanding the intent. Please rephrase your question or provide more details."

func parseIntent(ctx context.Context, service *OpenRouterService, question string) (IntentData, error) {
	var parsed IntentData

	if err := service.GenerateStructured(ctx, identifyIntentSystemPrompt, question, intentSchema, &parsed); err != nil {
		return parsed, err
	}
	if parsed.Intent == "" || parsed.FileType == "" {
		encoded, _ := json.Marshal(parsed)
		fmt.Println("⚠️ Missing intent or fileType in parsed data:", string(encoded))
		return parsed, errors.New("Invalid intent data")
	}

	return parsed, nil
}

func intentNode(service *OpenRouterService) Node {
	return func(ctx context.Context, state GraphState) GraphState {
		fmt.Println("🧠 Intent node processing...")

		parsed, err := parseIntent(ctx, service, state.lastMessageText())
		if err != nil {
			fmt.Fprintln(os.Stderr, "Intent node error:", err)
			state = state.withMessage("assistant", intentApology)
			state.Error = err.Error()
			return state
		}

		fileName := "data." + parsed.FileType
		if parsed.FileName != nil {
			fileName = *parsed.FileName
		}

		fmt.Println("📋 Extracted intent:", parsed.Intent)
		fmt.Println("📄 File Type:", parsed.FileType)
		fmt.Println("📄 File name:", fileName)

		state.Intent = parsed.Intent
		state.FileName = fileName
		state.FileContent = ""
		if parsed.FileContent != nil {
			state.FileContent = *parsed.FileContent
		}

		return state
	}
}
