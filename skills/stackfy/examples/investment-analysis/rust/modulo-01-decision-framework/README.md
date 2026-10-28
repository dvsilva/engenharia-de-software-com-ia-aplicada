# Fine-tuning decision framework

The four-question fine-tuning decision tool and the GRPO verifiable reward demo in **Rust**. The tool gates each Amplitude Seguros case, weighs the questions by AHP, and prices fine-tuning with an NPV, a Monte Carlo simulation drawn with **rand**, a sensitivity ranking, and a binomial option to wait, reading every figure from `amplitude-seguros-casos.json`. Its functions live in a library, so later lessons can import them. The demo grades six **Ollama** answers against an answer key with **reqwest** and **serde_json** and turns their rewards into group-relative advantages.

## Requirements

- **Rust** 1.88 or later
- **Ollama** with `gemma4:e2b` for the demo

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/decision-framework-tool
target/release/grpo-verifiable-reward-demo
```

The demo calls **Ollama** at `http://localhost:11434`, or at the address in `OLLAMA_HOST`.
