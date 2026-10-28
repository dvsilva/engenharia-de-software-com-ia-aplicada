package store

import "notas-api/internal/domain"

type TaskStore interface {
	Create(input domain.CreateTaskInput) (domain.Task, error)
	List(filter domain.TaskListFilter) []domain.Task
	GetByID(id string) (domain.Task, bool)
	Complete(id string) (domain.Task, bool, error)
	Remove(id string) (bool, error)
}
