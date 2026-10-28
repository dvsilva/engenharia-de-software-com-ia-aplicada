package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"notas-api/internal/domain"
)

type TaskStorePersistenceError struct {
	Message string
	Cause   error
}

func (err *TaskStorePersistenceError) Error() string {
	return err.Message
}

func (err *TaskStorePersistenceError) Unwrap() error {
	return err.Cause
}

type fileTaskStore struct {
	Tasks []domain.Task `json:"tasks"`
}

type JSONFileTaskStore struct {
	mutex      sync.Mutex
	filePath   string
	tasks      *orderedTasks
	generateID func() string
}

func NewJSONFileTaskStore(filePath string, generateID func() string) (*JSONFileTaskStore, error) {
	tasks, err := loadTasksFromFile(filePath)
	if err != nil {
		return nil, err
	}

	return &JSONFileTaskStore{filePath: filePath, tasks: tasks, generateID: idGenerator(generateID)}, nil
}

func (taskStore *JSONFileTaskStore) Create(input domain.CreateTaskInput) (domain.Task, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	task := domain.Task{ID: taskStore.generateID(), Title: input.Title, Status: domain.TaskStatusOpen}

	taskStore.tasks.set(task)

	if err := taskStore.persistTasks(); err != nil {
		return domain.Task{}, err
	}

	return task, nil
}

func (taskStore *JSONFileTaskStore) List(filter domain.TaskListFilter) []domain.Task {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	return taskStore.tasks.list(filter)
}

func (taskStore *JSONFileTaskStore) GetByID(id string) (domain.Task, bool) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	return taskStore.tasks.get(id)
}

func (taskStore *JSONFileTaskStore) Complete(id string) (domain.Task, bool, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	task, found := taskStore.tasks.complete(id)
	if !found {
		return domain.Task{}, false, nil
	}

	if err := taskStore.persistTasks(); err != nil {
		return domain.Task{}, false, err
	}

	return task, true, nil
}

func (taskStore *JSONFileTaskStore) Remove(id string) (bool, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	if !taskStore.tasks.remove(id) {
		return false, nil
	}

	if err := taskStore.persistTasks(); err != nil {
		return false, err
	}

	return true, nil
}

func (taskStore *JSONFileTaskStore) persistTasks() error {
	err := writeTasksFile(taskStore.filePath, taskStore.tasks.list(domain.TaskListFilterAll))
	if err != nil {
		return persistenceError(`Failed to persist task store file at "%s"`, taskStore.filePath, err)
	}

	return nil
}

func persistenceError(format string, filePath string, cause error) *TaskStorePersistenceError {
	return &TaskStorePersistenceError{Message: fmt.Sprintf(format, filePath), Cause: cause}
}

func fileExists(filePath string) bool {
	_, err := os.Stat(filePath)

	return err == nil
}

func loadTasksFromFile(filePath string) (*orderedTasks, error) {
	if !fileExists(filePath) {
		return newOrderedTasks(), nil
	}

	rawContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, persistenceError(`Failed to read task store file at "%s"`, filePath, err)
	}

	if strings.TrimSpace(string(rawContent)) == "" {
		return newOrderedTasks(), nil
	}

	var parsedContent any
	if err := json.Unmarshal(rawContent, &parsedContent); err != nil {
		return nil, persistenceError(`Task store file at "%s" contains invalid JSON`, filePath, err)
	}

	tasks, err := parseFileTaskStore(parsedContent)
	if err != nil {
		return nil, persistenceError(`Task store file at "%s" has an invalid structure`, filePath, err)
	}

	return newOrderedTasks(tasks...), nil
}

func parseFileTaskStore(value any) ([]domain.Task, error) {
	object, isObject := value.(map[string]any)
	if !isObject {
		return nil, &domain.ValidationError{Issues: []string{"Invalid input: expected object"}}
	}

	return domain.ParseTaskList(object["tasks"])
}

func writeTasksFile(filePath string, tasks []domain.Task) error {
	tempFilePath := fmt.Sprintf("%s.%d.%d.tmp", filePath, os.Getpid(), time.Now().UnixMilli())
	var fileContent bytes.Buffer
	encoder := json.NewEncoder(&fileContent)

	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")

	if err := encoder.Encode(fileTaskStore{Tasks: tasks}); err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return err
	}

	if err := os.WriteFile(tempFilePath, fileContent.Bytes(), 0o644); err != nil {
		return err
	}

	return os.Rename(tempFilePath, filePath)
}
