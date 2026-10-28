package main

import (
	"encoding/json"
	"net/http"
	"unicode/utf8"
)

type fastifyError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Error      string `json:"error"`
	Message    string `json:"message"`
}

func writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("content-type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(body)
}

func badRequest(writer http.ResponseWriter, code, message string) {
	writeJSON(writer, http.StatusBadRequest, fastifyError{StatusCode: http.StatusBadRequest, Code: code, Error: "Bad Request", Message: message})
}

func questionProblem(body map[string]any) string {
	value, present := body["question"]
	if !present {
		return "body must have required property 'question'"
	}

	question, isText := value.(string)
	if !isText {
		return "body/question must be string"
	}
	if utf8.RuneCountInString(question) < 10 {
		return "body/question must NOT have fewer than 10 characters"
	}

	return ""
}

func createServer(graph Graph) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /chat", func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			badRequest(writer, "FST_ERR_CTP_INVALID_JSON_BODY", "Body is not valid JSON but content-type is set to 'application/json'")
			return
		}
		if problem := questionProblem(body); problem != "" {
			badRequest(writer, "FST_ERR_VALIDATION", problem)
			return
		}

		question := body["question"].(string)
		response := graph(request.Context(), GraphState{}.withMessage("user", question))

		answer := response.Answer
		if answer == "" {
			answer = response.lastMessageText()
		}
		if answer == "" {
			answer = "No response generated."
		}

		writer.Header().Set("content-type", "text/plain; charset=utf-8")
		_, _ = writer.Write([]byte(answer))
	})

	return mux
}
