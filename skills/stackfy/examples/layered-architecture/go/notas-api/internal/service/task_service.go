package service

import (
	"errors"

	"notas-api/internal/domain"
	"notas-api/internal/store"
)

type TaskService interface {
	CreateTask(input domain.CreateTaskInput) (domain.Task, error)
	ListTasks(filter domain.TaskListFilter) ([]domain.Task, error)
	CompleteTask(id string) (domain.Task, error)
	RemoveTask(id string) error
}

type storeTaskService struct {
	taskStore store.TaskStore
}

func NewTaskService(taskStore store.TaskStore) TaskService {
	return storeTaskService{taskStore: taskStore}
}

func toValidationError(err error) error {
	validationError, isValidation := errors.AsType[*domain.ValidationError](err)
	if !isValidation {
		return err
	}

	return &TaskValidationError{Issues: validationError.Issues}
}

func (taskService storeTaskService) CreateTask(input domain.CreateTaskInput) (domain.Task, error) {
	title, err := domain.ParseTaskTitle(input.Title)
	if err != nil {
		return domain.Task{}, toValidationError(err)
	}

	return taskService.taskStore.Create(domain.CreateTaskInput{Title: title})
}

func (taskService storeTaskService) ListTasks(filter domain.TaskListFilter) ([]domain.Task, error) {
	parsedFilter, err := domain.ParseTaskListFilter(string(filter))
	if err != nil {
		return nil, toValidationError(err)
	}

	return taskService.taskStore.List(parsedFilter), nil
}

func (taskService storeTaskService) CompleteTask(id string) (domain.Task, error) {
	parsedID, err := domain.ParseTaskID(id)
	if err != nil {
		return domain.Task{}, toValidationError(err)
	}

	task, found, err := taskService.taskStore.Complete(parsedID)
	if err != nil {
		return domain.Task{}, err
	}

	if !found {
		return domain.Task{}, &TaskNotFoundError{TaskID: parsedID}
	}

	return task, nil
}

func (taskService storeTaskService) RemoveTask(id string) error {
	parsedID, err := domain.ParseTaskID(id)
	if err != nil {
		return toValidationError(err)
	}

	removed, err := taskService.taskStore.Remove(parsedID)
	if err != nil {
		return err
	}

	if !removed {
		return &TaskNotFoundError{TaskID: parsedID}
	}

	return nil
}
