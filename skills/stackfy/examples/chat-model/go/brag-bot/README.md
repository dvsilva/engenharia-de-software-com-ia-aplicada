# brag-bot

BragBot in **Go**: one server that renders the dashboard and a brag's details from html/template, serves the API that turns an informal draft into a Brag Document through **Gemini**'s structured output, and ships small module scripts that keep the brags in the browser's memory and move between the pages with the History API.

## Requirements

- **Go** 1.27 or later
- A **Gemini** API key

## Building

```bash
go build -o bin/brag-bot .
```

## Running

```bash
export GEMINI_API_KEY=your_key
bin/brag-bot
```

The server listens on `http://localhost:4000`, or on the port in `PORT`. The key may also come from `GOOGLE_API_KEY` or `GOOGLE_GENAI_API_KEY`, in that order after `GEMINI_API_KEY`, and `GOOGLE_GEMINI_BASE_URL` replaces **Gemini**'s address.

The views are **Go** templates rendered once on the server and also kept in `<template>` elements, which the scripts clone, so the markup has a single source. The flow keeps the model's whole answer, fields beyond the schema included, checks the schema's fields by hand, and adds a UUID from **google/uuid**. The original's **Tailwind CSS** classes became a small stylesheet. GEMINI.md restates the original's project rules for **Go** and its templates, keeping the accessibility rules as they were, and the **VS Code** mcp.json registers gopls's MCP server in place of the **Angular CLI**'s.
