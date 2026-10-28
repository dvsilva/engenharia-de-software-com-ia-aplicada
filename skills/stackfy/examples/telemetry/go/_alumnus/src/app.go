package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	"go.opentelemetry.io/otel/trace"

	"alumnus/src/database"
	"alumnus/src/monitoring"
	"alumnus/src/scenarios/db-leaky-connections"
	"alumnus/src/types"
)

type notFoundResponse struct {
	Message    string `json:"message"`
	Error      string `json:"error"`
	StatusCode int    `json:"statusCode"`
}

type App struct {
	types.AppInstance
	Handler http.Handler
	Close   func(ctx context.Context) error
}

var scenarios = []*dbleakyconnections.DbLeakyConnectionsScenario{dbleakyconnections.Scenario}

func notFound(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("content-type", "application/json; charset=utf-8")
	response.WriteHeader(http.StatusNotFound)
	json.NewEncoder(response).Encode(notFoundResponse{
		Message:    fmt.Sprintf("Route %s:%s not found", request.Method, request.URL.Path),
		Error:      "Not Found",
		StatusCode: http.StatusNotFound,
	})
}

func withRouteAttribute(router *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		router.ServeHTTP(response, request)

		_, route, found := strings.Cut(request.Pattern, " ")
		if !found || route == "/" {
			return
		}

		trace.SpanFromContext(request.Context()).SetAttributes(semconv.HTTPRoute(route))
	})
}

func enabled(enabledScenarios []string) []*dbleakyconnections.DbLeakyConnectionsScenario {
	if len(enabledScenarios) == 0 {
		return scenarios
	}

	return slices.DeleteFunc(slices.Clone(scenarios), func(scenario *dbleakyconnections.DbLeakyConnectionsScenario) bool {
		return !slices.Contains(enabledScenarios, scenario.Name)
	})
}

func initServer(ctx context.Context, config types.Config, enabledScenarios []string) (*App, error) {
	logger, err := monitoring.InitOtel(ctx, config)
	if err != nil {
		return nil, err
	}

	app := types.AppInstance{Router: http.NewServeMux(), Log: logger}

	db, err := database.Connect(ctx, config.DatabaseURL)
	if err != nil {
		return nil, err
	}

	if err := database.SeedDb(ctx, db); err != nil {
		return nil, err
	}

	app.Router.HandleFunc("GET /health", func(response http.ResponseWriter, request *http.Request) {
		app.Log.InfoContext(request.Context(), "health check was triggered")
		response.Header().Set("content-type", "application/json; charset=utf-8")
		json.NewEncoder(response).Encode(map[string]string{"message": "ok"})
	})

	selected := enabled(enabledScenarios)
	for _, scenario := range selected {
		if err := scenario.Init(app, config, db); err != nil {
			return nil, err
		}
		if err := scenario.RegisterRoutes(app, config, db); err != nil {
			return nil, err
		}
	}

	app.Router.HandleFunc("/", notFound)

	closeApp := func(ctx context.Context) error {
		fmt.Println("closing...")

		for _, scenario := range selected {
			scenario.Terminate(ctx, app)
		}
		db.Close()

		return monitoring.ShutDownOtel(ctx)
	}

	return &App{AppInstance: app, Handler: otelhttp.NewHandler(withRouteAttribute(app.Router), "server"), Close: closeApp}, nil
}
