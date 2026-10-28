# RAG over students

A sales analytics server in **Go** that answers questions about a **Neo4j** graph of students, purchases, and progress: a model on **OpenRouter** plans the question, writes Cypher from the graph's schema, corrects a query **Neo4j** rejects, and answers from the rows. It uses net/http for the route, **openai-go** for the model, **neo4j-go-driver** for the graph, and **gofakeit** for the seed's data. The graph's six nodes run in a loop written by hand that stops after 25 steps, as **LangGraph**'s recursion limit does.

## Requirements

- **Go** 1.27 or later
- **Neo4j** 5 with the APOC plugin on `neo4j://localhost:7687`, with the user `neo4j` and the password `password`, as the lesson's compose file runs it
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
go build -o bin/ ./src/index ./data/seed
```

## Running

```bash
bin/seed
OPENROUTER_API_KEY=<key> bin/index
```

The seed clears the database and stores the graph. The server listens on `http://0.0.0.0:4000`, or on the port in `PORT`, sends its own route a question, prints the answer, and keeps serving. `OPENAI_BASE_URL` replaces **OpenRouter**'s address.

```bash
curl -X POST http://localhost:4000/sales -H "content-type: application/json" -d '{"question":"List all available courses"}'
```

### Tests

The end-to-end tests seed the database and send ten questions to the model:

```bash
OPENROUTER_API_KEY=<key> go test -count=1 ./tests/
```
