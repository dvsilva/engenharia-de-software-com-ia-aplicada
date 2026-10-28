# modulo-02-single-agent

The TrialForge single agent in **Go**: the anatomy demo, the ReAct prototype over **Ollama**'s native chat, and the same model call on **Claude**, **Gemini**, and **GPT**.

## Requirements

- **Go** 1.27 or later
- **Ollama** with gemma4:e2b, for the demo and the prototype
- `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `OPENAI_API_KEY`, for the paid providers

## Building

```bash
go build -o bin/ ./cmd/...
```

## Running

```bash
bin/agent-components-demo
bin/react-agent-prototype
bin/provedores-pagos "Estudo fase II, público-alvo entre 12 e 17 anos, terapia oncológica experimental."
```

`OLLAMA_HOST` changes **Ollama**'s address. The `provedores` package exports `ChamarClaude`, `ChamarGemini`, and `ChamarGPT`, and `provedores-pagos` calls the three in that order with the ICF request built from the protocol it receives, printing each result as one line of JSON. `ANTHROPIC_BASE_URL`, `GOOGLE_GEMINI_BASE_URL`, and `OPENAI_BASE_URL` change the providers' addresses.

**Claude** goes through **anthropic-sdk-go**, while **Ollama**, the **Gemini** Interactions API, and **GPT**'s chat completions go through net/http and encoding/json. A tool call's arguments stay as raw JSON, so the trail prints them in the order the model sent them, which a Go map would sort.
