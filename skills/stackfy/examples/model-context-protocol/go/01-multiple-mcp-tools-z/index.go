package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
)

func main() {
	app := createServer(buildGraph(loadConfig()))

	listener, err := net.Listen("tcp", "0.0.0.0:3000")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	go func() { _ = http.Serve(listener, app) }()

	fmt.Println("Server is running on http://0.0.0.0:3000")

	salesData, err := os.ReadFile("./data/sales-complete.csv")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	question := fmt.Sprintf("\nHere is a CSV file called sales.csv.\nWhat's the total revenue from this sales data?.\n\n%s\n", salesData)
	payload, _ := json.Marshal(map[string]string{"question": question})

	request := httptest.NewRequest(http.MethodPost, "/chat", bytes.NewReader(payload))
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	fmt.Println("Response from /chat:", response.Code)
	fmt.Println(response.Body.String())
	os.Exit(0)
}
