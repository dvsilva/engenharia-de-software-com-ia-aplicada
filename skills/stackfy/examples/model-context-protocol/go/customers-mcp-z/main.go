package main

import (
	"context"
	"fmt"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"customers-mcp/internal/mcpserver"
)

func run() error {
	session, err := mcpserver.NewServer().Connect(context.Background(), &mcp.StdioTransport{}, nil)
	if err != nil {
		return err
	}

	fmt.Fprintln(os.Stderr, "Customers MCP Server running on stdio")

	return session.Wait()
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Fatal error in main():", err)
		os.Exit(1)
	}
}
