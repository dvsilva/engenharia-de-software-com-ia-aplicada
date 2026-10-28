package cli_test

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"

	"notas-api/internal/cli"
	"notas-api/internal/domain"
	"notas-api/internal/factories"
	"notas-api/internal/service"
	"notas-api/internal/store"
)

type capturedIO struct {
	stdout bytes.Buffer
	stderr bytes.Buffer
}

type failingTaskService struct{}

func (captured *capturedIO) streams() cli.IO {
	return cli.IO{Stdout: &captured.stdout, Stderr: &captured.stderr}
}

func (failingTaskService) CreateTask(domain.CreateTaskInput) (domain.Task, error) {
	return domain.Task{}, &store.TaskStorePersistenceError{Message: "Failed to persist task store file", Cause: errors.New("IO")}
}

func (failingTaskService) ListTasks(domain.TaskListFilter) ([]domain.Task, error) {
	return []domain.Task{}, nil
}

func (failingTaskService) CompleteTask(string) (domain.Task, error) {
	return domain.Task{}, errors.New("not used")
}

func (failingTaskService) RemoveTask(string) error {
	return errors.New("not used")
}

func newTaskService() service.TaskService {
	nextID := 0

	return factories.NewTaskApp(store.NewInMemoryTaskStore(func() string {
		nextID++
		return fmt.Sprintf("%d", nextID)
	})).TaskService
}

func assertRun(t *testing.T, exitCode int, captured *capturedIO, expectedCode int, expectedStdout string, expectedStderr string) {
	t.Helper()

	if exitCode != expectedCode {
		t.Errorf("exit code: got %d, want %d", exitCode, expectedCode)
	}
	if captured.stdout.String() != expectedStdout {
		t.Errorf("stdout: got %q, want %q", captured.stdout.String(), expectedStdout)
	}
	if captured.stderr.String() != expectedStderr {
		t.Errorf("stderr: got %q, want %q", captured.stderr.String(), expectedStderr)
	}
}

func TestRunTaskCLI(t *testing.T) {
	t.Run("task create prints confirmation and exits with success", func(t *testing.T) {
		taskService := newTaskService()
		captured := &capturedIO{}

		exitCode := cli.RunTaskCLI([]string{"task", "create", "--title", "Buy milk"}, taskService, captured.streams())

		assertRun(t, exitCode, captured, 0, "Created task: 1\topen\tBuy milk\n", "")
	})

	t.Run("task list prints tasks filtered by status", func(t *testing.T) {
		taskService := newTaskService()
		captured := &capturedIO{}

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})
		taskService.CreateTask(domain.CreateTaskInput{Title: "Walk dog"})
		taskService.CompleteTask("2")

		exitCode := cli.RunTaskCLI([]string{"task", "list", "--status", "done"}, taskService, captured.streams())

		assertRun(t, exitCode, captured, 0, "2\tdone\tWalk dog\n", "")
	})

	t.Run("task complete prints confirmation and exits with success", func(t *testing.T) {
		taskService := newTaskService()
		captured := &capturedIO{}

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})

		exitCode := cli.RunTaskCLI([]string{"task", "complete", "--id", "1"}, taskService, captured.streams())

		assertRun(t, exitCode, captured, 0, "Completed task: 1\tdone\tBuy milk\n", "")
	})

	t.Run("task remove prints confirmation and exits with success", func(t *testing.T) {
		taskService := newTaskService()
		captured := &capturedIO{}

		taskService.CreateTask(domain.CreateTaskInput{Title: "Buy milk"})

		exitCode := cli.RunTaskCLI([]string{"task", "remove", "--id", "1"}, taskService, captured.streams())

		assertRun(t, exitCode, captured, 0, "Removed task: 1\n", "")
	})

	t.Run("invalid CLI input prints a readable error and exits non-zero", func(t *testing.T) {
		taskService := newTaskService()
		captured := &capturedIO{}

		exitCode := cli.RunTaskCLI([]string{"task", "list", "--status", "invalid"}, taskService, captured.streams())
		stderr := captured.stderr.String()

		if exitCode != 1 || captured.stdout.Len() != 0 {
			t.Errorf("got exit code %d and stdout %q", exitCode, captured.stdout.String())
		}
		if !strings.Contains(stderr, "Invalid option") || !strings.Contains(stderr, "task list [--status all|open|done]") {
			t.Errorf("stderr: got %q", stderr)
		}
	})

	t.Run("store persistence error prints message and exits non-zero", func(t *testing.T) {
		captured := &capturedIO{}

		exitCode := cli.RunTaskCLI([]string{"task", "create", "--title", "Buy milk"}, failingTaskService{}, captured.streams())

		assertRun(t, exitCode, captured, 1, "", "Failed to persist task store file\n")
	})
}
