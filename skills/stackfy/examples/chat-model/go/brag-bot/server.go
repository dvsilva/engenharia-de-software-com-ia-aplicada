package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"strings"
)

//go:embed templates static
var assets embed.FS

var pages = template.Must(template.ParseFS(assets, "templates/*.gohtml"))

var errBodyNotJSON = errors.New("the body is not JSON, so it has no definition")

var errDefinitionNotText = errors.New("definition must be a string")

type page struct {
	View string
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)

	encoder := json.NewEncoder(response)
	encoder.SetEscapeHTML(false)
	encoder.Encode(body)
}

func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && (mediaType == "application/json" || strings.HasSuffix(mediaType, "+json"))
}

func isFalsy(value any) bool {
	switch value := value.(type) {
	case nil:
		return true
	case bool:
		return !value
	case float64:
		return value == 0
	case string:
		return value == ""
	}
	return false
}

func readBody(request *http.Request) (map[string]any, error) {
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, err
	}

	text := strings.TrimSpace(string(raw))
	if text == "" {
		return map[string]any{}, nil
	}
	if !strings.HasPrefix(text, "{") && !strings.HasPrefix(text, "[") {
		return nil, errors.New("a JSON body must be an object or an array")
	}

	var body any
	if err := json.Unmarshal([]byte(text), &body); err != nil {
		return nil, err
	}

	fields, _ := body.(map[string]any)
	return fields, nil
}

func failBrag(response http.ResponseWriter, err error) {
	fmt.Fprintln(os.Stderr, "Error generating brag:", err)
	writeJSON(response, http.StatusInternalServerError, map[string]string{"error": "Failed to generate brag"})
}

func handleBrag(response http.ResponseWriter, request *http.Request) {
	if !isJSON(request.Header.Get("Content-Type")) {
		failBrag(response, errBodyNotJSON)
		return
	}

	body, err := readBody(request)
	if err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}

	definition := body["definition"]
	if isFalsy(definition) {
		writeJSON(response, http.StatusBadRequest, map[string]string{"error": "Definition is required"})
		return
	}

	text, isText := definition.(string)
	if !isText {
		failBrag(response, errDefinitionNotText)
		return
	}

	brag, err := generateBrag(request.Context(), text)
	if err != nil {
		failBrag(response, err)
		return
	}

	writeJSON(response, http.StatusOK, brag)
}

func renderPage(view string) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/html; charset=utf-8")

		if err := pages.ExecuteTemplate(response, "index.gohtml", page{View: view}); err != nil {
			fmt.Fprintln(os.Stderr, "Error rendering page:", err)
		}
	}
}

func notFound(response http.ResponseWriter, request *http.Request) {
	http.Error(response, fmt.Sprintf("Cannot %s %s", request.Method, request.URL.Path), http.StatusNotFound)
}

func main() {
	static, err := fs.Sub(assets, "static")
	if err != nil {
		panic(err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	files := http.FileServerFS(static)
	routes := http.NewServeMux()
	routes.HandleFunc("POST /api/brag", handleBrag)
	routes.HandleFunc("GET /{$}", renderPage("dashboard"))
	routes.HandleFunc("GET /detail/{id}", renderPage("missing"))
	routes.Handle("GET /styles.css", files)
	routes.Handle("GET /scripts/{file}", files)
	routes.HandleFunc("/", notFound)

	fmt.Printf("BragBot listening on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, routes); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
