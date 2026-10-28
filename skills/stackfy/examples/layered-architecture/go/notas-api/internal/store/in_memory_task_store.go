package store

import (
	"slices"
	"sync"
	"uuid"

	"notas-api/internal/domain"
)

type orderedTasks struct {
	ids  []string
	byID map[string]domain.Task
}

type InMemoryTaskStore struct {
	mutex      sync.Mutex
	tasks      *orderedTasks
	generateID func() string
}

func NewInMemoryTaskStore(generateID func() string) *InMemoryTaskStore {
	return &InMemoryTaskStore{tasks: newOrderedTasks(), generateID: idGenerator(generateID)}
}

func (taskStore *InMemoryTaskStore) Create(input domain.CreateTaskInput) (domain.Task, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	task := domain.Task{ID: taskStore.generateID(), Title: input.Title, Status: domain.TaskStatusOpen}

	taskStore.tasks.set(task)

	return task, nil
}

func (taskStore *InMemoryTaskStore) List(filter domain.TaskListFilter) []domain.Task {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	return taskStore.tasks.list(filter)
}

func (taskStore *InMemoryTaskStore) GetByID(id string) (domain.Task, bool) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	return taskStore.tasks.get(id)
}

func (taskStore *InMemoryTaskStore) Complete(id string) (domain.Task, bool, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	task, found := taskStore.tasks.complete(id)

	return task, found, nil
}

func (taskStore *InMemoryTaskStore) Remove(id string) (bool, error) {
	taskStore.mutex.Lock()
	defer taskStore.mutex.Unlock()

	return taskStore.tasks.remove(id), nil
}

func generateUUID() string {
	return uuid.NewV4().String()
}

func idGenerator(generateID func() string) func() string {
	if generateID == nil {
		return generateUUID
	}

	return generateID
}

func newOrderedTasks(tasks ...domain.Task) *orderedTasks {
	ordered := &orderedTasks{byID: map[string]domain.Task{}}

	for _, task := range tasks {
		ordered.set(task)
	}

	return ordered
}

func (tasks *orderedTasks) set(task domain.Task) {
	if _, exists := tasks.byID[task.ID]; !exists {
		tasks.ids = append(tasks.ids, task.ID)
	}

	tasks.byID[task.ID] = task
}

func (tasks *orderedTasks) get(id string) (domain.Task, bool) {
	task, found := tasks.byID[id]

	return task, found
}

func (tasks *orderedTasks) list(filter domain.TaskListFilter) []domain.Task {
	listed := make([]domain.Task, 0, len(tasks.ids))

	for _, id := range tasks.ids {
		task := tasks.byID[id]

		if filter == domain.TaskListFilterAll || string(task.Status) == string(filter) {
			listed = append(listed, task)
		}
	}

	return listed
}

func (tasks *orderedTasks) complete(id string) (domain.Task, bool) {
	task, found := tasks.byID[id]
	if !found {
		return domain.Task{}, false
	}

	task.Status = domain.TaskStatusDone
	tasks.byID[id] = task

	return task, true
}

func (tasks *orderedTasks) remove(id string) bool {
	if _, found := tasks.byID[id]; !found {
		return false
	}

	delete(tasks.byID, id)
	tasks.ids = slices.DeleteFunc(tasks.ids, func(candidate string) bool { return candidate == id })

	return true
}
