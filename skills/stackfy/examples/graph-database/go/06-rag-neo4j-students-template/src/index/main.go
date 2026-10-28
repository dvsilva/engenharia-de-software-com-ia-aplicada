package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"

	"rag-neo4j-students/src"
)

const testQuestion = "Which courses are commonly bought together?"

func listenPort() string {
	if port := os.Getenv("PORT"); port != "" {
		return port
	}

	return "4000"
}

func sendTestQuestion(handler http.Handler) error {
	payload, err := json.Marshal(map[string]string{"question": testQuestion})
	if err != nil {
		return err
	}

	request := httptest.NewRequest(http.MethodPost, "/sales", strings.NewReader(string(payload)))
	request.Header.Set("content-type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	var answer src.SalesAnswer
	if err := json.Unmarshal(recorder.Body.Bytes(), &answer); err != nil {
		return err
	}

	fmt.Println(answer.Answer)

	return nil
}

func main() {
	port := listenPort()
	server := src.CreateServer()

	listener, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println("Server is running on http://0.0.0.0:" + port)

	go func() {
		if err := sendTestQuestion(server); err != nil {
			fmt.Fprintln(os.Stderr, "Error making test request:", err)
		}
	}()

	if err := http.Serve(listener, server); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
