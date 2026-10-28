package factories

import (
	"net/http"

	"notas-api/internal/httpapi"
	"notas-api/internal/service"
	"notas-api/internal/store"
)

type TaskApp struct {
	TaskService service.TaskService
	TaskStore   store.TaskStore
	HTTPHandler http.Handler
}

func NewTaskApp(taskStore store.TaskStore) TaskApp {
	if taskStore == nil {
		taskStore = store.NewInMemoryTaskStore(nil)
	}

	taskService := service.NewTaskService(taskStore)

	return TaskApp{
		TaskService: taskService,
		TaskStore:   taskStore,
		HTTPHandler: httpapi.NewTaskHTTPHandler(taskService),
	}
}
