package httpapi_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"notas-api/internal/factories"
	"notas-api/internal/store"
)

type exchange struct {
	status int
	body   string
}

func startServer(t *testing.T) *httptest.Server {
	t.Helper()

	nextID := 0
	app := factories.NewTaskApp(store.NewInMemoryTaskStore(func() string {
		nextID++
		return fmt.Sprintf("%d", nextID)
	}))
	server := httptest.NewServer(app.HTTPHandler)

	t.Cleanup(server.Close)

	return server
}

func send(t *testing.T, server *httptest.Server, method string, path string, body string) exchange {
	t.Helper()

	request, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}

	request.Header.Set("content-type", "application/json")

	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	defer response.Body.Close()

	rawBody, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}

	return exchange{status: response.StatusCode, body: string(rawBody)}
}

func assertExchange(t *testing.T, actual exchange, status int, expectedBody string) {
	t.Helper()

	var actualValue, expectedValue any

	if actual.status != status {
		t.Errorf("status: got %d, want %d", actual.status, status)
	}
	if json.Unmarshal([]byte(actual.body), &actualValue) != nil {
		t.Fatalf("body is not JSON: %q", actual.body)
	}
	if json.Unmarshal([]byte(expectedBody), &expectedValue) != nil {
		t.Fatalf("expected body is not JSON: %q", expectedBody)
	}
	if !reflect.DeepEqual(actualValue, expectedValue) {
		t.Errorf("body: got %s, want %s", actual.body, expectedBody)
	}
}

func TestTaskRoutes(t *testing.T) {
	t.Run("POST /tasks returns 201 with the created task", func(t *testing.T) {
		server := startServer(t)

		response := send(t, server, "POST", "/tasks", `{"title":"Buy milk"}`)

		assertExchange(t, response, 201, `{"id":"1","title":"Buy milk","status":"open"}`)
	})

	t.Run("POST /tasks returns 400 for invalid title", func(t *testing.T) {
		server := startServer(t)

		response := send(t, server, "POST", "/tasks", `{"title":"   "}`)

		assertExchange(t, response, 400, `{"error":"Validation failed","issues":["Task title is required"]}`)
	})

	t.Run("GET /tasks returns all tasks", func(t *testing.T) {
		server := startServer(t)

		send(t, server, "POST", "/tasks", `{"title":"Buy milk"}`)
		send(t, server, "POST", "/tasks", `{"title":"Walk dog"}`)

		response := send(t, server, "GET", "/tasks", "")

		assertExchange(t, response, 200, `[
			{"id":"1","title":"Buy milk","status":"open"},
			{"id":"2","title":"Walk dog","status":"open"}
		]`)
	})

	t.Run("GET /tasks filters by open and done status", func(t *testing.T) {
		server := startServer(t)

		send(t, server, "POST", "/tasks", `{"title":"Buy milk"}`)
		send(t, server, "POST", "/tasks", `{"title":"Walk dog"}`)
		send(t, server, "PATCH", "/tasks/2/complete", "")

		openResponse := send(t, server, "GET", "/tasks?status=open", "")
		doneResponse := send(t, server, "GET", "/tasks?status=done", "")

		assertExchange(t, openResponse, 200, `[{"id":"1","title":"Buy milk","status":"open"}]`)
		assertExchange(t, doneResponse, 200, `[{"id":"2","title":"Walk dog","status":"done"}]`)
	})

	t.Run("GET /tasks returns 400 for an invalid status filter", func(t *testing.T) {
		server := startServer(t)

		response := send(t, server, "GET", "/tasks?status=invalid", "")

		if response.status != 400 || !strings.Contains(response.body, `"error":"Validation failed"`) {
			t.Fatalf("got %+v", response)
		}
	})

	t.Run("PATCH /tasks/:id/complete returns 200 with the completed task", func(t *testing.T) {
		server := startServer(t)

		send(t, server, "POST", "/tasks", `{"title":"Buy milk"}`)

		response := send(t, server, "PATCH", "/tasks/1/complete", "")

		assertExchange(t, response, 200, `{"id":"1","title":"Buy milk","status":"done"}`)
	})

	t.Run("PATCH /tasks/:id/complete returns 404 for unknown task", func(t *testing.T) {
		server := startServer(t)

		response := send(t, server, "PATCH", "/tasks/missing/complete", "")

		assertExchange(t, response, 404, `{"error":"Task \"missing\" was not found"}`)
	})

	t.Run("DELETE /tasks/:id returns 204 and removes the task", func(t *testing.T) {
		server := startServer(t)

		send(t, server, "POST", "/tasks", `{"title":"Buy milk"}`)

		deleteResponse := send(t, server, "DELETE", "/tasks/1", "")
		listResponse := send(t, server, "GET", "/tasks", "")

		if deleteResponse != (exchange{status: 204, body: ""}) {
			t.Errorf("delete: got %+v", deleteResponse)
		}
		assertExchange(t, listResponse, 200, `[]`)
	})

	t.Run("DELETE /tasks/:id returns 404 for unknown task", func(t *testing.T) {
		server := startServer(t)

		response := send(t, server, "DELETE", "/tasks/missing", "")

		assertExchange(t, response, 404, `{"error":"Task \"missing\" was not found"}`)
	})
}
