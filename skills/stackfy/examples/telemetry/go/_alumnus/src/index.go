package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"alumnus/src/util"
)

var endpoints = []string{"/students/db-leaky-connections"}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func requestEndpoint(client *http.Client, logger *slog.Logger, url string) {
	response, err := client.Get(url)
	if err != nil {
		logger.Error("Error fetching endpoint", "err", err)
		return
	}
	defer response.Body.Close()

	var data map[string]any
	if err := json.NewDecoder(response.Body).Decode(&data); err != nil {
		logger.Error("Error fetching endpoint", "err", err)
		return
	}

	attributes := make([]any, 0, len(data))
	for key, value := range data {
		attributes = append(attributes, slog.Any(key, value))
	}

	logger.Info("", attributes...)
}

func requestOwnEndpoints(logger *slog.Logger, port int) {
	client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
	defaultURL := fmt.Sprintf("http://localhost:%d", port)

	for range time.Tick(2 * time.Second) {
		logger.Info("requesting urls to generate spans and metrics")

		for _, endpoint := range endpoints {
			go requestEndpoint(client, logger, defaultURL+endpoint)
		}
	}
}

func main() {
	config, err := util.LoadConfig()
	if err != nil {
		fail(err)
	}

	app, err := initServer(context.Background(), config, nil)
	if err != nil {
		fail(err)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", config.Port))
	if err != nil {
		fail(err)
	}

	actualPort := listener.Addr().(*net.TCPAddr).Port
	fmt.Printf("Server is running on http://0.0.0.0:%d (port: %d)\n", actualPort, actualPort)

	if config.NodeEnv == "production" {
		go requestOwnEndpoints(app.Log, actualPort)
	}

	fail(http.Serve(listener, app.Handler))
}
