# Document analysis

A server in **Go** that takes a PDF and a question as a multipart form and answers with what a model that reads PDFs says about it, through **OpenRouter**, with net/http and mime/multipart for the route and **openai-go** for the model.

## Requirements

- **Go** 1.27 or later
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
go build -o bin/doc-analysis .
```

## Running

```bash
bin/doc-analysis
```

The server listens on `http://0.0.0.0:4000`, or on the port in `PORT`, sends its own route the PDF in `docs/` with a question, prints the answer, and keeps serving. Run it from this folder, where `docs/` is. `OPENAI_BASE_URL` points the model calls to another OpenAI-compatible server.

```bash
curl -X POST -F "question=What is this about?" -F "file=@docs/a-comprehensive-overview-of-large-language-models.pdf" http://localhost:4000/chat
```
