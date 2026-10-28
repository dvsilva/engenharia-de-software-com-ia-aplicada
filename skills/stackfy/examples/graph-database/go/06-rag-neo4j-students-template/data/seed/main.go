package main

import (
	"context"
	"fmt"
	"os"

	"rag-neo4j-students/data"
)

func main() {
	if err := data.SeedDatabase(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
