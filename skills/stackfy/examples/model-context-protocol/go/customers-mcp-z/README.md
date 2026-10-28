# Customers MCP

An MCP server in **Go** over standard input and output that offers the legacy customers REST API to agents: tools to list, find, create, update, and delete customers, the `customers://api-info` resource that describes the API, and the `find_customer_prompt` prompt, with the official **go-sdk** for the protocol and net/http for the API.

## Requirements

- **Go** 1.27 or later
- The lesson's legacy API on `http://localhost:9999/v1`, such as the one its `docker-compose.yml` starts beside **MongoDB**

## Building

```bash
go build -o bin/customers-mcp .
```

## Running

```bash
bin/customers-mcp
```

The server reads one JSON-RPC message per line on standard input, answers on standard output, writes its diagnostics to standard error, and exits when its input closes. Register it in **VS Code**'s `.vscode/mcp.json` with the binary's absolute path as the command:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "ABSOLUTE_PATH_TO_PROJECT/bin/customers-mcp"
    }
  }
}
```

The MCP Inspector connects to it the same way:

```bash
npx @modelcontextprotocol/inspector bin/customers-mcp
```

### Tests

The tests start the server with go run and call it as an MCP client, so the legacy API must be running:

```bash
go test ./tests/...
```
