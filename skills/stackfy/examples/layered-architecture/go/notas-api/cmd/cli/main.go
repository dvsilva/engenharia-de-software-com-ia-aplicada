package main

import (
	"fmt"
	"os"
	"path/filepath"

	"notas-api/internal/cli"
	"notas-api/internal/factories"
	"notas-api/internal/store"
)

const defaultStoreFile = ".tasks-cli-store.json"

func main() {
	os.Exit(run())
}

func cliStorePath() string {
	if storePath, isSet := os.LookupEnv("TASK_CLI_STORE_PATH"); isSet {
		return storePath
	}

	workingDirectory, err := os.Getwd()
	if err != nil {
		return defaultStoreFile
	}

	return filepath.Join(workingDirectory, defaultStoreFile)
}

func run() int {
	taskStore, err := store.NewJSONFileTaskStore(cliStorePath(), nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	taskService := factories.NewTaskApp(taskStore).TaskService

	return cli.RunTaskCLI(os.Args[1:], taskService, cli.IO{Stdout: os.Stdout, Stderr: os.Stderr})
}
