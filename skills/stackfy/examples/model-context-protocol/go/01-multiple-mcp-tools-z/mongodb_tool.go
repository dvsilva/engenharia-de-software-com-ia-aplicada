package main

// https://github.com/mongodb-js/mongodb-mcp-server
func getMongoDBTool() MCPServer {
	return MCPServer{
		Name:    "MongoDB",
		Command: "npx",
		Args:    []string{"-y", "mongodb-mcp-server@latest"},
		Env: map[string]string{
			"MDB_MCP_CONNECTION_STRING": "mongodb://localhost:27017/dataprocessing",
		},
	}
}
