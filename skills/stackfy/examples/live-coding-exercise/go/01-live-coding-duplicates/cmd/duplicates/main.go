package main

import (
	"encoding/json"
	"fmt"
	"os"

	"live-coding-duplicates/solution"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: duplicates <JSON array of integers>")
		os.Exit(64)
	}

	var numbers []int
	if err := json.Unmarshal([]byte(os.Args[1]), &numbers); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(64)
	}

	json.NewEncoder(os.Stdout).Encode(solution.Duplicates(numbers))
}
