package main

import (
	"errors"
	"os"
	"os/exec"
)

func main() {
	command := exec.Command("go", "test", "./test/")
	command.Env = append(os.Environ(), "SOLUTION=1")
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr

	err := command.Run()

	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		os.Exit(exitError.ExitCode())
	}
	if err != nil {
		os.Exit(1)
	}
}
