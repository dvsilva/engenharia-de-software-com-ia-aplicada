# Customers MCP

An MCP server in **Python** over standard input and output that offers the secured customers REST API to agents: tools to list, find, create, update, and delete customers, the `customers://api-info` resource that describes the API, and the `find_customer_prompt` prompt. It uses the official **mcp** SDK's low-level server, so every schema is written as the original declares it, **jsonschema** to check arguments and results against those schemas, and urllib.request to call the API with the service token as a bearer.

## Requirements

- **Python** 3.12 or later
- The customers API on `http://localhost:9999/v1`, such as the one the lesson's `docker-compose.yml` starts beside **MongoDB**
- A service token for that API in `SERVICE_TOKEN`

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mypy
```

## Running

```bash
SERVICE_TOKEN=<token> python src/index.py
```

The server reads one JSON-RPC message per line on standard input, answers on standard output, writes its diagnostics to standard error, and exits when its input closes. Without `SERVICE_TOKEN`, it prints its error and exits with code 1. Once the API secures its routes, a refused token, a role that may not write, and a spent rate limit come back from every tool as a structured error that names them. Register it in **VS Code**'s `.vscode/mcp.json` with the interpreter of the virtual environment and the entry point's absolute path:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "ABSOLUTE_PATH_TO_PROJECT/.venv/bin/python",
      "args": ["ABSOLUTE_PATH_TO_PROJECT/src/index.py"],
      "env": {
        "SERVICE_TOKEN": "<token>"
      }
    }
  }
}
```

The MCP Inspector connects to it the same way:

```bash
SERVICE_TOKEN=<token> npx @modelcontextprotocol/inspector .venv/bin/python src/index.py
```
