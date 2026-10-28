package service

import (
	"fmt"
	"strings"
)

type TaskNotFoundError struct {
	TaskID string
}

func (err *TaskNotFoundError) Error() string {
	return fmt.Sprintf(`Task "%s" was not found`, err.TaskID)
}

type TaskValidationError struct {
	Issues []string
}

func (err *TaskValidationError) Error() string {
	return strings.Join(err.Issues, "; ")
}
