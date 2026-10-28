package main

import "os"

func getFSTool() MCPServer {
	workingDirectory, _ := os.Getwd()

	return MCPServer{
		Name:    "filesystem",
		Command: "npx",
		Args:    []string{"-y", "@modelcontextprotocol/server-filesystem", workingDirectory},
	}
}
