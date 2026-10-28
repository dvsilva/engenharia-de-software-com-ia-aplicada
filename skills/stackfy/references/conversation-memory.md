---
name: conversation-memory
description: Keeping an agent's conversation between requests, storing every turn under a conversation id and handing the strategy a bounded window of the latest messages as history, as OpsPilot does over SQLite, or saving a graph's state per thread with a LangGraph checkpointer.
---

# Conversation memory

## Concept

A model remembers nothing between requests, so the program keeps the conversation. Each turn, the user's message and the agent's answer, is stored under a conversation id that the server returns and the client sends back to continue. Before a new turn, the program loads a bounded window of the latest messages and gives it to the strategy as history: as chat messages ahead of the new one for a chat model, or as text in front of the request for a component that takes a single prompt. The window keeps the prompt small and the cost predictable, at the price of forgetting older turns. A graph runtime can keep the conversation instead: a checkpointer saves the graph's state after every step under a thread id, so invoking the graph again with that thread resumes from the saved messages, while a graph without one starts every invocation from what it receives.

## How the course implements it

The song highlights lesson of module 2 declares **LangGraph**'s **PostgreSQL** and SQLite checkpointers, @langchain/langgraph-checkpoint-postgres and @langchain/langgraph-checkpoint-sqlite. Its configuration holds postgresql://postgres:mysecretpassword@localhost:5432/song_recommender, the database its compose file runs in **Docker** from the postgres image, in a container named postgres on port 5432 with its data in dbdata. Each run of its terminal chat ([command-line-interface](command-line-interface.md)) is one conversation, and every turn invokes the graph with its thread id ([state-graph](state-graph.md)). The template's thread id is user- followed by the --user value, or by the current time in epoch milliseconds without one. It compiles the graph without a checkpointer and never connects to the database, so every turn starts from its own message and nothing is kept, and its store of long-term memories, searched under memories and the thread id before the first turn, is a stub that finds nothing.

The final version's thread id is the user, or anonymous, a hyphen, and the current time in epoch milliseconds, so every run starts a new thread. Before printing the user, it builds **LangGraph**'s PostgresSaver and PostgresStore from that address, creates their tables, prints ✅ Memória configurada: PostgreSQL, and compiles the graph with both, so every turn resumes the thread's messages and fields from the checkpoint the turn before left. Nothing reads or writes the store. The long-term memory is each user's preferences in SQLite ([sql-database](sql-database.md)), which a returning user's first turn copies into the thread's state. Every turn sends the thread's messages to the model as the conversation so far, and from the second turn on, a summary replaces all of them but the last exchange, so the model sees at most that exchange and the new message, while the summary stays in the thread's state for the next one. Its end-to-end test builds the graph over test-preferences.db and sends seven messages in a single invocation.

OpsPilot's unit 3 snapshot already holds the persistent conversation of unit 4. A conversation store creates conversations with random version 4 UUIDs, appends messages with a role of user or assistant, each with its own UUID and creation time, and returns the latest messages of a conversation up to a limit, oldest first. An unknown conversation fails with a domain error. Its SQLite implementation shares the database file with the ops store ([sql-database](sql-database.md)) in two tables, conversations and messages, with the role constrained, a foreign key to the conversation, and an index by conversation and creation time, and it returns messages in insertion order.

Each chat turn uses the given conversation or creates one, loads at most 12 earlier messages, stores the user's message, runs the strategy with the message and that history, and stores the answer only when the run succeeds. It returns the conversation id with the answer, the trace, and the metrics, which gain historyMessages, the number of messages loaded. ReAct turns the history into user and assistant messages ahead of the new user message. Plan-and-execute writes "Previous conversation:", one "role: content" line per message, a blank line, "Current message:", and the message, and that text is the request every node sees, from the planner to the replanner ([reasoning-strategies](reasoning-strategies.md)). Reflection passes the history to every run and judges against the bare message. The chat API exposes all of it through the conversationId field ([rest-api](rest-api.md)).

Unit 4 keeps the store and gives every turn a user, whose long-term memories are recalled after the history loads and before the message is stored, while the conversation keeps the bare message ([semantic-memory](semantic-memory.md)). Its scripts/conversa-longa.sh drives one conversation from outside: thirty turns of an on-call shift, each sent with the conversation id the first one returned, where the third plants the decision that the deploy freeze ends on the 15th for the next unit to look for, printing a rough token count per turn ([command-line-interface](command-line-interface.md)).

Unit 5 narrows the window to 8 messages, cuts it further to a token budget, and folds the messages that leave it into a rolling summary, so historyMessages counts the messages that survive the budget, and a long conversation keeps its early decisions ([context-management](context-management.md)). Its conversa-longa.sh also prints the conversation id and promptTokens on every turn.

Unit 6 loads the history and stores the user's message in the production graph's context node, and stores the answer in its resposta node ([state-graph](state-graph.md)). An unknown conversation still answers 404 before any model call, while a held request's conversation is only looked up when its approval runs it ([agent-observability](agent-observability.md)). Its conversa-longa.sh is unit 5's.

The single-agent lesson of the AI systems architecture module contrasts both horizons in its anatomy demo, in **JavaScript** and in **Python**, without storage. Short-term memory is the context built for one request, a system message and the protocol as a user message, which disappears when the request ends and is all its ICF agent needs, since every protocol is a new case. Long-term memory is a map in the process keyed by user id, where each call counts one more interaction, appends the new preference, and returns a copy of the record, so the second call for usuario-42 already sees the first. A self-check proves that two calls for the same user accumulate, clearing the map before and after ([decision-framework](decision-framework.md)).

## What usually goes wrong in other languages

- In ReAct, the history's assistant messages are part of the run, so a continued conversation's trace starts with the earlier answers as answer events, and its LLM calls count them. The original does exactly that, and the cases expect it.
- History is loaded before the user's message is stored, so historyMessages counts only earlier messages, and the new message never appears twice in the prompt.
- A failed run keeps the user's message without an answer, and the next turn's history includes it. An unknown conversation fails before anything is stored.
- The window takes the latest messages and then restores their order. Ordering by creation time alone mixes up messages stored in the same millisecond, so the original orders by insertion.
- Plan-and-execute uses the bare message when there is no history, without the headings.
- Ids are lowercase version 4 UUIDs, as **Python**'s uuid4, **Go**'s google/uuid, and **Java**'s randomUUID produce by default, and **C#**'s Guid prints lowercase too.
- Without a checkpointer, **LangGraph** ignores the thread id, so a transcription of the song highlights template needs no storage. **LangGraph** for **Python** publishes the same checkpointers as langgraph-checkpoint-postgres and langgraph-checkpoint-sqlite, and other targets keep each thread's state in a table of their own, named apart from **LangGraph**'s checkpoints, checkpoint_blobs, checkpoint_writes, and checkpoint_migrations so both can share the database, as the tested **Rust** transcription does with thread_states.
- Every run of the song highlights final version starts a new thread, so the cases cannot tell a checkpointer in **PostgreSQL** from one in memory. The original still connects before its first prompt and stops with ❌ Erro fatal: when the database is down, so a transcription that keeps it needs **PostgreSQL** on localhost:5432 too.
- The thread's state reaches later prompts, the previous summary included, with its keys in the order of the model's answer. A transcription saves it as text, never as jsonb, which reorders keys, and reads the answer into an order-keeping value, such as **serde_json** with preserve_order or **Python**'s dict, never **Go**'s map.
- The single-agent demo's copy is shallow, so the preferences list stays shared with the stored record. Each call prints its record at once, which shows one preference after the first call and two after the second, while printing both at the end would show two in each.

## How close common targets get

| Target                            | Fit               | Library                                               |
| --------------------------------- | ----------------- | ----------------------------------------------------- |
| **Python**                        | Direct equivalent | sqlite3 and uuid from the standard library            |
| **JavaScript** and **TypeScript** | Direct equivalent | node:sqlite and crypto's randomUUID                   |
| **Go**                            | Direct equivalent | database/sql with **modernc.org/sqlite** and **uuid** |
| **Rust**                          | Direct equivalent | **rusqlite** and **uuid**                             |
| **C#**                            | Direct equivalent | **Microsoft.Data.Sqlite** and Guid                    |
| **Java**                          | Direct equivalent | **sqlite-jdbc** and java.util.UUID                    |
| **C++**                           | Direct equivalent | SQLite's C API, with UUIDs built from random bytes    |

For the song highlights threads in **PostgreSQL**, **Python** uses langgraph-checkpoint-postgres and **JavaScript** and **TypeScript** @langchain/langgraph-checkpoint-postgres, as the original does, while the other targets keep the state in a table of their own through a **PostgreSQL** client, such as **postgres** in **Rust**.

The tested **Rust** transcription of the song highlights lesson keeps each thread's state there as JSON text.

## Tolerance

Conversation ids are random, so the cases check their shape, a lowercase version 4 UUID, and require later turns to answer with the id the first one returned. The song highlights thread ids come from the clock, as user- and 13 digits in the template without --user, and as the user, a hyphen, and 13 digits in the final version, which the cases check by that shape. The single-agent demo's records are compared exactly, as **Node.js**'s util.inspect, **Python**'s repr, or JSON.

## Where it appears

- modulo02-integracao-apis-llms/04-song-highlights-template (a thread id without a checkpointer)
- modulo02-integracao-apis-llms/04-song-highlights-z (a **PostgreSQL** checkpointer per thread)
- modulo04-criacao-de-agentes-autonomos-novo/03-function-calling-e-tool-use
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos/scripts
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos/scripts
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos/scripts
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia/scripts
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado/scripts
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems/scripts
- modulo08-arquitetura-de-sistemas-com-ia/modulo-02-single-agent (short-term context against a long-term map by user)
