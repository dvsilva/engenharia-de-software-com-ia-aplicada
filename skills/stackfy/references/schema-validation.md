---
name: schema-validation
description: Parsing untrusted data against schemas that check, normalize, and type it, as the course does with zod at every boundary and with class-validator decorators on NestJS bodies.
---

# Schema validation

## Concept

Data that crosses a boundary, such as a request body, a query parameter, a command-line argument, a file, or an LLM's answer, is parsed against a schema before it becomes a domain value. The schema checks the data and can also normalize it, such as trimming text and dropping unknown fields, and it is the single source of the domain types, so validation and typing cannot drift apart. A failure lists one message per problem.

## How the course implements it

The medical appointment lesson of module 2 validates its request body with a JSON Schema that **Fastify** checks, requiring a question of at least 10 characters ([rest-api](rest-api.md)). Its graph state ([state-graph](state-graph.md)) is a **zod** 3 object from the copy **LangChain** depends on, with the intent limited to schedule, cancel, or unknown, and its prompts declare the schemas of the model's answers ([chat-model](chat-model.md)): the intent, with an optional professional id and name, date and time in ISO format, patient name, and reason, every field described for the model, and the message, of at least 10 characters. The final version sends each as the response format of its call, and the answers are checked against their JSON Schema. Before booking or cancelling, it also checks the state against a **zod** 3 schema that requires a numeric professional id, a date and time, and a patient name, with the lesson's own messages Professional ID is required, Appointment datetime is required, and Patient name is required, and the action fails with the messages of the missing fields joined by a comma and a space. The template declares the answer schemas but never asks for them.

The song highlights lesson of module 2 declares its graph state ([state-graph](state-graph.md)) as a **zod** 3 object from the same copy, with an optional user context and user id as strings, a summarization flag as a boolean, and extracted preferences and a conversation summary of any shape. Its prompts declare the model's answers ([chat-model](chat-model.md)), every field described in Portuguese. The chat answer holds the message, optional preferences, and a required boolean saying whether to save them, and the preferences hold an optional name, age as a number, favorite genres and bands as lists of strings, mood, listening context, and other information. The summary holds the same optional name, age, genres, and bands, the required key preferences, and optional important context. The final version sends each as the response format of its call, with no field nullable and no extra field allowed, and the answers are checked against their JSON Schema, while the template never asks for either.

The RAG lesson of module 2 over students validates its request body with a JSON Schema that **Fastify** checks, requiring a question of at least 3 characters ([rest-api](rest-api.md)). Its graph state ([state-graph](state-graph.md)) is a **zod** 3 object written with zod/v3, and its prompts declare the model's answers ([text-to-query](text-to-query.md)), every field described for the model: the query analysis, with a complexity of simple or complex, whether the question needs decomposition, the sub-questions, and the reasoning, the Cypher query, the corrected query with an explanation, the analytical answer with its follow-up questions, and an answer template. The final version asks for every one but the answer template, while the template asks for none.

The multiple MCP tools lesson of module 3 validates its request body with a JSON Schema that **Fastify** checks, requiring a question of at least 10 characters ([rest-api](rest-api.md)). Its graph state ([state-graph](state-graph.md)) and the intent it asks the model to extract are **zod** 3 schemas, imported from the copy **LangChain** depends on. The intent holds the goal without the data, the raw CSV or JSON block and an inferred file name, both nullable, and a file type of csv, json, or unknown, with every field described for the model ([chat-model](chat-model.md)). The template declares the intent schema but never asks for it, while the final version sends it as the response format of the intent call. The LangChain lesson keeps the body's schema and the state, which gains an optional file type that no node sets, asks the model for no intent, and runs the publishing lesson's API unchanged.

The Google Trends agent of module 3 validates its body the same way. Its graph state and the arguments of its google_trends tool, a list of keyword strings ([tool-calling](tool-calling.md)), are **zod** 3 schemas, and its prompts declare schemas for the keywords and the answer that no call uses.

The MCPs from scratch lesson of module 3 imports **zod** 3 from zod/v3 in its final version and declares each tool's input and output, and its prompt's arguments, as shapes of described strings: message and encryptionKey to encrypt, encryptedMessage and encryptionKey to decrypt, and encryptedMessage or decryptedMessage as the output ([model-context-protocol](model-context-protocol.md)). The SDK turns them into the JSON Schema of tools/list and the argument list of prompts/list, checks a call's arguments before the handler runs, answering a failure as a tool error that lists **zod**'s issues, drops arguments the shape does not name, and checks a successful result's structuredContent against the output schema.

The legacy API lesson of module 3 checks its bodies with JSON Schemas that **Fastify** 4 compiles with **Ajv** ([rest-api](rest-api.md)), so creating or updating a customer requires a name and a phone as strings. **Fastify**'s defaults coerce scalars into strings and keep the properties a schema does not name, which reach the database ([document-database](document-database.md)), while each route's response schemas decide which properties an answer keeps. The final version of its MCP server declares its domain as **zod** 3 schemas, from which every tool's input and output and the prompt's arguments come ([model-context-protocol](model-context-protocol.md)): a customer with an optional \_id and a required name and phone, a query whose \_id, name, and phone are optional and described, an update that requires the \_id, and a mutation answer whose id, message, isError, customer, and customers are all optional. The template declares **zod** without importing it. The API security lesson keeps the same JSON Schemas on **Fastify** 5 and the same **zod** schemas, in its template and its final version, and so does the publishing lesson, except that every tool's output is now the mutation answer, so get_customer's customer is optional but never null.

notas-api validates with **zod** 4. Ids and titles are strings that are trimmed and then required, with the module's own messages Task id is required and Task title is required. Statuses are open or done, list filters are all, open, or done, and the create input, the task, the task list, and the store file are objects built from those pieces. The **TypeScript** types are inferred from the schemas.

Validation happens at every edge: on the HTTP body and query, on CLI arguments, again inside the service, on the tasks the HTTP layer returns, and on the store file when it loads. The service and the CLI turn **zod**'s issues into a validation error that carries their messages, the HTTP layer returns them as its list of issues, and a store file that fails becomes a persistence error, as [layered-architecture](layered-architecture.md) describes.

OpsPilot validates with **zod** 3. The seed file is parsed when the store module loads, requiring at least one service and one alert, non-empty texts, and known severities and statuses. The tools' arguments are schemas too ([tool-calling](tool-calling.md)), and so are the structured answers of the planner (one to eight non-empty steps), the replanner (a decision of adjust, continue, or finish, with optional steps and answer), and the critic (whether it approves and its feedback), as [chat-model](chat-model.md) describes. Each schema doubles as the JSON Schema the model reads, and an answer that fails it makes its caller fall back instead of failing.

From unit 3, the seed also requires a tier for every service and at least one runbook, and argument schemas normalize before they validate, filling a missing status and mapping the severity aliases ([tool-calling](tool-calling.md)). The chat request body is a schema ([rest-api](rest-api.md)), and so is a status page's answer, which needs a status with an indicator and a description and keeps any other field.

Unit 4 adds a required userId to the chat body, a schema for the memory route's body, with a non-empty userId and fact, and one for the learning reflector's structured answer, hasLearning and fact ([semantic-memory](semantic-memory.md)).

Unit 6's chat body takes an optional strategy, checked by a refinement against the routes and the plan-and-execute alias, and an awaitHumanApproval boolean that defaults to false. The request and approval ids in the path must be UUIDs, the approval's body needs a decision of approve or deny and a non-empty userId, the stats query's since must be digits followed by ms, s, m, h, or d in any case and defaults to 24h, and the router's structured answer is a route among react, planExecute, and reflect with a reason ([reasoning-strategies](reasoning-strategies.md)).

Unit 8's War Room parses the API's answers in the browser with **zod** 3.25 before showing them ([component-framework](component-framework.md)). A chat answer needs a non-empty requestId, a string answer, a UUID conversationId, and trace events with a string content and node and one of the nine types the graph emits (thought, action, observation, plan, critique, answer, summarize, route, and fallback), to which unit 9 adds handoff with an optional to. A held request needs a non-empty requestId, a UUID or null conversationId, and a pending object with a UUID approvalId, a non-empty summary, and a numeric createdAt, and an approval's answer is a chat answer whose conversationId may be null. Unknown fields pass, and an answer that fails its schema becomes the page's error message.

cfp-platform's api declares its rules as **class-validator** decorators on the classes of its bodies, which implement the shared DTOs without their id ([full-stack-monorepo](full-stack-monorepo.md)), and **NestJS**'s ValidationPipe checks each body with transform on and no whitelist. Every field is required: name and talkTitle are strings, email an email, isGDE a boolean, nome and endereco strings, capacidade a number, and data an ISO 8601 date string. A failure answers 400 with one message per broken rule, field by field in the order the class declares them, each starting with the field's name, such as email must be an email, so a missing field gets two, one for its type and one for being empty. Nothing is coerced, trimmed, or dropped: a capacidade of "500" fails, a name of spaces passes, and unknown fields, an id included, reach the stored object. capacidade has no minimum, while the frontend asks for at least 1 ([component-framework](component-framework.md)).

brag-bot declares its flow's schemas with the **zod** 3 that **Genkit** exports as z ([chat-model](chat-model.md)). The input is an object with a definition string, and the output, the brag, holds title, context, actionTaken, and businessImpact as strings and metrics and technologiesUsed as lists of strings, every field required and described in Portuguese for the model. **Genkit** turns them into JSON Schema with additionalProperties true and checks the flow's input before it runs, the model's answer, and the flow's result against them, so a definition that is not a string fails before any call and fields beyond the schema pass every check.

## What usually goes wrong in other languages

- Trimming happens before the required check, so a title of spaces fails with the module's message and a padded title is stored trimmed.
- Only the two required messages belong to notas-api, and only the three required messages to the medical appointment lesson, which the cases compare exactly. The rest are **zod**'s defaults, such as the one for an unknown filter or a missing title, and every library words them differently, so transcriptions keep their own validator's text. The cases check those failures by status, by exit code, and by the presence of a message, never by its words.
- A plain ValueError raised in a **pydantic** validator gains a Value error prefix, so a validator raises PydanticCustomError instead, whose message stays as written.
- A number is not a title. Libraries that coerce types must still reject it.
- Unknown fields are dropped silently, as **pydantic** also does by default. **Jackson** fails on unknown properties unless that check is turned off.
- The descriptions attached to schema fields reach the model as part of the JSON Schema, so transcriptions keep them, as Field descriptions in **pydantic**.
- OpsPilot's chat route answers 422 unknown_strategy whenever the strategy fails its refinement, even when other fields are invalid too, and 400 with the issues otherwise.
- OpsPilot's normalization runs before validation, so the enum stays strict while the aliases still pass. **pydantic** does the same with a BeforeValidator on an Annotated Literal, which keeps the enum in the JSON Schema the model and MCP clients read.
- cfp-platform's messages are **class-validator**'s, and its frontend shows them joined by commas. The cases check one message per broken rule, field by field, each starting with the field's name, so a transcription may word them its own way, though keeping **class-validator**'s wording keeps the page identical.
- Unlike notas-api, cfp-platform keeps unknown fields and lets the body's id replace the generated one, so a **pydantic** model allows extra fields. Its fields are strict too, since lax mode would turn "500" into 500.
- IsNotEmpty rejects only an empty string, null, and a missing value, so false passes and a name of spaces is stored as sent.
- brag-bot's schemas reject nothing for having extra fields, unlike **zod**'s own parse, which would drop them, so a transcription validates without stripping, such as with a **pydantic** model that allows extra fields or a check over the decoded map.
- IsDateString accepts a date with or without a time and an offset, such as 2026-05-10 and 2026-05-10T19:00:00Z, and rejects 10/05/2026. IsEmail rejects an address without a dot after the at sign, such as ana@example, which **Go**'s net/mail accepts, so a transcription checks the domain itself.
- **Go**, **Rust**, **C#**, and **Java** declare the type and derive parsing from it, the reverse of **zod**, so trimming and required checks are written by hand or as annotations next to the type.

## How close common targets get

| Target                            | Fit               | Library                                                           |
| --------------------------------- | ----------------- | ----------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **pydantic**, with TypeAdapter over TypedDict and Annotated types |
| **JavaScript** and **TypeScript** | Direct equivalent | **zod**                                                           |
| **Go**                            | Substitute        | encoding/json with checks written by hand                         |
| **Rust**                          | Substitute        | **serde** with checks written by hand                             |
| **C#**                            | Substitute        | System.Text.Json with checks written by hand                      |
| **Java**                          | Substitute        | **Jackson** with **Hibernate Validator**                          |
| **C++**                           | Substitute        | **nlohmann/json** with checks written by hand                     |

The tested **Go** transcription of notas-api sits with the layered-architecture examples, the tested **Python** transcription of OpsPilot with the reasoning-strategies examples, the tested **Python** transcription of the medical appointment lesson with the state-graph examples, the tested **Go** transcription of brag-bot, which checks the model's answer by hand without dropping its extra fields, with the chat-model examples, the tested **Go** transcription of the legacy API lesson's MCP server, which writes its schemas as jsonschema-go values for go-sdk, with the model-context-protocol examples, and the tested **Rust** transcription of the song highlights lesson, which checks each answer against its JSON Schema with a small checker of its own, with the conversation-memory examples.

## Where it appears

- modulo02-integracao-apis-llms/03-medical-appointment-template
- modulo02-integracao-apis-llms/03-medical-appointment-z
- modulo02-integracao-apis-llms/04-song-highlights-template
- modulo02-integracao-apis-llms/04-song-highlights-z
- modulo02-integracao-apis-llms/06-rag-neo4j-students-template
- modulo02-integracao-apis-llms/06-rag-neo4j-students-z
- modulo03-mcp-na-pratica/01-multiple-mcp-tools-template
- modulo03-mcp-na-pratica/01-multiple-mcp-tools-z
- modulo03-mcp-na-pratica/02-google-trends-agent
- modulo03-mcp-na-pratica/05-mcps-do-zero-template (declared, not imported yet)
- modulo03-mcp-na-pratica/05-mcps-do-zero-z
- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/nodejs-fastify-mongodb-crud
- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-template (declared, not imported yet)
- modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/customers-mcp-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/customers-mcp-z
- modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/nodejs-fastify-mongodb-crud-z
- modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z
- modulo03-mcp-na-pratica/09-using-mcp-with-langchain/01-multiple-mcp-tools-z
- modulo03-mcp-na-pratica/09-using-mcp-with-langchain/nodejs-fastify-mongodb-crud-z
- modulo04-criacao-de-agentes-autonomos-novo/01-arquitetura-de-agentes-de-codigo/notas-api
- modulo04-criacao-de-agentes-autonomos-novo/02-padroes-de-raciocinio-e-execucao
- modulo04-criacao-de-agentes-autonomos-novo/03-function-calling-e-tool-use
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado/web (the API's answers, checked in the browser)
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems/web (the API's answers, checked in the browser)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-03/cfp-platform (the api)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1 (the same api)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-05/brag-bot (the flow's input and output)
