---
name: graph-database
description: Keeping data as labeled nodes and typed relationships with properties, written with Cypher's UNWIND and MERGE and read by pattern, from a seed of random students, purchases, and progress to the schema text and the EXPLAIN check a generated query needs, as the course does with Neo4j through neo4j-driver and LangChain's Neo4jGraph.
---

# Graph database

## Concept

A property graph keeps data as nodes, each with one or more labels, and relationships, each with a type and a direction from one node to another, and both carry properties: keys holding primitive values or lists of them. Cypher reads the graph by pattern, as MATCH (s:Student)-[p:PURCHASED]->(c:Course) returns every student, purchase, and course that fit. MERGE matches a pattern or creates it, with ON CREATE SET and ON MATCH SET for the properties of each outcome, which makes a seed idempotent, and UNWIND turns a list parameter into rows, so a whole batch goes in one statement. Types belong to values, not to a schema: one key can hold an integer on one node and a float on another, so the schema is whatever the data holds, and clients read it by sampling the data. EXPLAIN plans a statement without running it, which reports a syntax error or an unknown name without touching the data. **Neo4j** 5 serves Cypher over the Bolt protocol, on port 7687, and over an HTTP API, on port 7474.

## How the course implements it

Module 1's embeddings lessons keep their chunks as nodes without relationships in **Neo4j** 5.14 community, which serves as their vector store ([vector-store](vector-store.md)).

The RAG lesson of module 2 over students keeps a sales graph in **Neo4j** 5.14 community with the APOC plugin, from its compose file: the browser on port 7474, Bolt on 7687, the user neo4j with the password password, and the data, logs, plugins, and import folders bound under storage in the lesson's folder. npm run docker:infra:up starts it and waits. The configuration hardcodes neo4j://localhost:7687 and those credentials. A service wraps **@langchain/community** 1.1's Neo4jGraph over **neo4j-driver** 5.28, built on first use without the enhanced schema. Building it checks the connection and reads the schema through apoc.meta.data, and prints Schema refreshed successfully. whether that worked or not. The service returns the schema text, checks a query by running EXPLAIN before it and answering false on any error, runs a query with parameters, clears the database with DETACH DELETE and prints ✅ Database cleared, and closes the driver. Each record comes back as a plain object, with **Neo4j** integers as strings and nodes and relationships as their properties. The schema text lists the node properties, the relationship properties, and the relationships, each under its own heading, in **LangChain** for **JavaScript**'s format: Course {name: STRING, url: STRING} for a node, a space after each relationship property's type, and (: Student) - [: PURCHASED] -> (:Course) for a relationship, in the order apoc.meta.data returns them, which depends on how the database was written.

The seed, npm run seed under --watch, clears the database and generates its data with **@faker-js/faker** 9, without a seed, so every run differs. It makes 20 students, each with a UUID version 4 id, a full name, an email, and a phone number. For each student, it makes between 1 and 10 sales, each of a course drawn from the 10 in data/courses.json, with a status of paid or refunded, a payment method of pix or credit_card, a payment date within the 365 days before now as an ISO string with milliseconds and Z, and an amount between 0 and 2000 with two decimals, and a progress between 0 and 100 for every paid sale. Four statements then write the batches through UNWIND, each followed by a line: Course nodes merged by name, with the url set on creation, Student nodes merged by id, with the name, email, and phone set on creation, a PURCHASED relationship merged from each sale's student to its course, with the status, payment method, payment date, and amount set on creation and on match, and a PROGRESS relationship merged for each paid sale whose student holds a PURCHASED relationship with status paid to that course, with the progress set the same way. Each student and course pair keeps one purchase with its last sale's values, so a pair whose last sale was refunded gets no progress, and every paid purchase gets exactly one. The seed prints 🧹 Clearing database... first and ✅ Database cleared! after the clear, and closes the graph at the end. The lesson's tests seed the database the same way before they start.

The template's server never reaches the database, because its graph's nodes are stubs ([text-to-query](text-to-query.md)). The final version's nodes put the schema text in their prompts, check every generated query with EXPLAIN, and run it.

## What usually goes wrong in other languages

- **neo4j-driver** for **JavaScript** sends every number as a float, so the progress, a whole number, is stored as a FLOAT, as the amount is. The drivers for **Python**, **Go**, **Java**, **C#**, and **Rust** send an integer type as INTEGER, so a transcription converts the progress to a float before sending it, or the stored types and the schema text differ.
- A transcription that creates a relationship per sale, or keeps every paid sale's progress, stores another graph.
- The payment date is **JavaScript**'s toISOString, with exactly three fractional digits and Z. **Python**'s isoformat writes microseconds and +00:00, and **Go**'s RFC 3339 layouts write no fraction or drop its trailing zeros, so a transcription writes the format explicitly.
- Every language has a Faker of its own, with its own providers and locales, so the names, emails, and phones look different. Only their shape matters, and a seeded generator is not required.
- **LangChain** for **JavaScript** prints Schema refreshed successfully. when it connects, a line the program never writes itself. Other clients print nothing, so the cases accept the line without requiring it.
- The schema text's format belongs to **LangChain** for **JavaScript**, spacing included, and **langchain-neo4j** for **Python** words it differently. A transcription whose prompts carry it builds the text by hand from the same data.
- The driver keeps a pool of connections, so the seed closes it at the end, as the original does, or the process may never exit.

## How close common targets get

| Target                            | Fit               | Library                                                                                   |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | The official **neo4j** driver, with **Faker**                                             |
| **JavaScript** and **TypeScript** | Direct equivalent | **neo4j-driver** behind **@langchain/community**'s Neo4jGraph, with **@faker-js/faker**   |
| **Go**                            | Direct equivalent | **neo4j-go-driver** v5, with **gofakeit**                                                 |
| **Java**                          | Direct equivalent | The **Neo4j Java Driver**, with **Datafaker**                                             |
| **C#**                            | Direct equivalent | **Neo4j.Driver**, with **Bogus**                                                          |
| **Rust**                          | Direct equivalent | **neo4rs**, with **fake**                                                                 |
| **C++**                           | Substitute        | **Neo4j**'s HTTP API through **libcurl** and **nlohmann/json**, with values from <random> |

The tested **Go** transcription of the template of the RAG lesson over students, with **neo4j-go-driver** v5 and **gofakeit** v7, sits with the graph-database examples, and that of its final version, which also builds the schema text and checks queries with EXPLAIN, with the text-to-query examples. The tested **Python** transcription of module 1's embeddings lesson, with the vector-store examples, reaches **Neo4j** through the official driver.

## Tolerance

The seed's data is random, so the cases never compare its values. After each run of the seed and of the tests, they query **Neo4j**'s HTTP API for the graph's shape: exactly 10 Course nodes and 20 Student nodes, PURCHASED and PROGRESS relationships only from a student to a course, the type of every property, FLOAT for the amount and the progress and STRING for the rest, the courses' names and URLs exactly, distinct UUID version 4 ids, names and phones that are not blank, emails with a domain, between 1 and 10 purchases per student and at most one relationship of each type per pair, both statuses and both payment methods, amounts between 0 and 2000 with at most two decimals, payment dates in toISOString's format within the past year, a progress for exactly the paid purchases, and whole progress values between 0 and 100. The seed's second case starts from the graph of the first, so a transcription that never clears it holds 40 students. Every run of the cases starts from an empty database, without the lesson's bind mounts. The final version's cases check the schema text in its prompts by content, with its labels, properties, and relationships in any order.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j-template (configured, never connected)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j (the database behind the vector store)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag (the database behind the vector store)
- modulo02-integracao-apis-llms/06-rag-neo4j-students-template
- modulo02-integracao-apis-llms/06-rag-neo4j-students-z (the schema text in prompts, EXPLAIN checks, and generated queries)
