package dbleakyconnections

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"alumnus/src/scenarios/base"
	"alumnus/src/types"
)

const connectionTimeout = time.Second

type studentsResponse struct {
	Students []types.Student `json:"students"`
	Message  string          `json:"message"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type resetResponse struct {
	Message              string `json:"message"`
	CleanedCount         int    `json:"cleanedCount"`
	RemainingConnections int    `json:"remainingConnections"`
}

type DbLeakyConnectionsScenario struct {
	*base.BaseScenario
	mutex             sync.Mutex
	leakedConnections []*pgxpool.Conn
	pool              *pgxpool.Pool
}

func newDbLeakyConnectionsScenario() *DbLeakyConnectionsScenario {
	scenario := &DbLeakyConnectionsScenario{}
	scenario.BaseScenario = base.NewBaseScenario("db-leaky-connections", scenario)

	return scenario
}

var Scenario = newDbLeakyConnectionsScenario()

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("content-type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	json.NewEncoder(response).Encode(body)
}

func (scenario *DbLeakyConnectionsScenario) OnInit(app types.AppInstance, config types.Config, _ *pgxpool.Pool) error {
	poolConfig, err := pgxpool.ParseConfig(config.DatabaseURL)
	if err != nil {
		return err
	}

	poolConfig.MaxConns = 2
	poolConfig.MaxConnIdleTime = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return err
	}

	scenario.pool = pool
	app.Log.Info("DB Leaky Connections scenario initialized with limited pool", "maxConnections", 2, "connectionTimeout", "1s")

	return nil
}

func (scenario *DbLeakyConnectionsScenario) createConnection(ctx context.Context, app types.AppInstance) (*pgxpool.Conn, error) {
	if scenario.pool == nil {
		return nil, errors.New("Connection pool not initialized")
	}

	app.Log.DebugContext(ctx, "Acquiring connection from pool")

	acquireCtx, cancel := context.WithTimeout(ctx, connectionTimeout)
	defer cancel()

	connection, err := scenario.pool.Acquire(acquireCtx)
	if err != nil {
		return nil, err
	}

	scenario.mutex.Lock()
	scenario.leakedConnections = append(scenario.leakedConnections, connection)
	scenario.mutex.Unlock()

	return connection, nil
}

func (scenario *DbLeakyConnectionsScenario) cleanupAllConnections() (int, int) {
	scenario.mutex.Lock()
	defer scenario.mutex.Unlock()

	count := len(scenario.leakedConnections)
	for _, connection := range scenario.leakedConnections {
		connection.Release()
	}
	scenario.leakedConnections = nil

	return count, len(scenario.leakedConnections)
}

func (scenario *DbLeakyConnectionsScenario) queryStudents(ctx context.Context, app types.AppInstance) ([]types.Student, error) {
	connection, err := scenario.createConnection(ctx, app)
	if err != nil {
		return nil, err
	}

	rows, err := connection.Query(ctx, "SELECT * FROM students LIMIT 1")
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, pgx.RowToStructByNameLax[types.Student])
}

func (scenario *DbLeakyConnectionsScenario) OnRegisterRoutes(app types.AppInstance, _ types.Config, _ *pgxpool.Pool) {
	app.Router.HandleFunc("GET /students/db-leaky-connections", func(response http.ResponseWriter, request *http.Request) {
		ctx := request.Context()
		app.Log.InfoContext(ctx, "Processing student query request")

		students, err := scenario.queryStudents(ctx, app)
		if err != nil {
			span := trace.SpanFromContext(ctx)
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())

			app.Log.ErrorContext(ctx, "Error processing request", "err", err)
			writeJSON(response, http.StatusInternalServerError, errorResponse{
				Error:   "Internal Server Error",
				Message: "Failed to retrieve students data",
			})
			return
		}

		writeJSON(response, http.StatusOK, studentsResponse{Students: students, Message: "Students retrieved successfully"})
	})

	app.Router.HandleFunc("POST /students/db-leaky-connections/reset", func(response http.ResponseWriter, request *http.Request) {
		app.Log.WarnContext(request.Context(), "Manual reset requested - cleaning up leaked connections")

		cleanedCount, remainingConnections := scenario.cleanupAllConnections()
		writeJSON(response, http.StatusOK, resetResponse{
			Message:              "Leaked connections cleaned up",
			CleanedCount:         cleanedCount,
			RemainingConnections: remainingConnections,
		})
	})
}

func (scenario *DbLeakyConnectionsScenario) OnTerminate(_ context.Context, app types.AppInstance) {
	scenario.mutex.Lock()
	app.Log.Info("Terminating db-leaky-connections scenario", "leakedConnections", len(scenario.leakedConnections))
	scenario.mutex.Unlock()

	scenario.cleanupAllConnections()

	if scenario.pool != nil {
		scenario.pool.Close()
	}
	scenario.pool = nil

	app.Log.Info("DB leaky connections scenario terminated")
}

func (scenario *DbLeakyConnectionsScenario) LeakedConnectionsCount() int {
	scenario.mutex.Lock()
	defer scenario.mutex.Unlock()

	return len(scenario.leakedConnections)
}
