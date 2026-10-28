# notas-api

Task management API in **Go**, with an HTTP interface and a CLI.

## Requirements

- **Go** 1.27 or later

## Building

```bash
go build -o bin/ ./cmd/...
```

## Running

### HTTP

```bash
bin/index
```

The server listens on `http://localhost:3000`, or on the port in `PORT`.

```bash
curl -X POST http://localhost:3000/tasks -H "content-type: application/json" -d '{"title":"Buy milk"}'
curl http://localhost:3000/tasks?status=open
curl -X PATCH http://localhost:3000/tasks/<task-id>/complete
curl -X DELETE http://localhost:3000/tasks/<task-id>
```

### CLI

```bash
bin/cli task create --title "Buy milk"
bin/cli task list --status done
bin/cli task complete --id <task-id>
bin/cli task remove --id <task-id>
```

The CLI keeps its tasks in `.tasks-cli-store.json` in the working directory, or in the file `TASK_CLI_STORE_PATH` names. The HTTP server keeps them only while it runs.

`go run ./cmd/index` and `go run ./cmd/cli` run them without a separate build, and `go run` adds its own exit status line to standard error when the CLI fails.

### Tests

```bash
go test ./...
```

`git config core.hooksPath .githooks` turns on the pre-commit guardrail, which runs `go vet` and the tests.

## Feature rules

- Every task is born `open`.
- The supported filters are `all`, `open`, and `done`.
- Completing a task that is already done is idempotent.
- Completing or removing a task that does not exist is an error.
