# Copilot Instructions

## Stack

- **Go** 1.27 or later.
- Static typing checked by the compiler and `go vet`.
- Parse functions at the boundary (HTTP and CLI) to validate input, with **encoding/json** and checks written by hand.
- Tests with the standard library's testing package.
- No HTTP framework: **net/http** by design.

## Commands

- `dev`: `go run ./cmd/index`, the API at `http://localhost:3000`.
- `cli`: `go run ./cmd/cli`.
- `test`: `go test ./...`.
- `vet`: `go vet ./...`.

## Structure

- `internal/domain`: types and parse functions, without IO.
- `internal/store`: persistence behind an interface.
- `internal/service`: business rules.
- `internal/httpapi`: HTTP adapter.
- `internal/cli` and `cmd/cli`: CLI entry.
- `cmd/index`: HTTP entry.
- `specs/`: spec-driven artifacts.

## Conventions

- Layers never skip: `httpapi/cli -> service -> store`.
- Every external input goes through a parse function.
- Domain errors are error types translated at the edge.
- New logic is born with a test.
- `go vet` and the tests always pass.
- Never commit secrets and never read `.env`.

## Workflow

- `/especificar -> /planejar -> /tarefas -> /implementar`.
- Human review between phases.
- Artifacts in `specs/`.
