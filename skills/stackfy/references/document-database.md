---
name: document-database
description: Keeping records as schemaless documents in a MongoDB collection, keyed by generated ObjectIds and found, sorted, inserted, updated with $set, and deleted through the official driver, as the legacy customers API of module 3 does.
---

# Document database

## Concept

A document database keeps records as JSON-like documents, grouped in collections inside a database, without a fixed schema, so two documents of one collection may carry different fields. Every document has an \_id, which the driver generates when the program gives none: a **MongoDB** ObjectId of 12 bytes, written as 24 hex digits. A query is itself a document of the fields to match, and the server sorts by any field, comparing strings by their bytes unless a collation says otherwise. An update with $set changes only the fields it names and reports how many documents matched and how many actually changed, and a delete reports how many it removed. Databases and collections come into being on their first write, and the client connects to the server lazily, on the first operation.

## How the course implements it

The legacy API lesson of module 3 keeps its customers with the official **mongodb** driver 6 for **Node.js**, behind the routes [rest-api](rest-api.md) describes, and the API security lesson runs the same code on the driver 7, in its template and its final version, as the publishing and LangChain lessons do. It builds the connection string from DB_USER, DB_PASSWORD, DB_HOST, and DB_PORT, root, example, localhost, and 27017 by default, without a database in its path, and works on the customers collection of the database named in DB_NAME, which the entry point requires and npm start sets to customers. Its client is created without connecting, so the program reports itself connected before any connection exists.

Listing finds every document and sorts it by name in the query, returning whole documents, \_id included, with any field a body brought. Finding by id first checks that the text is a valid ObjectId, then looks the document up by the ObjectId built from it. Creating inserts the request body as it came and answers the id the driver generated. Updating sets the body's fields on the document with that id and treats a modified count of zero as not found, and deleting treats a deleted count of zero the same way.

The module's compose file runs the mongo image at latest with the root user and the password example, beside a service that builds the API itself. Its tests run on a database named after four characters of a random UUID and -test, the configuration's fallback, and reseed it before every test, deleting every document and inserting John Doe, Jane Doe, and Chapolin Colorado.

## What usually goes wrong in other languages

- An ObjectId is valid only as 24 hex digits, in either case. The **bson** 6 and 7 packages reject a 12-character string, which older drivers took as 12 raw bytes, so aaaaaaaaaaaa is invalid. The API answers with the id as the request wrote it, so an uppercase id comes back uppercase.
- Without a collation, **MongoDB** compares names by their UTF-8 bytes, so uppercase letters come before lowercase ones and accented letters after both: Bruno, Xuxa da Silva, ana, Ágata. A transcription sorts in the query, never in code with a locale comparison.
- The root user lives in the admin database. A connection string that names DB_NAME in its path makes that database the authentication source, and the login fails unless it adds authSource=admin.
- Drivers hand out ObjectIds as their own type. **JavaScript**'s JSON writes the hex string, while **Python**'s json module refuses it and bson.json_util writes an $oid object, **Rust**'s **bson** writes one too in its extended JSON, **Jackson** and System.Text.Json write the ObjectId's properties, and **Go**'s encoding/json writes the hex string. Transcriptions convert \_id to its hex string themselves.
- A listed document keeps every field a body brought, such as an email, so a transcription decodes documents into maps, such as **Go**'s bson.M, a **Python** dict, or a BsonDocument, instead of a type with only a name and a phone.
- An update that sets the values a document already has modifies nothing, so the API answers 404 for it, as for an unknown id. The matched count would tell them apart, but transcriptions follow the modified count.
- **PyMongo**, the **Go** driver, and the others connect lazily as well, so the API starts and prints its startup lines without **MongoDB**, and a request then waits up to 30 seconds for a server before failing.

## How close common targets get

| Target                            | Fit               | Library                                                            |
| --------------------------------- | ----------------- | ------------------------------------------------------------------ |
| **Python**                        | Direct equivalent | **PyMongo**                                                        |
| **JavaScript** and **TypeScript** | Direct equivalent | The official **mongodb** driver                                    |
| **Go**                            | Direct equivalent | The official **MongoDB Go Driver**, go.mongodb.org/mongo-driver/v2 |
| **Rust**                          | Direct equivalent | The official **mongodb** crate with **bson**                       |
| **C#**                            | Direct equivalent | **MongoDB.Driver**                                                 |
| **Java**                          | Direct equivalent | The **MongoDB Java Driver**, mongodb-driver-sync                   |
| **C++**                           | Direct equivalent | **mongocxx**                                                       |

The tested **Rust** transcription of the API security lesson's final API, with the **mongodb** crate, sits with the api-access-control examples.

## Tolerance

ObjectIds are generated, so the cases check 24 lowercase hex digits and compare later answers with the ids the program returned. Everything else is deterministic and compared exactly, since each case works on a database of its own and the services start empty.

## Where it appears

- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/nodejs-fastify-mongodb-crud
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/09-using-mcp-with-langchain/nodejs-fastify-mongodb-crud-z
