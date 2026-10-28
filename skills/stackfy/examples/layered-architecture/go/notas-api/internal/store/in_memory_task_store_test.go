package store_test

import (
	"fmt"
	"slices"
	"testing"

	"notas-api/internal/domain"
	"notas-api/internal/store"
)

func sequentialIDs(prefix string) func() string {
	nextID := 0

	return func() string {
		nextID++
		return fmt.Sprintf("%s%d", prefix, nextID)
	}
}

func fixedID(id string) func() string {
	return func() string { return id }
}

func TestInMemoryTaskStore(t *testing.T) {
	t.Run("create stores a task with generated id and open status", func(t *testing.T) {
		taskStore := store.NewInMemoryTaskStore(fixedID("task-1"))

		task, err := taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})

		if err != nil || task != (domain.Task{ID: "task-1", Title: "Buy milk", Status: "open"}) {
			t.Fatalf("got %+v, %v", task, err)
		}
	})

	t.Run("list returns all stored tasks for the all filter", func(t *testing.T) {
		taskStore := store.NewInMemoryTaskStore(sequentialIDs("task-"))

		taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})
		taskStore.Create(domain.CreateTaskInput{Title: "Walk dog"})

		expected := []domain.Task{
			{ID: "task-1", Title: "Buy milk", Status: "open"},
			{ID: "task-2", Title: "Walk dog", Status: "open"},
		}

		if tasks := taskStore.List(domain.TaskListFilterAll); !slices.Equal(tasks, expected) {
			t.Fatalf("got %+v", tasks)
		}
	})

	t.Run("list filters tasks by status", func(t *testing.T) {
		taskStore := store.NewInMemoryTaskStore(sequentialIDs("task-"))

		taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})
		taskStore.Create(domain.CreateTaskInput{Title: "Walk dog"})
		taskStore.Complete("task-2")

		openTasks := taskStore.List(domain.TaskListFilterOpen)
		doneTasks := taskStore.List(domain.TaskListFilterDone)

		if !slices.Equal(openTasks, []domain.Task{{ID: "task-1", Title: "Buy milk", Status: "open"}}) {
			t.Errorf("open: got %+v", openTasks)
		}
		if !slices.Equal(doneTasks, []domain.Task{{ID: "task-2", Title: "Walk dog", Status: "done"}}) {
			t.Errorf("done: got %+v", doneTasks)
		}
	})

	t.Run("complete marks an open task as done and is idempotent", func(t *testing.T) {
		taskStore := store.NewInMemoryTaskStore(fixedID("task-1"))

		taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})

		firstCompletion, _, _ := taskStore.Complete("task-1")
		secondCompletion, _, _ := taskStore.Complete("task-1")
		expected := domain.Task{ID: "task-1", Title: "Buy milk", Status: "done"}

		if firstCompletion != expected || secondCompletion != expected {
			t.Fatalf("got %+v and %+v", firstCompletion, secondCompletion)
		}
	})

	t.Run("remove deletes a task and it no longer appears in listings", func(t *testing.T) {
		taskStore := store.NewInMemoryTaskStore(fixedID("task-1"))

		taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})

		removed, _ := taskStore.Remove("task-1")
		tasks := taskStore.List(domain.TaskListFilterAll)
		_, found := taskStore.GetByID("task-1")

		if !removed || len(tasks) != 0 || found {
			t.Fatalf("got removed %v, tasks %+v, found %v", removed, tasks, found)
		}
	})
}
