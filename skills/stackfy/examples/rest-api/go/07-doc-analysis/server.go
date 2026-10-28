package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"unicode/utf16"
)

const maxFileSize = 10 * 1024 * 1024

const minimumQuestionLength = 3

var errNotMultipart = errors.New("the request is not multipart")

var errFileTooLarge = errors.New("request file too large")

type errorBody struct {
	Error string `json:"error"`
}

type notFoundBody struct {
	Message    string `json:"message"`
	Error      string `json:"error"`
	StatusCode int    `json:"statusCode"`
}

type chatAnswer struct {
	Filename string `json:"filename"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

type upload struct {
	found    bool
	filename string
	mimetype string
	content  []byte
}

type uploadForm struct {
	fields map[string]string
	file   upload
}

func writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("content-type", "application/json; charset=utf-8")
	writer.WriteHeader(status)

	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(body)
}

func mediaTypeOf(header string) string {
	mediaType, _, err := mime.ParseMediaType(header)
	if err != nil {
		return ""
	}

	return mediaType
}

func readFile(part *multipart.Part) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(part, maxFileSize+1))
	if err != nil {
		return nil, err
	}
	if len(content) > maxFileSize {
		return nil, errFileTooLarge
	}

	return content, nil
}

func (form *uploadForm) add(part *multipart.Part) error {
	if part.FileName() == "" {
		value, err := io.ReadAll(part)
		if err != nil {
			return err
		}
		if _, seen := form.fields[part.FormName()]; !seen {
			form.fields[part.FormName()] = string(value)
		}

		return nil
	}
	if form.file.found {
		return nil
	}

	content, err := readFile(part)
	if err != nil {
		return err
	}

	form.file = upload{
		found:    true,
		filename: part.FileName(),
		mimetype: mediaTypeOf(part.Header.Get("Content-Type")),
		content:  content,
	}

	return nil
}

func readForm(request *http.Request) (uploadForm, error) {
	reader, err := request.MultipartReader()
	if err != nil {
		return uploadForm{}, errNotMultipart
	}

	form := uploadForm{fields: map[string]string{}}
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			return form, nil
		}
		if err != nil {
			return uploadForm{}, err
		}
		if err := form.add(part); err != nil {
			return uploadForm{}, err
		}
	}
}

func questionLength(question string) int {
	return len(utf16.Encode([]rune(strings.TrimSpace(question))))
}

func analyze(ctx context.Context, graph Graph, request *http.Request) (int, any) {
	form, err := readForm(request)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error analyzing document:", err)
		return http.StatusInternalServerError, errorBody{Error: err.Error()}
	}
	if !form.file.found {
		return http.StatusBadRequest, errorBody{Error: "No file uploaded"}
	}
	if form.file.mimetype != "application/pdf" {
		return http.StatusBadRequest, errorBody{Error: "Only PDF files are supported"}
	}

	question, present := form.fields["question"]
	if !present || questionLength(question) < minimumQuestionLength {
		return http.StatusBadRequest, errorBody{Error: "Question is required and must be at least 3 characters"}
	}

	response := graph(ctx, GraphState{
		Messages:       []Message{{Role: "human", Text: question}},
		DocumentBase64: base64.StdEncoding.EncodeToString(form.file.content),
	})

	answer := response.lastMessageText()
	if answer == "" {
		answer = "No answer generated"
	}

	return http.StatusOK, chatAnswer{Filename: form.file.filename, Question: question, Answer: answer}
}

func createServer(graph Graph) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/chat" {
			writeJSON(writer, http.StatusNotFound, notFoundBody{
				Message:    fmt.Sprintf("Route %s:%s not found", request.Method, request.URL.RequestURI()),
				Error:      "Not Found",
				StatusCode: http.StatusNotFound,
			})
			return
		}

		status, body := analyze(request.Context(), graph, request)
		writeJSON(writer, status, body)
	})
}
