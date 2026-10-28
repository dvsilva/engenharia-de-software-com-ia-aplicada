# Medical appointments

A graph that schedules and cancels medical appointments from a patient's question in **Python**, with **LangGraph** for the workflow, **LangChain** over **OpenRouter** for the structured answers, and http.server for the route.

## Requirements

- **Python** 3.12 or later
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mypy
```

## Running

```bash
PYTHONPATH=src python src/index.py
```

The server listens on `http://0.0.0.0:3000`, or on the port in `PORT`, and `OPENAI_BASE_URL` points the calls to another OpenRouter-compatible server.

```bash
curl -X POST http://localhost:3000/chat -H "content-type: application/json" -d '{"question":"Sou Joao da Silva e quero agendar uma consulta com Dra. Ana Pereira para hoje às 14h"}'
```

### Tests

The end-to-end tests call **OpenRouter**:

```bash
PYTHONPATH=src python tests/router_e2e_test.py
```
