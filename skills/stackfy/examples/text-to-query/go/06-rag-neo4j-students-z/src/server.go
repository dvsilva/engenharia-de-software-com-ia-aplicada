package src

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"
)

const minimumQuestionLength = 3

const answerPreviewLength = 100

var rule = strings.Repeat("═", 60)

type SalesAnswer struct {
	Answer            string   `json:"answer"`
	FollowUpQuestions []string `json:"followUpQuestions"`
	Query             string   `json:"query,omitempty"`
	Error             string   `json:"error,omitempty"`
}

type errorBody struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code,omitempty"`
	Error      string `json:"error"`
	Message    string `json:"message"`
}

type Server struct {
	graph        Graph
	neo4jService *Neo4jService
}

func CreateServer() *Server {
	graph, neo4jService := buildSalesQAGraph()

	return &Server{graph: graph, neo4jService: neo4jService}
}

func (server *Server) Close(ctx context.Context) error {
	return server.neo4jService.Close(ctx)
}

func writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("content-type", "application/json; charset=utf-8")
	writer.WriteHeader(status)

	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(body)
}

func validationError(message string) *errorBody {
	return &errorBody{StatusCode: http.StatusBadRequest, Code: "FST_ERR_VALIDATION", Error: "Bad Request", Message: message}
}

func parseQuestion(body []byte) (string, *errorBody) {
	if len(body) == 0 {
		return "", &errorBody{StatusCode: http.StatusBadRequest, Code: "FST_ERR_CTP_EMPTY_JSON_BODY", Error: "Bad Request", Message: "Body cannot be empty when content-type is set to 'application/json'"}
	}

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", &errorBody{StatusCode: http.StatusBadRequest, Code: "FST_ERR_CTP_INVALID_JSON_BODY", Error: "Bad Request", Message: "Body is not valid JSON but content-type is set to 'application/json'"}
	}

	object, isObject := payload.(map[string]any)
	if !isObject {
		return "", validationError("body must be object")
	}

	value, present := object["question"]
	if !present {
		return "", validationError("body must have required property 'question'")
	}

	question, isString := value.(string)
	if !isString {
		return "", validationError("body/question must be string")
	}
	if utf8.RuneCountInString(question) < minimumQuestionLength {
		return "", validationError(fmt.Sprintf("body/question must NOT have fewer than %d characters", minimumQuestionLength))
	}

	return question, nil
}

func readQuestion(request *http.Request) (string, *errorBody) {
	body, err := io.ReadAll(request.Body)
	if err != nil {
		return "", &errorBody{StatusCode: http.StatusBadRequest, Error: "Bad Request", Message: err.Error()}
	}

	contentType := request.Header.Get("content-type")
	mediaType, _, _ := mime.ParseMediaType(contentType)

	if contentType == "" && len(bytes.TrimSpace(body)) == 0 {
		return "", validationError("body must be object")
	}
	if mediaType == "text/plain" {
		return "", validationError("body must be object")
	}
	if mediaType != "application/json" {
		return "", &errorBody{StatusCode: http.StatusUnsupportedMediaType, Code: "FST_ERR_CTP_INVALID_MEDIA_TYPE", Error: "Unsupported Media Type", Message: "Unsupported Media Type: " + contentType}
	}

	return parseQuestion(body)
}

func previewAnswer(answer string) string {
	if answer == "" {
		return "undefined"
	}

	units := utf16.Encode([]rune(answer))
	if len(units) <= answerPreviewLength {
		return answer
	}

	return string(utf16.Decode(units[:answerPreviewLength])) + "..."
}

func (server *Server) analyze(ctx context.Context, question string) (SalesAnswer, error) {
	fmt.Println("\n" + rule)
	fmt.Printf("📊 Sales Analytics: \"%s\"\n", question)
	fmt.Println(rule)

	startTime := time.Now()
	response, err := server.graph(ctx, GraphState{Messages: []Message{{Role: "human", Text: question}}})
	if err != nil {
		return SalesAnswer{}, err
	}
	processingTime := time.Since(startTime).Milliseconds()

	fmt.Println("\n" + rule)
	fmt.Printf("✅ Analysis completed in %dms\n", processingTime)
	fmt.Printf("💬 Answer: %s\n", previewAnswer(response.Answer))
	fmt.Printf("❓ Follow-ups: %d suggested\n", len(response.FollowUpQuestions))
	fmt.Println(rule + "\n")

	answer := SalesAnswer{
		Answer:            response.Answer,
		FollowUpQuestions: response.FollowUpQuestions,
		Query:             response.Query,
		Error:             response.Error,
	}
	if answer.Answer == "" {
		answer.Answer = "No answer generated"
	}
	if answer.FollowUpQuestions == nil {
		answer.FollowUpQuestions = []string{}
	}

	return answer, nil
}

func (server *Server) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost || request.URL.Path != "/sales" {
		writeJSON(writer, http.StatusNotFound, errorBody{
			StatusCode: http.StatusNotFound,
			Error:      "Not Found",
			Message:    fmt.Sprintf("Route %s:%s not found", request.Method, request.URL.RequestURI()),
		})
		return
	}

	question, failure := readQuestion(request)
	if failure != nil {
		writeJSON(writer, failure.StatusCode, failure)
		return
	}

	answer, err := server.analyze(request.Context(), question)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error processing sales query", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(writer, http.StatusOK, answer)
}
