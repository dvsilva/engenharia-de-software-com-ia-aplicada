# _alumnus

The Grafana MCP lesson's instrumented app in **Go**: a net/http server whose students endpoint leaks its pooled **PostgreSQL** connections, and which exports its traces, logs, and metrics with **OpenTelemetry** to the collector of the lesson's observability stack.

## Requirements

- **Go** 1.27 or later
- The lesson's `alumnus/infra/docker-compose-infra.yaml` running, for **PostgreSQL** on `localhost:5433` and the collector on `localhost:4317`

## Building

```bash
go build -o bin/alumnus ./src
```

## Running

```bash
bin/alumnus
```

The server listens on `PORT` (9000 by default) and reads the same variables as the original: `DATABASE_URL`, `APPNAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `NODE_ENV`, and `LOG_LEVEL`. Without `NODE_ENV`, it runs in production and requests its own endpoint every two seconds. **Grafana** on `http://localhost:3000` and its MCP server on `http://localhost:8000/mcp` then show its telemetry under the service name.
