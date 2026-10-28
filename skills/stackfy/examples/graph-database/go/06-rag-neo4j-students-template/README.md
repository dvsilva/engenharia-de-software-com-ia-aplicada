# RAG over students (template)

A sales analytics server in **Go** whose question pipeline is still a set of stub nodes, beside a seed that fills **Neo4j** with random students, purchases, and progress, with net/http for the route, **neo4j-go-driver** for the graph, and **gofakeit** for the data.

## Requirements

- **Go** 1.27 or later
- **Neo4j** 5 on `neo4j://localhost:7687`, with the user `neo4j` and the password `password`, as the lesson's compose file runs it

## Building

```bash
go build -o bin/ ./src/index ./data/seed
```

## Running

```bash
bin/seed
bin/index
```

The seed clears the database and stores the graph. The server listens on `http://0.0.0.0:4000`, or on the port in `PORT`, sends its own route a question, prints the answer, and keeps serving.

```bash
curl -X POST http://localhost:4000/sales -H "content-type: application/json" -d '{"question":"List all available courses"}'
```

### Tests

The end-to-end tests seed the database and fail until the nodes answer:

```bash
go test -count=1 ./tests/
```
