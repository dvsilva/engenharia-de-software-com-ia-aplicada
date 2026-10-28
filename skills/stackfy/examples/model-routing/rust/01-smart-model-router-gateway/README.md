# Smart model router gateway

An HTTP gateway in **Rust** that asks **OpenRouter** to route each question between two free models by throughput, with **tiny_http** for the server and **reqwest** for the calls.

## Requirements

- **Rust** 1.88 or later
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/index
```

The server listens on `http://localhost:3000`, or on the port in `PORT`, and `OPENAI_BASE_URL` points the calls to another OpenRouter-compatible server.

```bash
curl -X POST http://localhost:3000/chat -H "content-type: application/json" -d '{"question":"What is rate limiting?"}'
```

### Tests

The end-to-end tests call **OpenRouter** and run one at a time, price first:

```bash
cargo test --release -- --test-threads=1
```
