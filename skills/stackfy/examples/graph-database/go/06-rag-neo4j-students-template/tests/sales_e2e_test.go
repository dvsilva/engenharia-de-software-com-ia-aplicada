package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"

	"rag-neo4j-students/data"
	"rag-neo4j-students/src"
)

type salesResponse struct {
	statusCode int
	body       map[string]any
}

var server *src.Server

var analyticalMetrics = regexp.MustCompile(`(?i)\d+%|\$\d+|revenue`)

func TestMain(m *testing.M) {
	ctx := context.Background()

	if err := data.SeedDatabase(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	server = src.CreateServer()
	code := m.Run()
	_ = server.Close(ctx)

	os.Exit(code)
}

func makeASalesRequest(t *testing.T, question string) salesResponse {
	payload, err := json.Marshal(map[string]string{"question": question})
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/sales", strings.NewReader(string(payload)))
	request.Header.Set("content-type", "application/json")
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}

	t.Logf("%s response: %s", question, recorder.Body.String())

	return salesResponse{statusCode: recorder.Code, body: body}
}

func text(body map[string]any, key string) string {
	value, _ := body[key].(string)

	return value
}

func followUpQuestions(body map[string]any) ([]any, bool) {
	questions, isList := body["followUpQuestions"].([]any)

	return questions, isList
}

func assertAnalyticalResponse(t *testing.T, response salesResponse) {
	t.Helper()

	_, hasFollowUps := followUpQuestions(response.body)

	if response.statusCode != http.StatusOK {
		t.Fatalf("status %d, expected 200", response.statusCode)
	}
	if text(response.body, "answer") == "" {
		t.Fatal("Answer should exist")
	}
	if !hasFollowUps {
		t.Fatal("Should have followUpQuestions array")
	}
}

func TestSalesAnalyticsReporter(t *testing.T) {
	t.Run("List all courses - Should return analytical response", func(t *testing.T) {
		response := makeASalesRequest(t, "List all available courses")
		answer := text(response.body, "answer")

		assertAnalyticalResponse(t, response)
		if !strings.Contains(answer, "JavaScript") && !strings.Contains(answer, "Node.js") {
			t.Fatal("Answer should contain course names")
		}
	})

	t.Run("Query students who bought specific course - Should provide details", func(t *testing.T) {
		assertAnalyticalResponse(t, makeASalesRequest(t, "Who bought Formação JavaScript Expert?"))
	})

	t.Run("Query total revenue from credit cards - Should include analytics", func(t *testing.T) {
		assertAnalyticalResponse(t, makeASalesRequest(t, "What is the total revenue from credit card payments?"))
	})

	t.Run("Revenue distribution analysis - Should show percentages and comparisons", func(t *testing.T) {
		response := makeASalesRequest(t, "Show me the revenue distribution across all courses")

		assertAnalyticalResponse(t, response)
		if !analyticalMetrics.MatchString(text(response.body, "answer")) {
			t.Fatal("Answer should contain analytical metrics")
		}
	})

	t.Run("Query students with 100% progress - Should provide insights", func(t *testing.T) {
		assertAnalyticalResponse(t, makeASalesRequest(t, "Which students have 100% progress in their courses?"))
	})

	t.Run("Payment method analysis - Should compare different methods", func(t *testing.T) {
		assertAnalyticalResponse(t, makeASalesRequest(t, "What are the most popular payment methods?"))
	})

	t.Run("Edge case: Students with progress but no purchase - Should handle gracefully", func(t *testing.T) {
		response := makeASalesRequest(t, "Are there students with progress in a course they never bought?")

		if response.statusCode != http.StatusOK {
			t.Fatalf("status %d, expected 200", response.statusCode)
		}
		if text(response.body, "answer") == "" {
			t.Fatal("Answer should exist")
		}
	})

	t.Run("Invalid/unclear question - Should handle gracefully with suggestions", func(t *testing.T) {
		response := makeASalesRequest(t, "What is the weather today?")

		if response.statusCode != http.StatusOK {
			t.Fatalf("status %d, expected 200", response.statusCode)
		}
		if text(response.body, "error") == "" && text(response.body, "answer") == "" {
			t.Fatal("Should have either error or answer")
		}
	})

	t.Run("Query students who never started a course - Should show engagement gaps", func(t *testing.T) {
		assertAnalyticalResponse(t, makeASalesRequest(t, "Which students bought a course but never started it?"))
	})

	t.Run("Follow-up questions - Should provide relevant suggestions", func(t *testing.T) {
		response := makeASalesRequest(t, "Show me the top performing courses")
		questions, _ := followUpQuestions(response.body)

		assertAnalyticalResponse(t, response)
		if len(questions) < 2 {
			t.Fatal("Should provide at least 2 follow-up questions")
		}
	})
}
