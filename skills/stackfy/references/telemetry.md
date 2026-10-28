---
name: telemetry
description: Making a running service explain its own behavior through traces, logs, and metrics that share a trace id, exported with OpenTelemetry to a collector that feeds Tempo, Loki, and Prometheus, which Grafana and its MCP server let an assistant query, as the Grafana MCP lesson of module 1 does with a Fastify app.
---

# Telemetry

## Concept

Telemetry is what a running service emits so that questions about its behavior can be answered without changing its code. A trace follows one request as a tree of spans, each with a name, a duration, a status, attributes such as the route, and events such as a recorded exception. A log is a record with a severity and a body, stamped with the trace and span ids of the work that wrote it, so a log line leads to its trace. A metric aggregates many requests, such as a histogram of request durations per route and status code. Every signal carries resource attributes, above all service.name, which every backend uses to tell services apart.

**OpenTelemetry** standardizes all of this: an API, an SDK per language, semantic conventions that name spans and attributes the same everywhere (a server span is named after the method and the route, as in GET /students), and OTLP, the protocol that exports the three signals over gRPC or HTTP. Instrumentation libraries wrap the HTTP server, the web framework, the database driver, and the logger, so most telemetry needs no code. Services export to a collector, which batches each signal and routes it to its backend: **Tempo** for traces, **Loki** for logs, and **Prometheus** for metrics. **Grafana** queries all three and links them by trace id, and an MCP server in front of **Grafana** ([model-context-protocol](model-context-protocol.md)) lets an assistant run the same queries and correlate the signals to find the cause of an incident.

## How the course implements it

The Grafana MCP lesson of module 1 keeps an instrumented app in alumnus/_alumnus and the stack around it in alumnus. The app is **Fastify** 5 ([rest-api](rest-api.md)) in **TypeScript**, run with **Node.js**'s type stripping as node --experimental-strip-types src/index.ts. **env-var** reads its configuration: PORT (9000), DATABASE_URL, APPNAME, OTEL_EXPORTER_OTLP_ENDPOINT (http://localhost:4317), NODE_ENV (production), and LOG_LEVEL (info). The default database and service name both end in the same four random hex characters, as in alumnus_app_17a4, so every start gets a fresh database ([sql-database](sql-database.md)) and a new service name.

Before building the app, initServer starts the **OpenTelemetry** Node SDK 0.208 with APPNAME as service.name and OTLP gRPC exporters for traces, metrics, and logs, which read the endpoint from the environment. Metrics are exported every 3 seconds, spans in batches every 5 seconds, and logs in batches. The instrumentations are the auto-instrumentations bundle with its **Fastify** and **Knex** instrumentations turned off, **@fastify/otel**, which registers on every **Fastify** instance, and the **Knex** instrumentation. The bundle also brings the HTTP server and client, the pg driver, the runtime metrics, and the pino logger, whose instrumentation adds trace_id and span_id to every line **Fastify** logs on standard output and sends each record as an OTLP log with the message as its body and the error's fields as attributes. The SDK's diagnostics print only errors.

The db-leaky-connections scenario reproduces a production bug for the telemetry to reveal. Its pg pool allows two connections and waits at most one second for one. GET /students/db-leaky-connections logs Processing student query request, takes a connection, runs SELECT \* FROM students LIMIT 1, and answers 200 with the students and Students retrieved successfully, without ever releasing the connection. The third request therefore waits a second and fails: the handler records the exception on the active span, sets its status to error, logs Error processing request at error level with the error, and answers 500 with Internal Server Error and Failed to retrieve students data. POST /students/db-leaky-connections/reset releases every leaked connection and answers how many it cleaned and how many remain. GET /health logs a line and answers ok. In production, the default, the app also requests its own endpoint every two seconds and logs each answer, so after two successes every request fails with no outside traffic, which is what the lesson investigates. The scenario follows a BaseScenario class with init, registerRoutes, and terminate, and closing the app terminates it, closes the database, and shuts the SDK down.

alumnus/infra/docker-compose-infra.yaml runs the stack, started by npm run docker:infra:up in the wrapper:

- **PostgreSQL** 16 on port 5433.
- The **OpenTelemetry Collector** 0.140, receiving OTLP over gRPC on port 4317, batching, and sending traces to **Tempo** over OTLP, logs to **Loki**'s OTLP endpoint, and metrics to a **Prometheus** exporter on port 8889, which names the job after the service.
- **Prometheus** 3.7 on port 9090, scraping every 5 seconds the collector, whose job label it keeps as exported_job, as well as **Tempo**, **Loki**, **Grafana**, and the **Blackbox Exporter**'s probes of every service, with alert rules for services down, error rates, and latency.
- **Loki** 3.5 on port 3100, and **Tempo** on port 3200 with its own MCP server and a metrics generator that writes service graphs and span metrics to **Prometheus**.
- **Grafana** 12.1 on port 3000 with anonymous admin access, provisioned with the prometheus, tempo, and loki datasources, links from traces to logs and from log trace ids to traces, two dashboards, and alert rules.
- The **Grafana** MCP server, mcp/grafana, over streamable HTTP on port 8000, which offers tools such as query_prometheus, query_loki_logs, and **Tempo**'s tempo_traceql-search through **Grafana**.

Data persists under infra/storage, which **Git** ignores. The wrapper's README registers the MCP server for **Windsurf** ([coding-agent-harness](coding-agent-harness.md)), and its docs hold the prompts that ask an assistant to correlate the 500s in **Prometheus**, the error logs and stack traces in **Loki**, and the error traces in **Tempo** into a root cause with its file and line. _alumnus/empty/telemetry-diagnosis-report.md is such a report, which points to main.ts:52, where the connection is taken. The app's end-to-end test starts the server in-process on a random port and service name, expects two successes and a failure, then polls **Loki** by service_name, **Tempo**'s search by service.name, and **Prometheus** for http_client_request_duration_seconds_count by exported_job, the client metric of the test's own fetch calls.

## What usually goes wrong in other languages

- The original imports **Fastify**, and with it node:http, before starting the SDK, so the HTTP instrumentation only takes effect when the gRPC exporter first loads node:http, about 3 seconds after startup. Requests before that have only **Fastify**'s spans, with a root named request, and no HTTP metrics. A transcription starts the SDK before loading its web framework, as **Python**'s opentelemetry-instrument and **Java**'s agent do, and the telemetry case waits for the app's first metrics in **Prometheus** before its requests.
- **Node.js**'s HTTP instrumentation still emits the older semantic conventions: http.server.duration in milliseconds, which **Prometheus** shows as http_server_duration_milliseconds with http_status_code. **Go**'s otelhttp and newer SDKs emit http.server.request.duration in seconds with http_response_status_code, and **Python**'s switches only with OTEL_SEMCONV_STABILITY_OPT_IN=http.
- The cases find the failed request by its route, so every server span and duration metric carries http.route, and the server span is named after the method and the route. **Go**'s otelhttp 0.72 names the span after the route the ServeMux matched and puts http.route on the metrics, but not on the span, so a transcription adds it from the request's pattern once the mux has run.
- The error log's body is exactly Error processing request, at severity number 17 (error), with the error in attributes. pino's instrumentation names them err_message, err_stack, and err_type, **Python**'s logging handler names them exception.message, exception.stacktrace, and exception.type, and severity texts differ in case, so the cases check only the body, the severity number, the service name, and the trace id.
- The log must be written inside the request's span, or it carries no trace id and the step from **Loki** to **Tempo** breaks. **Python**'s context variables carry the span through asyncio, while **Go** passes the request's context to the logger, as slog's ErrorContext does through the otelslog bridge.
- The collector's **Prometheus** exporter puts service.namespace before service.name in the job label, so a transcription that sets a namespace changes exported_job and the queries miss it.
- In production the self-requests go through fetch, whose instrumentation makes a client span the root of each trace, named GET. A transcription whose HTTP client is not instrumented starts those traces at the server span, so the cases search **Tempo** by the span's route and error status instead of the root's name.
- OTEL_EXPORTER_OTLP_ENDPOINT holds an http address for plain-text gRPC. Some SDKs infer the missing TLS from the scheme, and others, such as **Rust**'s tonic exporter or older **Python** releases, need insecure set explicitly.
- The original has no signal handler, so the runner's SIGTERM ends it without flushing the batches. The cases read every backend while the app still runs.
- The cases bring the compose file up with **Docker Compose**'s !override and !reset tags, which need version 2.24.4 or later, to give the containers names and ports of their own and leave out the storage mounts, so every run starts without telemetry from earlier runs.

## How close common targets get

| Target                            | Fit               | Library                                                                                                                 |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **opentelemetry-sdk** with the OTLP gRPC exporter and the **FastAPI**, psycopg, and logging instrumentations            |
| **JavaScript** and **TypeScript** | Direct equivalent | **@opentelemetry/sdk-node** with the OTLP gRPC exporters and **@opentelemetry/auto-instrumentations-node**              |
| **Go**                            | Direct equivalent | **go.opentelemetry.io/otel** with the otlptracegrpc, otlpmetricgrpc, and otlploggrpc exporters, otelhttp, and otelslog  |
| **Rust**                          | Direct equivalent | **opentelemetry** with **opentelemetry-otlp** over tonic and **tracing-opentelemetry**, with HTTP spans written by hand |
| **C#**                            | Direct equivalent | **OpenTelemetry** for .NET with the OTLP exporter and the ASP.NET Core and Npgsql instrumentations                      |
| **Java**                          | Direct equivalent | The **OpenTelemetry** Java agent, which instruments the HTTP server, JDBC, and the logger without code                  |
| **C++**                           | Direct equivalent | **opentelemetry-cpp** with its OTLP gRPC exporters, with every span, log, and metric written by hand                    |

The collector, **Tempo**, **Loki**, **Prometheus**, **Grafana**, and the MCP server are the same containers for every target, so only the app changes. The tested **Go** transcription of _alumnus, kept with the telemetry examples, serves net/http through otelhttp, leaks connections from a pgxpool of two, adds the Go runtime metrics, and logs through slog to standard output and the otelslog bridge at once, and it passes the cases of both modules with the stable semantic conventions.

## Tolerance

Telemetry reaches the backends seconds after the request, so the cases repeat each query until it shows what the app sent, for up to two minutes, and then check it. Trace ids and timestamps vary, so they are checked by shape. Durations are not compared, so the pool's one-second wait shows only as the 500 it ends in. The count of 500s on the route is exact, and the metric name may follow either generation of the semantic conventions.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus (the stack, the Grafana MCP server, and the prompts)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/_alumnus (the instrumented app)
