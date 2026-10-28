package service_test

import (
	"errors"
	"fmt"
	"slices"
	"testing"

	"notas-api/internal/domain"
	"notas-api/internal/service"
	"notas-api/internal/store"
)

func newTaskService() service.TaskService {
	nextID := 0

	return service.NewTaskService(store.NewInMemoryTaskStore(func() string {
		nextID++
		return fmt.Sprintf("task-%d", nextID)
	}))
}

func assertNotFound(t *testing.T, err error, taskID string) {
	t.Helper()

	notFoundError, isNotFound := errors.AsType[*service.TaskNotFoundError](err)

	if !isNotFound || notFoundError.TaskID != taskID {
		t.Fatalf("expected task %q not found, got %v", taskID, err)
	}
}

func TestTaskService(t *testing.T) {
	t.Run("CreateTask creates a task with open status", func(t *testing.T) {
		taskService := newTaskService()

		task, err := taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})

		if err != nil || task != (domain.Task{ID: "task-1", Title: "Buy milk", Status: "open"}) {
			t.Fatalf("got %+v, %v", task, err)
		}
	})

	t.Run("CreateTask rejects an invalid title", func(t *testing.T) {
		taskService := newTaskService()

		_, err := taskService.CreateTask(domain.CreateTaskInput{Title: "   "})
		validationError, isValidation := errors.AsType[*service.TaskValidationError](err)

		if !isValidation || !slices.Contains(validationError.Issues, "Task title is required") {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("ListTasks returns all tasks for the all filter", func(t *testing.T) {
		taskService := newTaskService()

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})
		taskService.CreateTask(domain.CreateTaskInput{Title: "Walk dog"})

		tasks, err := taskService.ListTasks(domain.TaskListFilterAll)
		expected := []domain.Task{
			{ID: "task-1", Title: "Buy milk", Status: "open"},
			{ID: "task-2", Title: "Walk dog", Status: "open"},
		}

		if err != nil || !slices.Equal(tasks, expected) {
			t.Fatalf("got %+v, %v", tasks, err)
		}
	})

	t.Run("ListTasks filters open and done tasks", func(t *testing.T) {
		taskService := newTaskService()

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})
		taskService.CreateTask(domain.CreateTaskInput{Title: "Walk dog"})
		taskService.CompleteTask("task-2")

		openTasks, _ := taskService.ListTasks(domain.TaskListFilterOpen)
		doneTasks, _ := taskService.ListTasks(domain.TaskListFilterDone)

		if !slices.Equal(openTasks, []domain.Task{{ID: "task-1", Title: "Buy milk", Status: "open"}}) {
			t.Errorf("open: got %+v", openTasks)
		}
		if !slices.Equal(doneTasks, []domain.Task{{ID: "task-2", Title: "Walk dog", Status: "done"}}) {
			t.Errorf("done: got %+v", doneTasks)
		}
	})

	t.Run("ListTasks rejects an invalid filter", func(t *testing.T) {
		taskService := newTaskService()

		_, err := taskService.ListTasks("invalid-filter")
		validationError, isValidation := errors.AsType[*service.TaskValidationError](err)

		if !isValidation || len(validationError.Issues) == 0 {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("CompleteTask is idempotent for an already done task", func(t *testing.T) {
		taskService := newTaskService()

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})

		first, _ := taskService.CompleteTask("task-1")
		second, _ := taskService.CompleteTask("task-1")

		if first != (domain.Task{ID: "task-1", Title: "Buy milk", Status: "done"}) || second != first {
			t.Fatalf("got %+v and %+v", first, second)
		}
	})

	t.Run("CompleteTask fails for an unknown id", func(t *testing.T) {
		taskService := newTaskService()

		_, err := taskService.CompleteTask("missing-task")

		assertNotFound(t, err, "missing-task")
	})

	t.Run("RemoveTask deletes an existing task", func(t *testing.T) {
		taskService := newTaskService()

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})

		err := taskService.RemoveTask("task-1")
		tasks, _ := taskService.ListTasks(domain.TaskListFilterAll)

		if err != nil || len(tasks) != 0 {
			t.Fatalf("got %+v, %v", tasks, err)
		}
	})

	t.Run("RemoveTask fails for an unknown id", func(t *testing.T) {
		taskService := newTaskService()

		err := taskService.RemoveTask("missing-task")

		assertNotFound(t, err, "missing-task")
	})
}
