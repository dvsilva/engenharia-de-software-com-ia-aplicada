package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
)

const defaultDocument = "a-comprehensive-overview-of-large-language-models.pdf"

const defaultQuestion = "describe what's on this document"

func listenPort() string {
	if port := os.Getenv("PORT"); port != "" {
		return port
	}

	return "4000"
}

func printBanner(port string) {
	fmt.Printf(`
╔════════════════════════════════════════╗
║   Document Q&A Pipeline Server         ║
%s
╚════════════════════════════════════════╝

📚 Available endpoint:
  • POST /chat  - Upload PDF and ask a question

Example usage:
  curl -X POST -F "file=@document.pdf" -F "question=What is this about?" \
    http://localhost:%s/chat

`, fmt.Sprintf("║%-40s║", "   Running on http://0.0.0.0:"+port), port)
}

func documentForm(filename string, content []byte) (*bytes.Buffer, string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	header := textproto.MIMEHeader{}

	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
	header.Set("Content-Type", "application/pdf")

	part, err := writer.CreatePart(header)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(content); err != nil {
		return nil, "", err
	}
	if err := writer.WriteField("question", defaultQuestion); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}

	return body, writer.FormDataContentType(), nil
}

func testDefaultDocument(handler http.Handler) error {
	content, err := os.ReadFile(filepath.Join("docs", defaultDocument))
	if err != nil {
		return err
	}

	fmt.Print("🧪 Testing with default document...\n\n")

	body, contentType, err := documentForm(defaultDocument, content)
	if err != nil {
		return err
	}

	request := httptest.NewRequest(http.MethodPost, "/chat", body)
	request.Header.Set("content-type", contentType)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	var result chatAnswer
	if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
		return err
	}

	fmt.Printf("📝 AI Response:\n%s\n\n\n", result.Answer)

	return nil
}

func main() {
	port := listenPort()
	handler := createServer(buildDocumentQAGraphInstance())

	listener, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	printBanner(port)

	go func() {
		if err := testDefaultDocument(handler); err != nil {
			fmt.Fprintln(os.Stderr, "⚠️ Could not run default test:", err)
		}
	}()

	if err := http.Serve(listener, handler); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
