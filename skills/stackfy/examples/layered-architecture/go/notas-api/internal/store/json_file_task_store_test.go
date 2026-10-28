package store_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"notas-api/internal/domain"
	"notas-api/internal/store"
)

func assertPersistenceError(t *testing.T, err error, fragment string) {
	t.Helper()

	persistenceError, isPersistence := errors.AsType[*store.TaskStorePersistenceError](err)

	if !isPersistence || !strings.Contains(persistenceError.Message, fragment) {
		t.Fatalf("expected a persistence error with %q, got %v", fragment, err)
	}
}

func writeFile(t *testing.T, filePath string, content string) {
	t.Helper()

	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestJSONFileTaskStore(t *testing.T) {
	t.Run("starts empty when file does not exist", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		taskStore, err := store.NewJSONFileTaskStore(filePath, nil)

		if err != nil || len(taskStore.List(domain.TaskListFilterAll)) != 0 {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("starts empty when file exists but is empty", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		writeFile(t, filePath, "")

		taskStore, err := store.NewJSONFileTaskStore(filePath, nil)

		if err != nil || len(taskStore.List(domain.TaskListFilterAll)) != 0 {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("loads tasks from an existing JSON file", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		writeFile(t, filePath, `{"tasks":[{"id":"1","title":"Buy milk","status":"open"}]}`)

		taskStore, err := store.NewJSONFileTaskStore(filePath, nil)
		if err != nil {
			t.Fatal(err)
		}

		tasks := taskStore.List(domain.TaskListFilterAll)

		if !slices.Equal(tasks, []domain.Task{{ID: "1", Title: "Buy milk", Status: "open"}}) {
			t.Fatalf("got %+v", tasks)
		}
	})

	t.Run("persists create/complete/remove across store instances", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		firstStore, _ := store.NewJSONFileTaskStore(filePath, sequentialIDs(""))
		created, _ := firstStore.Create(domain.CreateTaskInput{Title: "Buy milk"})
		secondStore, _ := store.NewJSONFileTaskStore(filePath, nil)
		listedAfterCreate := secondStore.List(domain.TaskListFilterAll)
		completed, _, _ := secondStore.Complete("1")
		thirdStore, _ := store.NewJSONFileTaskStore(filePath, nil)
		listedAsDone := thirdStore.List(domain.TaskListFilterDone)
		removed, _ := thirdStore.Remove("1")
		fourthStore, _ := store.NewJSONFileTaskStore(filePath, nil)

		if created != (domain.Task{ID: "1", Title: "Buy milk", Status: "open"}) {
			t.Errorf("created: got %+v", created)
		}
		if !slices.Equal(listedAfterCreate, []domain.Task{created}) {
			t.Errorf("listed after create: got %+v", listedAfterCreate)
		}
		if completed != (domain.Task{ID: "1", Title: "Buy milk", Status: "done"}) {
			t.Errorf("completed: got %+v", completed)
		}
		if !slices.Equal(listedAsDone, []domain.Task{completed}) {
			t.Errorf("listed as done: got %+v", listedAsDone)
		}
		if !removed || len(fourthStore.List(domain.TaskListFilterAll)) != 0 {
			t.Errorf("removed: got %v", removed)
		}
	})

	t.Run("returns a persistence error for invalid JSON", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		writeFile(t, filePath, "{ invalid json }")

		_, err := store.NewJSONFileTaskStore(filePath, nil)

		assertPersistenceError(t, err, "contains invalid JSON")
	})

	t.Run("returns a persistence error for invalid file structure", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		writeFile(t, filePath, `{"tasks":[{"id":1}]}`)

		_, err := store.NewJSONFileTaskStore(filePath, nil)

		assertPersistenceError(t, err, "invalid structure")
	})

	t.Run("returns a persistence error when reading from an unreadable path", func(t *testing.T) {
		directoryPath := filepath.Join(t.TempDir(), "tasks-dir")

		if err := os.Mkdir(directoryPath, 0o755); err != nil {
			t.Fatal(err)
		}

		_, err := store.NewJSONFileTaskStore(directoryPath, nil)

		assertPersistenceError(t, err, "Failed to read")
	})

	t.Run("returns a persistence error when write path cannot be created", func(t *testing.T) {
		blocker := filepath.Join(t.TempDir(), "blocker")

		writeFile(t, blocker, "")

		taskStore, _ := store.NewJSONFileTaskStore(filepath.Join(blocker, "tasks.json"), fixedID("1"))
		_, err := taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})

		assertPersistenceError(t, err, "Failed to persist")
	})

	t.Run("writes tasks using the expected JSON envelope", func(t *testing.T) {
		filePath := filepath.Join(t.TempDir(), "tasks.json")

		taskStore, _ := store.NewJSONFileTaskStore(filePath, fixedID("1"))
		taskStore.Create(domain.CreateTaskInput{Title: "Buy milk"})

		rawContent, err := os.ReadFile(filePath)
		if err != nil {
			t.Fatal(err)
		}

		var persistedContent map[string][]domain.Task
		err = json.Unmarshal(rawContent, &persistedContent)
		expected := map[string][]domain.Task{"tasks": {{ID: "1", Title: "Buy milk", Status: "open"}}}

		if err != nil || len(persistedContent) != 1 || !slices.Equal(persistedContent["tasks"], expected["tasks"]) {
			t.Fatalf("got %s", rawContent)
		}
	})
}
