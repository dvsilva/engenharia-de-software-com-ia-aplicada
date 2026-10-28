---
name: vector-store
description: Keeping text chunks beside their embeddings in a database with a vector index, and finding the chunks closest to a question by cosine similarity, as the course does with Neo4j through LangChain's Neo4jVectorStore.
---

# Vector store

## Concept

A vector store keeps each piece of text beside its embedding ([text-embeddings](text-embeddings.md)) and answers a question with the pieces whose vectors lie closest to the question's. Indexing splits a document into chunks ([document-chunking](document-chunking.md)), embeds each one, and writes the chunk, its vector, and its metadata. Searching embeds the question with the same model and asks the vector index, an approximate nearest neighbor structure built with a similarity function such as cosine, for the top k. **Neo4j** 5 is a graph database ([graph-database](graph-database.md)) that keeps vector indexes over node properties, so each chunk is a node, and the program reaches it with Cypher over the Bolt protocol. Retrieval-augmented generation builds on the search by handing the chunks it finds to a model as context ([retrieval-augmented-generation](retrieval-augmented-generation.md)).

## How the course implements it

The embeddings lesson of module 1 runs **Neo4j** 5.14 community in **Docker** from its compose file, with the browser on port 7474, Bolt on 7687, the user neo4j with the password password, the APOC plugin, and its data, logs, plugins, and import folders bound into the lesson's folder. npm run infra:up starts it and waits, and npm run infra:down removes it with its volumes. The template's entry point is empty. The configuration both versions share reads the address, user, and password from NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD, which the template's example environment sets to bolt://localhost:7687, neo4j, and password, and names the vector index tensors_index, the node label Chunk, the text property text, the search type vector, and three results per search. The results formatter, also shared, prints how many chunks were found, then each one numbered, with its whitespace collapsed and cut to 200 characters followed by ..., and a page line when its metadata has a pageNumber.

The final version stores the chunks through **@langchain/community** 0.3's Neo4jVectorStore over **neo4j-driver** 5.28, built from the existing graph. Building it checks the credentials, embeds the word foo to learn the vector size, 384, and looks for a vector index with that name or on that label and property. When there is none, it creates tensors_index on the Chunk nodes' embedding property with cosine similarity through db.index.vector.createNodeIndex, and then it embeds any Chunk node that has text but no embedding. The program deletes every Chunk node with DETACH DELETE without waiting for the deletion, so its confirmation usually prints after the first chunk's line, and adds the chunks one at a time, printing a line for each: each becomes a node merged on a version 1 UUID, with its vector set through db.create.setVectorProperty, its text, and its metadata, which holds only the source file, so every Chunk node holds id, text, embedding, and source. It then searches for six questions in Portuguese, each framed by rules of 80 equals signs: a search embeds the question and calls db.index.vector.queryNodes for the top three, which the formatter prints. Because the store comes from an existing graph, each result's text is built from the text properties as a newline, the property's name, a colon, a space, and its value, so every result starts with a newline and text:, and its metadata holds the node's other properties, with id, embedding, and text set to null. The program closes the store at the end, which closes the driver.

The RAG lesson that follows keeps the same compose file, configuration, store, deletion, and indexing, and searches inside its answer chain ([retrieval-augmented-generation](retrieval-augmented-generation.md)) for five of the six questions, with the first commented out. It calls similaritySearchWithScore, which runs the same query and returns each chunk with **Neo4j**'s score.

## What usually goes wrong in other languages

- **Neo4j** reports a cosine score as (1 + cosine) / 2, from 0 to 1, so 0.5 means orthogonal vectors. A transcription that computes the similarity itself, or reads another store's raw cosine, shifts every score and every threshold built on it.
- The text: prefix comes from the retrieval query **LangChain** builds for an existing graph. **langchain-neo4j**'s Neo4jVector.from_existing_graph builds the same query in **Python**, while Cypher written by hand, or a client that returns the property directly, adds the prefix itself to print the same results.
- **Neo4j** 5.14 rejects the CREATE VECTOR INDEX statement of later versions, which **langchain-neo4j** 0.11 sends, so the tested **Python** transcription overrides the store's create_new_index to call db.index.vector.createNodeIndex, as **LangChain** for **JavaScript** does, and Cypher written by hand does the same. db.create.setNodeVectorProperty, which **langchain-neo4j** calls, exists in 5.14, and a plain SET of a list of floats is indexed the same as db.create.setVectorProperty.
- **Neo4j** properties hold only primitive values and lists of them, so a chunk's metadata cannot carry the loader's nested loc, which is why the original keeps only the source.
- **langchain-neo4j** names a chunk after the MD5 of its text unless given ids, so storing the same text again merges into the node already there. The original merges on a fresh version 1 UUID, which the tested transcription passes as ids, so only the deletion keeps a second run from doubling the chunks.
- An index left with another vector size, such as one made with another model, makes the store fail, so a transcription that changes the model drops the index first.
- The formatter looks for pageNumber at the top of the metadata, while the PDF loader keeps it under loc and the final version keeps only the source, so no page line ever prints.
- The driver holds a pool of connections, so a transcription closes it at the end, as the original does, or the program may never exit. **langchain-neo4j**'s Neo4jVector has no close method, so the tested transcription hands it a Neo4jGraph, built without reading the schema, and closes that.

## How close common targets get

| Target                            | Fit               | Library                                                                                                                                  |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **langchain-neo4j**'s Neo4jVector with the official **neo4j** driver, creating the index through db.index.vector.createNodeIndex on 5.14 |
| **JavaScript** and **TypeScript** | Direct equivalent | **@langchain/community**'s Neo4jVectorStore with **neo4j-driver**                                                                        |
| **Java**                          | Substitute        | The **Neo4j Java Driver**, with the store's Cypher written by hand                                                                       |
| **Go**                            | Substitute        | **neo4j-go-driver** v5, with the store's Cypher written by hand                                                                          |
| **Rust**                          | Substitute        | **neo4rs**, with the store's Cypher written by hand                                                                                      |
| **C#**                            | Substitute        | **Neo4j.Driver**, with the store's Cypher written by hand                                                                                |
| **C++**                           | Substitute        | **Neo4j**'s HTTP API through **libcurl**, with the store's Cypher written by hand                                                        |

The tested **Python** transcription of the final version, with **langchain-neo4j** 0.11, sits with the vector-store examples.

## Tolerance

The template stores nothing, so its case checks only that the program runs beside the database and prints nothing. The final version's cases compare its output exactly, accepting the deletion's confirmation once anywhere among the lines of the chunks it adds. After each run, they query **Neo4j**'s HTTP API for what the program stored: 15 Chunk nodes with distinct ids, each holding exactly id, text, embedding, and source, ./tensores.pdf as the only source, 384 numbers per vector, the length of every chunk, and a single vector index, tensors_index on the Chunk nodes' embedding with cosine similarity and 384 dimensions. The second case runs over what the first stored, so a transcription that never deletes holds 30 chunks and prints duplicates. The narrowest margin the searches depend on, 0.0005 in **Neo4j**'s score between the third and fourth chunks of the last question, holds with the same chunks and the full-precision model. The RAG lesson's cases check the same stored chunks and index after each run, and its searches depend on the same margin. It prints the best score of each search to three decimals, which the cases compare exactly, since none is closer than 0.00003 to rounding the other way. Every run starts from an empty database, without the lesson's bind mounts.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j-template (configured, never connected)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag
