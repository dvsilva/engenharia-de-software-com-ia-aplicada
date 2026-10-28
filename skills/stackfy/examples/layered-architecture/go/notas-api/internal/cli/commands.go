package cli

import (
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"

	"notas-api/internal/domain"
	"notas-api/internal/service"
)

type IO struct {
	Stdout io.Writer
	Stderr io.Writer
}

type cliCommand interface {
	execute(taskService service.TaskService, stdout io.Writer) error
}

type createCommand struct {
	title string
}

type listCommand struct {
	status domain.TaskListFilter
}

type completeCommand struct {
	id string
}

type removeCommand struct {
	id string
}

type usageError struct {
	message string
}

func (err *usageError) Error() string {
	return err.message
}

const usage = `Usage:
  task create --title <title>
  task list [--status all|open|done]
  task complete --id <task-id>
  task remove --id <task-id>`

var commandParsers = map[string]func(args []string) (cliCommand, error){
	"create":   parseCreateCommand,
	"list":     parseListCommand,
	"complete": parseCompleteCommand,
	"remove":   parseRemoveCommand,
}

func newUsageError(format string, arguments ...any) error {
	return &usageError{message: fmt.Sprintf(format, arguments...)}
}

func writeLine(stream io.Writer, message string) {
	fmt.Fprintln(stream, message)
}

func formatTask(task domain.Task) string {
	return fmt.Sprintf("%s\t%s\t%s", task.ID, task.Status, task.Title)
}

func isMissingValue(value string) bool {
	return value == "" || strings.HasPrefix(value, "--")
}

func parseFlagValue(args []string, flagName string, commandName string) (string, error) {
	flagIndex := slices.Index(args, flagName)
	if flagIndex == -1 {
		return "", newUsageError(`Missing required flag %s for command "%s"`, flagName, commandName)
	}

	if flagIndex+1 >= len(args) || isMissingValue(args[flagIndex+1]) {
		return "", newUsageError(`Missing value for flag %s in command "%s"`, flagName, commandName)
	}

	if len(args) != flagIndex+2 {
		return "", newUsageError(`Unexpected extra arguments for command "%s"`, commandName)
	}

	return args[flagIndex+1], nil
}

func parseOptionalFlagValue(args []string, flagName string, commandName string) (string, bool, error) {
	if len(args) == 0 {
		return "", false, nil
	}

	if args[0] != flagName || len(args) != 2 {
		return "", false, newUsageError(`Invalid arguments for command "%s"`, commandName)
	}

	if isMissingValue(args[1]) {
		return "", false, newUsageError(`Missing value for flag %s in command "%s"`, flagName, commandName)
	}

	return args[1], true, nil
}

func parseCreateCommand(args []string) (cliCommand, error) {
	value, err := parseFlagValue(args, "--title", "create")
	if err != nil {
		return nil, err
	}

	title, err := domain.ParseTaskTitle(value)
	if err != nil {
		return nil, err
	}

	return createCommand{title: title}, nil
}

func parseListCommand(args []string) (cliCommand, error) {
	value, provided, err := parseOptionalFlagValue(args, "--status", "list")
	if err != nil {
		return nil, err
	}

	if !provided {
		return listCommand{status: domain.TaskListFilterAll}, nil
	}

	status, err := domain.ParseTaskListFilter(value)
	if err != nil {
		return nil, err
	}

	return listCommand{status: status}, nil
}

func parseTaskID(args []string, commandName string) (string, error) {
	value, err := parseFlagValue(args, "--id", commandName)
	if err != nil {
		return "", err
	}

	return domain.ParseTaskID(value)
}

func parseCompleteCommand(args []string) (cliCommand, error) {
	id, err := parseTaskID(args, "complete")
	if err != nil {
		return nil, err
	}

	return completeCommand{id: id}, nil
}

func parseRemoveCommand(args []string) (cliCommand, error) {
	id, err := parseTaskID(args, "remove")
	if err != nil {
		return nil, err
	}

	return removeCommand{id: id}, nil
}

func parseCliCommand(argv []string) (cliCommand, error) {
	args := argv
	if len(args) > 0 && args[0] == "task" {
		args = args[1:]
	}

	if len(args) == 0 || args[0] == "" {
		return nil, newUsageError("Missing command")
	}

	parse, known := commandParsers[args[0]]
	if !known {
		return nil, newUsageError(`Unknown command "%s"`, args[0])
	}

	return parse(args[1:])
}

func (command createCommand) execute(taskService service.TaskService, stdout io.Writer) error {
	task, err := taskService.CreateTask(domain.CreateTaskInput{Title: command.title})
	if err != nil {
		return err
	}

	writeLine(stdout, "Created task: "+formatTask(task))

	return nil
}

func (command listCommand) execute(taskService service.TaskService, stdout io.Writer) error {
	tasks, err := taskService.ListTasks(command.status)
	if err != nil {
		return err
	}

	if len(tasks) == 0 {
		writeLine(stdout, "No tasks found.")
		return nil
	}

	lines := make([]string, len(tasks))

	for index, task := range tasks {
		lines[index] = formatTask(task)
	}

	writeLine(stdout, strings.Join(lines, "\n"))

	return nil
}

func (command completeCommand) execute(taskService service.TaskService, stdout io.Writer) error {
	task, err := taskService.CompleteTask(command.id)
	if err != nil {
		return err
	}

	writeLine(stdout, "Completed task: "+formatTask(task))

	return nil
}

func (command removeCommand) execute(taskService service.TaskService, stdout io.Writer) error {
	if err := taskService.RemoveTask(command.id); err != nil {
		return err
	}

	writeLine(stdout, "Removed task: "+command.id)

	return nil
}

func isUsageMistake(err error) bool {
	_, isUsage := errors.AsType[*usageError](err)
	_, isValidation := errors.AsType[*domain.ValidationError](err)
	_, isTaskValidation := errors.AsType[*service.TaskValidationError](err)
	_, isNotFound := errors.AsType[*service.TaskNotFoundError](err)

	return isUsage || isValidation || isTaskValidation || isNotFound
}

func runCommand(argv []string, taskService service.TaskService, stdout io.Writer) error {
	command, err := parseCliCommand(argv)
	if err != nil {
		return err
	}

	return command.execute(taskService, stdout)
}

func RunTaskCLI(argv []string, taskService service.TaskService, streams IO) int {
	err := runCommand(argv, taskService, streams.Stdout)
	if err == nil {
		return 0
	}

	writeLine(streams.Stderr, err.Error())

	if isUsageMistake(err) {
		writeLine(streams.Stderr, usage)
	}

	return 1
}
