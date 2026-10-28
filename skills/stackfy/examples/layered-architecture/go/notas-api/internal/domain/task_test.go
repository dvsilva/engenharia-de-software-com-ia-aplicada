package domain_test

import (
	"errors"
	"slices"
	"testing"

	"notas-api/internal/domain"
)

func TestTaskSchemas(t *testing.T) {
	t.Run("createTaskInput trims and accepts a valid title", func(t *testing.T) {
		input, err := domain.ParseCreateTaskInput(map[string]any{"title": "  Buy milk  "})

		if err != nil || input != (domain.CreateTaskInput{Title: "Buy milk"}) {
			t.Fatalf("got %+v, %v", input, err)
		}
	})

	t.Run("createTaskInput rejects a blank title", func(t *testing.T) {
		_, err := domain.ParseCreateTaskInput(map[string]any{"title": "   "})
		validationError, isValidation := errors.AsType[*domain.ValidationError](err)

		if !isValidation || !slices.Contains(validationError.Issues, "Task title is required") {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("taskListFilter accepts all supported filters", func(t *testing.T) {
		for _, filter := range []domain.TaskListFilter{"all", "open", "done"} {
			parsed, err := domain.ParseTaskListFilter(string(filter))

			if err != nil || parsed != filter {
				t.Errorf("%s: got %q, %v", filter, parsed, err)
			}
		}
	})

	t.Run("task parses a valid task", func(t *testing.T) {
		task, err := domain.ParseTask(map[string]any{"id": "task-1", "title": "Buy milk", "status": "open"})

		if err != nil || task != (domain.Task{ID: "task-1", Title: "Buy milk", Status: "open"}) {
			t.Fatalf("got %+v, %v", task, err)
		}
	})
}
