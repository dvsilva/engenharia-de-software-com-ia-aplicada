---
name: semantic-memory
description: Long-term memory of facts per user that an agent recalls by meaning, from storing embeddings with near-duplicate detection to injecting the closest facts into the prompt, learning facts after each answer with a reflector, and forgetting them through a tool, as OpsPilot does over SQLite.
---

# Semantic memory

## Concept

Conversation memory keeps the latest turns of one conversation, while semantic memory keeps durable facts about a user across every conversation, such as a preference or an operational decision. Each fact is stored with its embedding ([text-embeddings](text-embeddings.md)). Remembering skips a fact too close to one already stored, recalling scores every fact of the user against the new message, keeps those above a floor, and returns the best few, and forgetting removes one. Before a turn, the recalled facts go into the prompt. After it, a reflector, an LLM call with structured output, decides whether the message holds a durable fact worth storing, so the agent learns without being told to remember.

## How the course implements it

Unit 4 adds a memory store to OpsPilot over the same SQLite file as the other stores ([sql-database](sql-database.md)), in a third connection with a memories table: a random version 4 UUID, the user, the fact, the embedding as a BLOB of 384 little-endian 32-bit floats, and the creation time in epoch milliseconds, indexed by user. Remember trims the user and the fact and rejects an empty one with a domain error, embeds the fact, and compares it with every fact of the same user: a dot product above 0.92 returns that fact's id with stored false, and anything else is inserted and returns the new id with stored true. Recall embeds the message, scores every fact of the user, keeps scores of at least 0.3, sorts them from best to worst, and returns the first three, filtering before cutting. Forget deletes by id and user. Everything is a brute-force scan of the user's rows, without a vector index.

POST /memories stores a fact directly ([rest-api](rest-api.md)). Its **zod** schema requires a non-empty userId and fact ([schema-validation](schema-validation.md)), and it answers 201 with the id, stored true, the userId, and the trimmed fact, or 200 with the existing id and stored false for a near duplicate. A value that is empty only after trimming passes the schema and fails in the store, which answers 400 validation_error with a message, userId must be non-empty or fact must be non-empty, instead of a list of issues. POST /chat requires userId. Each turn recalls after loading the history and before storing the user's message ([conversation-memory](conversation-memory.md)). When anything comes back, the strategy receives "Relevant memories:", one "- " line per fact, a blank line, "Current message:", and the message, while the conversation stores the bare message, and the metrics gain recalledMemories. Plan-and-execute writes its history in front of that text, under its own "Current message:" heading, so the heading appears twice. From unit 5, the recalled facts first pass a token budget that drops the lowest scores, and recalledMemories counts the survivors ([context-management](context-management.md)). A system prompt shared by ReAct and every plan step tells the model to use the memories as the on-call engineer's preferences without repeating the block ([reasoning-strategies](reasoning-strategies.md)).

After a successful turn, the server answers first and then, without waiting, runs the learning reflector on the bare message. It is a structured call ([chat-model](chat-model.md)) whose Portuguese system prompt accepts only durable preferences and operational facts, rejects one-shot requests and anything holding secrets, and asks for hasLearning and fact, a one-sentence statement or an empty string. When hasLearning is true and the trimmed fact is not empty, the fact is remembered for that user through the same deduplication. Any failure of the model or the store is swallowed, so learning never breaks a turn, and a failed turn learns nothing.

The chat agents get a seventh tool, forget_preference ([tool-calling](tool-calling.md)). It takes a query, recalls the current user's memories with it, deletes the best one, and answers Forgot preference: with its fact, No matching preference found. when nothing reaches the floor, or Error: no active chat user context. outside a chat turn. The user comes from AsyncLocalStorage, bound around each strategy run, so the tool's schema has no user argument. The arena, the bench, and the MCP server ([model-context-protocol](model-context-protocol.md)) build their tools without the memory store, so they keep six and three tools.

Unit 6 starts the reflector at the beginning of the turn, in the production graph's context node ([state-graph](state-graph.md)), right before the recall and without waiting for it, so its request is the first of the turn, ahead of the router's. When the message asks to organize the shift, the turn waits for the reflector and its storing before recalling, so a preference learned from that message already reaches the same turn. The test lowercases the message and looks for a word that starts with organiz, or for one that starts with priorid or order, or the word severidade, together with plantão or plantao or a word that starts with incident, alerta, list, or mostr. For such a message, recall searches with the trimmed message followed by two lines, preferência organização plantão and ordenar Achados por severidade critical high medium low. The reflector's prompt now counts a request to organize the shift or to list by priority as durable, and suggests the fact Ao organizar o plantão ou listar incidentes/alertas nos Achados, ordenar por severidade: critical, depois high, medium, low.

## What usually goes wrong in other languages

- In units 4 and 5, the reflector runs after the answer is sent. A background task, such as **Python**'s asyncio.create_task or **FastAPI**'s BackgroundTasks, a goroutine, or **C#**'s Task.Run, has to finish while the cases wait after each response, and a transcription that learns before answering passes too. **Python** keeps a reference to a task created with create_task, or it may be collected before it runs.
- The reflector sees the bare message, never the memories or the history, and the conversation stores the bare message too. Only the strategy receives the enriched one.
- A near duplicate answers 200 with the first fact's id and the fact as sent, trimmed, not the stored one.
- **zod**'s minimum length counts spaces, and so does **pydantic**'s min_length, so a blank value passes the schema and the store's own check answers it with a message instead of issues.
- The current user travels with the run, not as a global. **Python**'s contextvars follow awaits as AsyncLocalStorage does, but a tool run in a worker thread only sees them when the executor copies the context, as asyncio.to_thread does. **Go** passes a context.Context, and **C#** an AsyncLocal.
- In units 4 and 5, a failed turn neither stores the answer nor learns, and its error answers 500 without a reflector call. In unit 6, the reflector has already been asked when the strategy fails.
- In unit 6, the cases expect the reflector's request before the router's, so a background task has to send it before the turn awaits anything else.
- The organize test runs **JavaScript** regular expressions, whose word boundaries are ASCII-only, so ã ends a word. **Python**'s re matches them exactly when compiled with re.ASCII.

## How close common targets get

| Target                            | Fit               | Library                                                                                        |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | sqlite3, **sentence-transformers**, and contextvars for the current user                       |
| **JavaScript** and **TypeScript** | Direct equivalent | node:sqlite, **@huggingface/transformers**, and AsyncLocalStorage                              |
| **Java**                          | Direct equivalent | **sqlite-jdbc**, **LangChain4j**'s in-process all-MiniLM-L6-v2, and a ScopedValue for the user |
| **Go**                            | Substitute        | **modernc.org/sqlite**, the embeddings through ONNX Runtime, and context.Context               |
| **Rust**                          | Substitute        | **rusqlite**, the embeddings through **ort**, and a task-local for the user                    |
| **C#**                            | Substitute        | **Microsoft.Data.Sqlite**, the embeddings through ONNX Runtime, and AsyncLocal                 |
| **C++**                           | Substitute        | SQLite's C API, the embeddings through ONNX Runtime, and the user passed explicitly            |

No tested transcription exists yet.

## Tolerance

Memory ids are random, so the cases check their shape, a lowercase version 4 UUID, and how they are reused: a duplicate answers the first id, and a forgotten fact comes back with a new one. Scores never leave the program, so the cases check which facts reach the prompt and in what order, as [text-embeddings](text-embeddings.md) explains. The reflector's decision and the fact it learns are the model's, replayed from the recording, so the cases compare them exactly, and every case waits a second after each response for the learning to finish.

## Where it appears

- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
