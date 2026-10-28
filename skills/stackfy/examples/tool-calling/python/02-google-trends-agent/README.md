# Google Trends agent

A graph that checks a video idea against Google Trends in **Python**, with **LangGraph** for the researcher and responder nodes, **LangChain**'s agent over **OpenRouter** with a google_trends tool and the filesystem tools of an MCP server through **langchain-mcp-adapters**, SerpApi's HTTP API for the lookups, and http.server for the route.

## Requirements

- **Python** 3.12 or later
- **Node.js**, whose npx starts the filesystem MCP server
- An **OpenRouter** key in `OPENROUTER_API_KEY` and a SerpApi key in `SERPAPI_API_KEY`

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mypy
```

## Running

```bash
python src/index.py
```

The server listens on `http://0.0.0.0:3000`, or on the port in `PORT`, asks itself a sample question about a video on Web AI, and prints the answer. `OPENAI_BASE_URL` points the model calls to another OpenRouter-compatible server, and `SERPAPI_BASE_URL` points the lookups to another SerpApi-compatible server.

```bash
curl -X POST http://localhost:3000/chat -H "content-type: application/json" -d '{"question":"Quero gravar um video sobre Rust para iniciantes, esse tema ainda esta em alta?"}'
```
