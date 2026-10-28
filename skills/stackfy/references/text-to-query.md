---
name: text-to-query
description: Turning a question into a database query with a chat model given the schema, business rules, and examples, then checking the query before running it, correcting it from the error, and splitting a complex question into steps, as the course does with Cypher over Neo4j in a LangGraph graph.
---

# Text to query

## Concept

Text to query lets a user ask a database in natural language. A chat model receives the database's schema, the business rules the schema cannot express, rules about the query language, and examples of questions with their queries, and answers the query for the question as structured output, so the program gets the query alone. Before running it, the program checks it with the database's own planner, such as EXPLAIN, and on failure sends the query and the error back to the model for a corrected one, a bounded number of times. A question that compares groups or chains calculations first goes to a planner prompt that classifies it as simple or complex and splits a complex one into a few sub-questions, each answered by its own query in turn. The rows that come back are the context of the answer ([retrieval-augmented-generation](retrieval-augmented-generation.md)). A generated query is untrusted code, so it runs under credentials that can only read.

## How the course implements it

The RAG lesson of module 2 over students answers sales questions about its graph ([graph-database](graph-database.md)) with a **LangGraph** graph ([state-graph](state-graph.md)) that the route POST /sales runs ([rest-api](rest-api.md)). Its state is a **zod** object, written with zod/v3: the messages, appended through the message reducer, and optional fields for the question, the query and the original query, the results, the correction attempts, the validation error and whether the query needs correction, whether the question has several steps, its sub-questions, the current step, the sub-queries, and their results, the answer, the follow-up questions, and the error. From the start, an extract question node takes the text of the last message as the question and prints 📝 Extracted question: with it in quotes. When there are no messages, or the text is blank once trimmed, it sets an error instead, printing Extracted question is empty to standard error in the second case, and the run ends. Otherwise a query planner node, a Cypher generator node, and a Cypher executor node follow. From the executor, a conditional edge goes to a correction node, which leads back to the executor, when the query needs correction and none was attempted, back to the generator while a question with several steps has steps left, and otherwise to an analytical response node, which ends the run. The configuration allows one correction attempt and three sub-questions.

The prompts are JSON objects written as compact text ([chat-model](chat-model.md)), each beside the **zod** schema of its answer ([schema-validation](schema-validation.md)):

- The query analyzer holds a role, four rules, and two examples, and answers the complexity, simple or complex, whether the question needs decomposition, the sub-questions, and the reasoning. The question is the user prompt.
- The Cypher generator holds a role, the schema text, the business rules of the sales context (progress only in courses bought with status paid, one purchase and one progress per student and course, refunded purchases left out of revenue, and progress from 0 to 100), eight rules about Cypher (elementId instead of id, CASE for conditional counts, EXISTS for existence, an alias for every returned field, flat values, NULLS LAST, at most three hops, and plain text without markdown), and five examples of questions with their queries, and answers the query. The question is the user prompt.
- The Cypher correction holds a role, the schema text, five rules, and an example, and answers the corrected query and an explanation. The user prompt holds the failed query, the error message, and the original question.
- The analytical response holds a role, six rules, the first of which requires answering in the question's language, and an example, and answers the answer and two or three follow-up questions. Its user prompts hold the question, the query, and the results, or the error and the question, or the question and the query when nothing came back, or the original question and every step's question, query, and results.
- A prompt for answer templates with placeholders, which nothing imports.

In the template, every node after the extract question node returns the state unchanged, and the analytical response node appends an AIMessage with hello world, so no query is generated or run and no answer is written.

In the final version, each node calls the model through its prompt ([chat-model](chat-model.md)):

- The query planner asks for the analysis. When the answer requires decomposition and lists sub-questions, it prints 📊 Complex query - and the count of steps, followed on the same line by each sub-question as a line break, three spaces, its number from 1, a period, and the text, and starts the steps at 0 with empty sub-queries and results. The limit of three sub-questions is never applied. When the call fails, it prints ⚠️ Failed to analyze query, assuming simple, with two spaces after the sign, and sets the error, and the run still goes on to the generator.
- The Cypher generator prints 🤖 Generating Cypher query..., or 🤖 Generating Cypher query for step, the step from 1, a slash, the count, a colon, and the sub-question in quotes, reads the schema, and sends the current sub-question or the question. It prints ✅ Generated Cypher query: with the query, or sets the error Failed to generate query: with the call's message and leaves no query. It adds to the sub-queries only when they already hold one, so they stay empty.
- The Cypher executor checks the query with EXPLAIN and runs it. A query that fails either way, the missing query included, prints 🔍 Will attempt to auto-correct query... and asks for a correction while no attempt was counted, and otherwise sets the error Invalid Cypher query - correction failed. The validation error it passes on is always Query validation failed - syntax or structure error. When rows come back, it prints ✅ Retrieved, their count, and result(s). In a question with several steps, it appends the step's rows, none included, to the results as one flat list, keeps them as the rows, advances the step, and prints ✅ Step, the step just completed from 1, a slash, and the count, completed, then ➡️ Moving to step, with two spaces after the sign, and the same number followed by three periods while steps remain, or ✅ All, the count, and steps completed - synthesizing results. A single question without rows sets the error No results found.
- The Cypher correction prints 🔧 Auto-correcting Cypher query..., reads the schema, and sends the failed query and its error. It prints ✅ Query corrected: with the explanation, replaces the query, and counts the attempt. When the call fails, it sets the error Query correction failed: with the call's message and leaves the request for a correction in place.
- The analytical response explains the error when there is one, writing An error ocurred: and the call's message as the answer when that call fails too. Without rows, it prints 💬 Generating no-results response... and sends the no-results prompt as the system message and the system prompt as the user message, the reverse of the other calls, answering No data found matching your query. when that call fails. Otherwise it sends the question, the query, and the rows, prints ✅ Generated analytical response, and on failure prints Failed to generate analytical response to standard error and sets the error Reponse generation faild: with the call's message. Since the sub-queries stay empty, the prompt that joins every step never goes out, and a question with several steps gets the original question with the last step's query and rows.

A failed call never ends the run on its own: when every call fails, as with a rejected key, the generator leaves no query, each correction fails without counting an attempt, and the executor and the correction alternate until **LangGraph**'s limit of 25 steps throws, after 13 calls, so the route answers 500 ([rest-api](rest-api.md)).

## What usually goes wrong in other languages

- The prompts are JSON.stringify's output: no spaces after separators, keys in the order the code writes them, and accents unescaped. **Python**'s json.dumps needs separators set to a comma and a colon and ensure_ascii off to write the same text, and **Go**'s encoding/json writes a map's keys in alphabetical order, so a transcription keeps the code's order with structs or ordered maps.
- The Cypher generator's user prompt is the question as it came, not a JSON object, while the correction's and the analytical response's user prompts are JSON objects.
- The extract question node trims only to test for a blank question and keeps the question as it came, spaces included. **JavaScript**'s trim and **Python**'s strip treat a few Unicode characters differently, and the cases send only spaces, tabs, and line breaks.
- The edge allows one correction per question, whatever the configuration says. A query that fails after it sets the error Invalid Cypher query - correction failed, and the run goes on to the analytical response, or, in a question with several steps, back to the generator for the same step, which never advanced, until a query runs or the recursion limit stops it. The error stays, so the answer explains it even when the last step returns rows.
- Neo4jGraph returns **Neo4j** integers as strings, so a count reaches the analytical prompt as "10" while amounts and progress stay numbers. A driver that returns integers as numbers writes 10 and sends another prompt, so a transcription turns integers into strings before serializing the rows.
- A transcription that puts the no-results call's system and user messages back in order, or answers a question with several steps from every step, sends other requests.
- A target without **LangGraph** counts one step per node and fails on the 26th, as **LangGraph**'s limit of 25 does, so a run whose calls all fail makes the same 13 calls before answering 500.
- After a step completes, Moving to step names the step just completed, counted from 1, which is the next step's index from 0.

## How close common targets get

| Target                            | Fit               | Library                                                                                                 |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **langgraph** with **langchain-openai**'s structured output and **pydantic**, over the **neo4j** driver |
| **JavaScript** and **TypeScript** | Direct equivalent | **@langchain/langgraph** with **langchain**'s createAgent and **zod**, as the original                  |
| **Java**                          | Direct equivalent | **LangGraph4j** with **LangChain4j**, over the **Neo4j Java Driver**                                    |
| **Go**                            | Substitute        | The nodes as functions over a state struct, with **openai-go** and **neo4j-go-driver**                  |
| **Rust**                          | Substitute        | The nodes as functions over a state struct, with **reqwest**, **serde_json**, and **neo4rs**            |
| **C#**                            | Substitute        | The nodes as methods over a state record, with the official **OpenAI** library and **Neo4j.Driver**     |
| **C++**                           | Substitute        | The nodes as functions over a state struct, with **libcurl** and **nlohmann/json** for both services    |

The tested **Go** transcription of the final version, with **openai-go** v3 and **neo4j-go-driver** v5, sits with the text-to-query examples: it writes the graph's loop by hand and stops it after 25 steps, builds the schema text from apoc.meta.data, and turns integers into strings in the rows it sends. The tested **Go** transcription of the template, with the graph-database examples, writes the graph and its stub nodes by hand.

## Tolerance

The template's nodes call no model, so its cases replay nothing and expect no requests, and compare its answers and its output exactly, apart from the time each analysis took.

The final version's cases replay answers recorded from a stand-in model and compare every request by its model, routing, temperature, response format schema, and both messages, exactly apart from two parts the database decides: the schema text, whose labels, properties, and relationships may come in any order, and the rows of a query that reads students, purchases, or progress, which come from the random seed and are checked as a JSON array. The rows of a query that reads only courses, such as their count or their list, are compared exactly, as is the count of them the output prints. The output is compared exactly otherwise, apart from the time each analysis took, and standard error by the line that opens each rejected query and each failed run, whatever the driver writes after it.

## Where it appears

- modulo02-integracao-apis-llms/06-rag-neo4j-students-template (prompts and stub nodes, no model call)
- modulo02-integracao-apis-llms/06-rag-neo4j-students-z
