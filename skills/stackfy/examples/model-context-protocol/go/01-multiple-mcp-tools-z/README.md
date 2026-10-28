# Multiple MCP tools

A data processing agent in **Go** that extracts the intent of a question about a CSV file, then answers it with the tools of two MCP servers, **MongoDB** and the filesystem, plus a CSV to JSON tool of its own, through **OpenRouter**.

## Requirements

- **Go** 1.27 or later
- **Node.js**, whose npx starts both MCP servers
- **MongoDB** on `localhost:27017`, such as the one the lesson's `docker-compose.yaml` starts
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
go build -o bin/multiple-mcp-tools .
```

## Running

```bash
bin/multiple-mcp-tools
```

The program listens on `http://0.0.0.0:3000`, sends its own route the total revenue question with `data/sales-complete.csv`, prints the answer, and exits. `OPENAI_BASE_URL` points the model calls to another OpenAI-compatible server.
