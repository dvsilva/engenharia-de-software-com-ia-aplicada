---
name: sql-database
description: Persisting a program's data in a SQL database, from tables with constraints created idempotently to prepared statements and seeds that survive restarts, as OpsPilot does with SQLite through node:sqlite, the Better Auth demo through better-sqlite3 and a schema migration, the song highlights lesson through knex, and the Grafana MCP lesson through knex and a pg pool on PostgreSQL.
---

# SQL database

## Concept

A SQL database keeps data beyond a process and lets several processes share it. The schema is a set of tables with primary keys and constraints, such as CHECK clauses that limit a column to known values, created idempotently when the program starts so a new and an existing database both work. Every query is a prepared statement with parameters, never text built from input. An embedded database such as SQLite runs inside the process on a single file, or entirely in memory for tests, so it needs no server and still offers the same SQL. A server database such as **PostgreSQL** is shared over the network instead, and a pool caps how many connections a process holds, so every connection taken from it must go back.

## How the course implements it

From unit 3, OpsPilot's store has a SQLite implementation beside the in-memory one, built on node:sqlite, the synchronous driver that ships with **Node.js** 22, behind the same store interface ([layered-architecture](layered-architecture.md)). It opens the path in OPSPILOT_DB, or data/opspilot.db under the working directory, creating the folder first, and ":memory:" in tests. On every start it creates, if missing, four tables:

- services, keyed by name, with a tier of critical, high, or standard.
- alerts, keyed by id, with the service, the description, a severity of critical, high, medium, or low, and a status of firing or resolved.
- incidents, keyed by id, with the title, the service, the severity, a status of open or resolved, the creation time and the resolution time in epoch milliseconds, and an optional summary.
- runbooks, keyed by service, with the content.

Every statement is prepared once. Seeding inserts with INSERT OR IGNORE, so a restart keeps the incidents and never duplicates the seed. Alerts come back in insertion order and incidents by creation time, resolving an unknown incident or reading a missing runbook raises the domain errors the tools turn into text ([tool-calling](tool-calling.md)), and resolving sets the status, the resolution time, and the summary. The conversation store opens a second connection to the same file with tables of its own ([conversation-memory](conversation-memory.md)), to which unit 5 adds one with a summary per conversation ([context-management](context-management.md)), and from unit 4 the memory store opens a third, whose memories table keeps each embedding as a BLOB of 32-bit floats ([semantic-memory](semantic-memory.md)). Unit 6 opens a fourth for the audit ([agent-observability](agent-observability.md)): requests, keyed by the request id, with the creation and finish times in epoch milliseconds, a status of success or error, the HTTP status, the conversation, the user, the metrics as JSON text, and the latency, LLM calls, route, and model repeated as columns, and trace_events, one row per event with its own UUID, the request id as a foreign key, its position from zero, unique per request, the type, the node, the content, and the event's other fields as JSON text or null. A turn's request and its events are inserted in one transaction. The chat API and the MCP server ([model-context-protocol](model-context-protocol.md)) use the database, so an incident one of them opens is visible to the other, while the arena and the bench keep a fresh in-memory store for every run. Unit tests run on ":memory:" and check that the constraints reject unknown severities and statuses.

The Context7 lesson of module 1's nextjs-better-auth-demo hands **Better Auth** a **better-sqlite3** connection to ./better-auth.sqlite, under the working directory, which **Better Auth** queries through **Kysely** ([user-authentication](user-authentication.md)). The application never creates its tables: npx @better-auth/cli migrate reads lib/auth.ts, compares the database with what **Better Auth** needs, and creates whatever is missing, so running it again changes nothing. It creates four tables, with quoted camelCase columns and text ids:

- user, with the name, a unique email, emailVerified as an integer, an optional image, and the creation and update times.
- session, with the expiry, a unique token, the times, the IP address, the user agent, and the userId.
- account, with the provider's account id, the providerId, the userId, the tokens and their expiries, the scopes, a password for email sign-in, and the times.
- verification, with an identifier, a value, the expiry, and the times.

session and account reference user and are deleted with it, and session.userId, account.userId, and verification.identifier have indexes. Dates are stored as ISO 8601 text and booleans as 0 or 1.

The song highlights lesson of module 2 ships a preferences service on the **knex** 3 query builder over **better-sqlite3** 11, which opens the path it receives without a file: prefix, and also declares **@libsql/client** without importing it. Before its first query, the service creates a user_preferences table when missing, with an auto-increment id, a unique user_id, the name, the age as an integer, the favorite genres and bands as JSON text, the key preferences and important context as text, and an update time that defaults to the current one. Every write is an upsert by user_id that also sets the update time. Merging preferences adds the new genres and bands after the stored ones without repeating any, keeps the stored name and age unless new ones arrive, keeps the stored key preferences, and appends Mood: with the mood, Context: with the listening context, and the other information to the stored context, joined by a period and a space. Storing a summary replaces every field with the summary's, so the genres a merge just added become empty when the summary leaves them out. The basic information is one line per known field, Nome:, Idade:, Gêneros Favoritos:, and Artistas/Bandas Favoritas:, with the lists joined by a comma and a space, then a blank line and Preferências: with the key preferences, or nothing at all for an unknown user. In the template, nothing imports the service. In the final version, the chat reads ./preferences.db, relative to the working directory, which the lesson ships with Ana's preferences, and its graph's nodes merge and summarize into it ([state-graph](state-graph.md)), while its end-to-end test uses test-preferences.db and deletes it before and after.

The Grafana MCP lesson of module 1 keeps the alumnus app's data in **PostgreSQL** 16, which its compose file runs in **Docker** ([telemetry](telemetry.md)). At startup the app connects through **knex** 3 and the pg driver to the server's postgres database, creates the database named in DATABASE_URL when pg_database lacks it, then connects to that database and runs SELECT 1. Seeding drops courses and then students, creates courses with an auto-increment id and a name and students with an auto-increment id, a name, and a courseId whose foreign key, fk_fkey_courses, references courses.id, and inserts the courses Node.js Streams and JavaScript Expert and the student Nightcrawler of course 1. The leaky scenario opens a pg pool of its own, of at most two connections, each awaited for at most one second and closed after 30 idle seconds, and runs SELECT \* FROM students LIMIT 1 on a connection it never releases, so the third request fails with pg-pool's timeout exceeded when trying to connect ([rest-api](rest-api.md)). The helpers also hold a joined query and an N+1 query of the students with their course names, which no route uses, and a drop of the database, which the end-to-end test calls.

## What usually goes wrong in other languages

- **Python**'s sqlite3 opens a transaction before every write and keeps it until a commit, so writes stay invisible to the other connection and vanish when the process ends. node:sqlite commits every statement, which autocommit mode in **Python** 3.12, or an isolation level of none before it, reproduces.
- ":memory:" gives every connection its own empty database, in every driver, so the ops store and the conversation store never share data in tests.
- **Python**'s sqlite3 refuses a connection used from another thread, which happens under a threading HTTP server or when an SDK runs synchronous tools in worker threads. Such a transcription opens the connection with the same-thread check off and serializes the statements.
- A query without ORDER BY returns SQLite's rowid order, which other databases do not promise. Transcriptions on another database order alerts by insertion explicitly.
- INSERT OR IGNORE is SQLite's spelling, and **PostgreSQL** and newer SQLite write ON CONFLICT DO NOTHING. Either keeps the seed idempotent.
- The default path is relative to the working directory, not to the program, and its folder may not exist. The cases start without data/opspilot.db and require a SQLite file there afterwards.
- **Python**'s sqlite3 returns tuples unless the row factory is set, and **Go**'s database/sql scans columns positionally, so mapping rows by column name is explicit in both.
- **Go**'s best-known driver needs cgo, and the pure **Go** one avoids a C compiler.
- nextjs-better-auth-demo answers 500 with no such table: verification to the first sign-in until the migration runs, so its cases start without better-auth.sqlite, run the migration before the server, and require a SQLite file there afterwards. A transcription creates the same tables, through a migration step or idempotently at startup.
- **knex** writes the song highlights upsert as INSERT ... ON CONFLICT (user_id) DO UPDATE, which **PostgreSQL** and SQLite 3.24 or later accept. Its merge treats an age of 0 and empty text as missing, because the original falls back with a logical or.
- The song highlights cases seed preferences.db as a SQLite file in **knex**'s schema, with the lists as JSON text, so a transcription keeps that table, its columns, and the unique index on user_id, and reads the file as it is. A driver that binds a JSON value as a parameter, such as **rusqlite** with its serde_json feature, writes text in quotes, so the values go in as plain text and numbers.
- The alumnus seed drops courses before students, which still references it, so a second start on the same database fails with cannot drop table courses because other objects depend on it. The default DATABASE_URL avoids it with a new database on every start, and the cases give each case a database of its own, which the app must create when it is missing.
- **knex** quotes the camelCase column, so the students come back with courseId. **PostgreSQL** folds unquoted names to lowercase, so a transcription that writes the DDL itself quotes "courseId", or its JSON answers courseid.
- The leak depends on the pool's limits: two connections, a wait of one second for a free one, and nothing returned. **Python**'s psycopg_pool takes max_size and timeout, **Go**'s pgxpool takes MaxConns with a one-second deadline on Acquire, **HikariCP** takes maximumPoolSize and connectionTimeout, and **Npgsql** takes Maximum Pool Size and Timeout. A pool that grows past two or waits longer moves the 500 to another request.
- **better-sqlite3** is a native addon. Neither version the course pins, 11.10 in the song highlights lesson and 12.5 in the Better Auth demo, has a prebuilt binary for **Node.js** 26 or compiles against it, so those originals run on **Node.js** 22, and an npm configured to ignore install scripts leaves it without its binary until it is rebuilt.

## How close common targets get

| Target                            | Fit               | Library                                              |
| --------------------------------- | ----------------- | ---------------------------------------------------- |
| **Python**                        | Direct equivalent | sqlite3 from the standard library                    |
| **JavaScript** and **TypeScript** | Direct equivalent | node:sqlite, built into **Node.js** 22.5 and later   |
| **Go**                            | Direct equivalent | database/sql with **modernc.org/sqlite**             |
| **Rust**                          | Direct equivalent | **rusqlite** with its bundled SQLite                 |
| **C#**                            | Direct equivalent | **Microsoft.Data.Sqlite**                            |
| **Java**                          | Direct equivalent | **sqlite-jdbc** through JDBC                         |
| **C++**                           | Direct equivalent | SQLite's C API, compiled from its single-file source |

For **PostgreSQL**, the alumnus app's server database, the targets use psycopg with psycopg_pool in **Python**, pg in **JavaScript** and **TypeScript**, **pgx** with pgxpool in **Go**, **tokio-postgres** with **deadpool-postgres** in **Rust**, **Npgsql** in **C#**, the **PostgreSQL** JDBC driver with **HikariCP** in **Java**, and **libpqxx** in **C++**.

The tested **Python** transcription of nextjs-better-auth-demo, kept with the user-authentication examples, creates **Better Auth**'s tables with sqlite3 in a migration script of its own, and the tested **Rust** transcription of the song highlights lesson, kept with the conversation-memory examples, creates the preferences table in **knex**'s schema with **rusqlite**.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-08-context7/nextjs-better-auth-demo (the database **Better Auth** keeps)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/_alumnus (**PostgreSQL** through **knex** and a pg pool)
- modulo02-integracao-apis-llms/04-song-highlights-template (a preferences service nothing imports)
- modulo02-integracao-apis-llms/04-song-highlights-z
- modulo04-criacao-de-agentes-autonomos-novo/03-function-calling-e-tool-use
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
