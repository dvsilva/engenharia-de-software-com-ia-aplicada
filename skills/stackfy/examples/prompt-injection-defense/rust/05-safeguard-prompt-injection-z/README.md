# Safeguard prompt injection

A terminal chat in **Rust** that judges every message with a guardrail model on **OpenRouter** before an agent with the filesystem MCP server's tools answers it, with the state graph, the agent loop, and the prompt templates written by hand, **reqwest** for the **OpenRouter** calls, and **rmcp** for the MCP client.

## Requirements

- **Rust** 1.85 or later
- **Node.js**, whose npx starts `@modelcontextprotocol/server-filesystem`
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/index --user erickwendel --message 'What is the version in the package.json?'
target/release/index --user ananeri --prompt-path prompts/user/read-env.txt
target/release/index --user ananeri --unsafe --prompt-path prompts/user/read-package-version.txt
```

Run it from this folder, which holds `data/users.json` and the prompts. `--unsafe` turns the guardrail off, and `OPENAI_BASE_URL` points the calls to another OpenRouter-compatible server. The LangGraph CLI's development server, which the original registers the graph for, has no counterpart here.
