# OpsPilot reasoning nucleus

Three reasoning strategies for an on-call copilot in **Python**, compared side by side in an arena and scored by a bench, with **LangChain** and **LangGraph** over **OpenRouter**.

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
python src/arena.py --strategies react,plan-and-execute
python src/arena.py --strategies reflect:react --input "quantos alertas críticos estão disparando?"
python src/bench.py --scenario C1
```

The model is `openai/gpt-4o-mini` unless `OPENROUTER_MODEL` names another, and `OPENAI_BASE_URL` points the calls to another OpenAI-compatible server.

### Tests

```bash
python -m unittest discover -s src
```
