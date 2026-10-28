# modulo-08-governanca-e-compliance

The RouteWise pull request governance rules in **Go**: a standalone check against the **GitHub** REST API, and a Dangerfile that **Danger JS** runs as a Danger process.

## Requirements

- **Go** 1.27 or later
- **Node.js** and npm, for **Danger JS**

## Building

```bash
go build -o bin/ ./cmd/...
npm install
```

## Running

### Standalone check

```bash
bin/danger-config-routewise --local
bin/danger-config-routewise --local --mock pr-mock-falhas.json
```

Without `--local`, it reads the pull request from the **GitHub** API and comments on it, so it needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `PR_NUMBER`. `GITHUB_API_URL` changes the API's address, as **GitHub Actions** sets it. Coverage comes from `coverage/coverage-summary.json` and `coverage/base-coverage.json`.

### Dangerfile

**Danger JS** sends the pull request to the program as JSON on standard input and reads its verdicts from standard output:

```bash
npx danger ci --text-only --failOnErrors --process bin/danger-config-template
npx danger pr https://github.com/<owner>/<repo>/pull/<number> --process bin/danger-config-template
```

In **GitHub Actions**, the step runs after the build with `GITHUB_TOKEN` in its environment, and drops `--text-only` to comment on the pull request.

`go run ./cmd/danger-config-routewise` runs the check without a separate build, and `go run` adds its own exit status line to standard error when the check fails.
