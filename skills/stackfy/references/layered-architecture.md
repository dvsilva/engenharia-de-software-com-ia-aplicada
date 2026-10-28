---
name: layered-architecture
description: Layers that depend in one direction, from HTTP and CLI adapters to a service of business rules and a store interface with in-memory and JSON file implementations, wired by a factory and failing through domain errors.
---

# Layered architecture

## Concept

The program splits into layers that depend in one direction. Adapters, such as an HTTP handler and a CLI, call a service that holds the business rules, and the service calls a store that persists data. A domain module of types and schemas, without IO, is shared by all of them. The store is an interface with interchangeable implementations, so a factory can wire an in-memory store into the HTTP server and tests and a file store into the CLI without changing a single rule. Predictable failures are domain errors, such as a missing record or invalid input, and each adapter translates them into its own terms: a status code and a JSON body, or a message and an exit code.

## How the course implements it

The legacy API lesson of module 3 lays out its MCP server in layers. The template only creates their folders, domain, application, infrastructure, and an mcp folder with tools, resources, and prompts, empty apart from a placeholder file. In the final version, the domain holds the **zod** schemas and the types inferred from them ([schema-validation](schema-validation.md)), the infrastructure holds an HTTP client of the legacy REST API ([rest-api](rest-api.md)), and the application holds a service that delegates to it and searches the listed customers itself. Each tool, the resource, and the prompt register themselves on the server from files of their own and receive the service, so the MCP layer only translates calls ([model-context-protocol](model-context-protocol.md)). The service builds its client from the base URL, with no store interface and no domain errors, since failures are the API's own answers or thrown errors. In the API security lesson, template and final version alike, and in the publishing lesson, the client also takes the service token, and the domain holds errors for an unauthorized token, a forbidden action, and an exceeded rate limit, which the client throws for 401, 403, and 429 ([api-access-control](api-access-control.md)).

notas-api is a task manager in **TypeScript** with the four layers in their own folders plus the domain and a factory. The store interface creates, lists with a filter (all, open, or done), finds, completes, and removes tasks. Both stores generate ids through an injectable function, random UUIDs by default, and hand out copies so callers cannot change stored tasks. Every task is born open, completing a done task leaves it unchanged, and listing keeps the order tasks were created in.

The in-memory store lives as long as its process. The JSON file store reads the whole file when it is created, treats a missing or blank file as empty, and rejects a file it cannot read, invalid JSON, or an invalid structure with a persistence error that names the path. After every change it rewrites the whole file as an object with a tasks array, indented by two spaces and ending with a newline, writing a temporary file beside it first and renaming it over the original.

The service validates every input again, raises a validation error carrying the list of messages, joined by a semicolon and a space in its message, and raises a not-found error carrying the id. The factory takes a store, in memory by default, and returns the service, the store, and the HTTP handler. The HTTP server uses the default, so its tasks last while it runs, and the CLI passes a JSON file store at the path in TASK_CLI_STORE_PATH or in .tasks-cli-store.json in the working directory. Every layer has tests, 42 in all, which inject fixed or sequential ids to stay deterministic. The boundaries themselves follow [rest-api](rest-api.md), [command-line-interface](command-line-interface.md), and [schema-validation](schema-validation.md).

OpsPilot keeps the same direction on a smaller scale. Its domain holds the types and a single error, an incident that was not found, without IO. The store interface lists alerts, optionally by status, opens incidents, and resolves them, and the in-memory store keeps services, alerts, and incidents in the order they arrived and hands out copies. Every incident is born open, with an id made of inc-, the epoch in milliseconds, and four random hex digits, and records when it was created and resolved. The seed comes from a JSON file and only fills an in-memory store. The tools are the adapters that the strategies call, and the resolve tool turns the not-found error into its answer ([tool-calling](tool-calling.md)).

In unit 3, the store interface also seeds itself, lists incidents by status, reads a service's runbook, and records a summary when resolving, and the seed fills any implementation, idempotently. A SQLite store implements the same interface for the chat API and the MCP server ([sql-database](sql-database.md)), a conversation store joins it ([conversation-memory](conversation-memory.md)), and the domain gains errors for a missing runbook, an unknown strategy, a timed-out chat, and an unknown conversation, which the tools and the HTTP layer translate ([rest-api](rest-api.md)). The tools now serve two adapters, the agent and the MCP server ([model-context-protocol](model-context-protocol.md)).

Unit 4 adds two interfaces to the domain, a memory store that remembers, recalls, and forgets, and an embedder that turns text into a vector, with a SQLite memory store, a local model, and a fake embedder for tests behind them ([semantic-memory](semantic-memory.md), [text-embeddings](text-embeddings.md)). The domain gains errors for a failed embedding and for a blank memory input, which the HTTP layer translates.

Unit 5 lets the conversation store count a conversation's messages, read them from an offset, and keep its summary, and assembles every prompt in a pure function that receives what the stores loaded and does no I/O of its own ([context-management](context-management.md)).

Unit 6 adds interfaces for a request store, an approval store, and a logger to the domain, with a SQLite request store, an in-memory approval store, and a JSON logger behind them ([agent-observability](agent-observability.md)), and the chat route hands each turn to the production graph instead of choosing a strategy itself ([state-graph](state-graph.md)).

cfp-platform's api, in the UI/UX module, splits the same way through **NestJS**'s dependency injection. One module registers a controller and an injectable service for the greeting, the speakers, and the events, and each controller receives its service in its constructor and only translates HTTP into calls ([rest-api](rest-api.md)). Each service keeps its objects in an array, in the order they arrived, without a store interface or domain errors, and the types come from the library the frontend shares ([full-stack-monorepo](full-stack-monorepo.md)).

## What usually goes wrong in other languages

- Listing keeps creation order, and completing a task keeps its place. **Python** dictionaries keep that order like **JavaScript** maps do, while **Go** maps and the hash maps of **Rust**, **Java**, **C#**, and **C++** do not guarantee it, so those keep a list beside the index or use an ordered map.
- Stores hand out copies. **Python** dictionaries and the objects of **Java** and **C#** are references, so returning the stored one lets callers change the store, while **Go** structs and **Rust** values copy on their own.
- A **Python** default argument is evaluated once, so a factory that builds its default store in the signature shares one store across every app. Defaulting to none and building the store inside avoids it.
- Domain errors become exceptions in **Python**, **Java**, and **C#**, error values checked with errors.As in **Go**, and an error enum in **Rust**. Adapters map them by type, so a generic error with a message is not enough.
- Renaming the temporary file must replace the target. **Python** uses os.replace, because os.rename fails on **Windows** when the target exists, **Java** moves with the replace option, and **C#** moves with overwrite. The temporary file stays in the target's folder so the rename never crosses file systems.
- The folder of a bare file name is the working directory. **Python**'s dirname returns an empty string there, which makedirs rejects, so the transcription falls back to the current folder.
- The file keeps non-ASCII titles as they are, while **Python**'s json module escapes them unless told otherwise.
- **Python** cannot name a package http while its folder is on the import path, because it hides the standard library's http package, and a cli package collides with the cli entry script, so a **Python** transcription calls them api and console. In **Go**, a package named http shadows net/http inside it, and one named mcp shadows the SDK's, so the tested transcriptions call them httpapi and mcpserver.
- **unittest** discovers tests only in folders with an init file, so every **Python** package in the transcription has one.
- **NestJS** creates each service once per application, so cfp-platform's arrays last as long as the process. A framework that builds dependencies per request, as **FastAPI**'s Depends does and **ASP.NET Core**'s scoped services do, needs the store registered once, such as a singleton.

## How close common targets get

| Target                            | Fit               | Library                                                                                 |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | Protocols for the interfaces, TypedDict tasks, the json module, and **unittest**        |
| **JavaScript** and **TypeScript** | Direct equivalent | Interfaces, classes, node:fs, and node:test                                             |
| **Go**                            | Direct equivalent | Interfaces, a slice beside a map behind a mutex, encoding/json, and the testing package |
| **Rust**                          | Direct equivalent | Traits, an error enum, **indexmap**, **serde_json**, and cargo test                     |
| **C#**                            | Direct equivalent | Interfaces, records, a list beside a dictionary, System.Text.Json, and **xUnit**        |
| **Java**                          | Direct equivalent | Interfaces, records, LinkedHashMap, **Jackson**, and **JUnit**                          |
| **C++**                           | Direct equivalent | Abstract classes, a vector beside a map, **nlohmann/json**, and **GoogleTest**          |

A tested **Go** transcription of notas-api covers the whole module, from the harness to the tests, a tested **Python** transcription of OpsPilot sits with the reasoning-strategies examples, and a tested **Go** transcription of the legacy API lesson's MCP server, in the same layers, sits with the model-context-protocol examples.

## Tolerance

Generated ids are random, so the cases check their format, a lowercase version 4 UUID, and compare later responses with the id the program returned. Everything else is deterministic and compared exactly, and the CLI cases seed the store with known ids. OpsPilot's incident ids are random too, so its cases accept any id of that shape, and so do cfp-platform's, up to seven lowercase letters and digits.

## Where it appears

- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-template (the folders, still empty)
- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/customers-mcp-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/customers-mcp-z
- modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z
- modulo04-criacao-de-agentes-autonomos-novo/01-arquitetura-de-agentes-de-codigo/notas-api
- modulo04-criacao-de-agentes-autonomos-novo/02-padroes-de-raciocinio-e-execucao
- modulo04-criacao-de-agentes-autonomos-novo/03-function-calling-e-tool-use
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-03/cfp-platform (the api)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1 (the same api)
