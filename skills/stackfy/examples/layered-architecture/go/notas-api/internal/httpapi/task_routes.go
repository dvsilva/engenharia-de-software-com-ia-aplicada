package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"

	"notas-api/internal/domain"
	"notas-api/internal/service"
)

type route func(writer http.ResponseWriter, request *http.Request) error

type taskRoutes struct {
	taskService service.TaskService
}

func NewTaskHTTPHandler(taskService service.TaskService) http.Handler {
	routes := taskRoutes{taskService: taskService}
	mux := http.NewServeMux()

	mux.Handle("POST /tasks", route(routes.create))
	mux.Handle("GET /tasks", route(routes.list))
	mux.Handle("PATCH /tasks/{id}/complete", route(routes.complete))
	mux.Handle("DELETE /tasks/{id}", route(routes.remove))
	mux.Handle("/", route(routeNotFound))

	return mux
}

func (handle route) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	err := handle(writer, request)
	if err == nil {
		return
	}

	httpError := toHTTPErrorResponse(err)

	sendJSON(writer, httpError.statusCode, httpError.body)
}

func sendJSON(writer http.ResponseWriter, statusCode int, body any) {
	encoder := json.NewEncoder(writer)

	encoder.SetEscapeHTML(false)
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(statusCode)
	encoder.Encode(body)
}

func readJSONBody(request *http.Request) (any, error) {
	rawBody, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, err
	}

	if len(rawBody) == 0 {
		return map[string]any{}, nil
	}

	var body any
	err = json.Unmarshal(rawBody, &body)

	return body, err
}

func statusParam(query url.Values) string {
	if !query.Has("status") {
		return string(domain.TaskListFilterAll)
	}

	return query.Get("status")
}

func (routes taskRoutes) create(writer http.ResponseWriter, request *http.Request) error {
	body, err := readJSONBody(request)
	if err != nil {
		return err
	}

	input, err := domain.ParseCreateTaskInput(body)
	if err != nil {
		return err
	}

	task, err := routes.taskService.CreateTask(input)
	if err != nil {
		return err
	}

	sendJSON(writer, http.StatusCreated, task)

	return nil
}

func (routes taskRoutes) list(writer http.ResponseWriter, request *http.Request) error {
	filter, err := domain.ParseTaskListFilter(statusParam(request.URL.Query()))
	if err != nil {
		return err
	}

	tasks, err := routes.taskService.ListTasks(filter)
	if err != nil {
		return err
	}

	sendJSON(writer, http.StatusOK, tasks)

	return nil
}

func (routes taskRoutes) complete(writer http.ResponseWriter, request *http.Request) error {
	taskID, err := domain.ParseTaskID(request.PathValue("id"))
	if err != nil {
		return err
	}

	task, err := routes.taskService.CompleteTask(taskID)
	if err != nil {
		return err
	}

	sendJSON(writer, http.StatusOK, task)

	return nil
}

func (routes taskRoutes) remove(writer http.ResponseWriter, request *http.Request) error {
	taskID, err := domain.ParseTaskID(request.PathValue("id"))
	if err != nil {
		return err
	}

	if err := routes.taskService.RemoveTask(taskID); err != nil {
		return err
	}

	writer.WriteHeader(http.StatusNoContent)

	return nil
}

func routeNotFound(writer http.ResponseWriter, _ *http.Request) error {
	sendJSON(writer, http.StatusNotFound, httpErrorBody{Error: "Route not found"})

	return nil
}
