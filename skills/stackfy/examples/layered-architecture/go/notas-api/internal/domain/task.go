package domain

import (
	"fmt"
	"slices"
	"strings"
)

type TaskStatus string

const (
	TaskStatusOpen TaskStatus = "open"
	TaskStatusDone TaskStatus = "done"
)

type TaskListFilter string

const (
	TaskListFilterAll  TaskListFilter = "all"
	TaskListFilterOpen TaskListFilter = "open"
	TaskListFilterDone TaskListFilter = "done"
)

type CreateTaskInput struct {
	Title string `json:"title"`
}

type Task struct {
	ID     string     `json:"id"`
	Title  string     `json:"title"`
	Status TaskStatus `json:"status"`
}

type ValidationError struct {
	Issues []string
}

func (err *ValidationError) Error() string {
	return strings.Join(err.Issues, "; ")
}

func ParseTaskID(value any) (string, error) {
	return parseRequiredText(value, "Task id is required")
}

func ParseTaskTitle(value any) (string, error) {
	return parseRequiredText(value, "Task title is required")
}

func ParseTaskStatus(value any) (TaskStatus, error) {
	return parseOption(value, TaskStatusOpen, TaskStatusDone)
}

func ParseTaskListFilter(value any) (TaskListFilter, error) {
	return parseOption(value, TaskListFilterAll, TaskListFilterOpen, TaskListFilterDone)
}

func ParseCreateTaskInput(value any) (CreateTaskInput, error) {
	object, err := parseObject(value)
	if err != nil {
		return CreateTaskInput{}, err
	}

	title, err := ParseTaskTitle(object["title"])
	if err != nil {
		return CreateTaskInput{}, err
	}

	return CreateTaskInput{Title: title}, nil
}

func ParseTask(value any) (Task, error) {
	object, err := parseObject(value)
	if err != nil {
		return Task{}, err
	}

	id, idErr := ParseTaskID(object["id"])
	title, titleErr := ParseTaskTitle(object["title"])
	status, statusErr := ParseTaskStatus(object["status"])

	if err := joinIssues(idErr, titleErr, statusErr); err != nil {
		return Task{}, err
	}

	return Task{ID: id, Title: title, Status: status}, nil
}

func ParseTaskList(value any) ([]Task, error) {
	items, isList := value.([]any)
	if !isList {
		return nil, invalid("Invalid input: expected array")
	}

	tasks := make([]Task, 0, len(items))

	for _, item := range items {
		task, err := ParseTask(item)
		if err != nil {
			return nil, err
		}

		tasks = append(tasks, task)
	}

	return tasks, nil
}

func invalid(issue string) *ValidationError {
	return &ValidationError{Issues: []string{issue}}
}

func parseRequiredText(value any, requiredMessage string) (string, error) {
	text, isText := value.(string)
	if !isText {
		return "", invalid("Invalid input: expected string")
	}

	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", invalid(requiredMessage)
	}

	return trimmed, nil
}

func parseOption[Option ~string](value any, options ...Option) (Option, error) {
	text, isText := value.(string)
	if isText && slices.Contains(options, Option(text)) {
		return Option(text), nil
	}

	quotedOptions := make([]string, len(options))

	for index, option := range options {
		quotedOptions[index] = fmt.Sprintf("%q", option)
	}

	return "", invalid("Invalid option: expected one of " + strings.Join(quotedOptions, "|"))
}

func parseObject(value any) (map[string]any, error) {
	object, isObject := value.(map[string]any)
	if !isObject {
		return nil, invalid("Invalid input: expected object")
	}

	return object, nil
}

func joinIssues(errs ...error) error {
	var issues []string

	for _, err := range errs {
		if validationError, isValidation := err.(*ValidationError); isValidation {
			issues = append(issues, validationError.Issues...)
		}
	}

	if len(issues) == 0 {
		return nil
	}

	return &ValidationError{Issues: issues}
}
