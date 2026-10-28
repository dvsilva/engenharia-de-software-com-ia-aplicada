# LoRA adapter comparisons

The two comparison tools of the LoRA and PEFT lesson in **Rust**. The adapter comparison generates an answer for the medical receipt at index 8 of `mlx-data/test.jsonl` without and with the rank 8 adapter, and the rank comparison generates one for the Boa Vista workshop estimate without an adapter and with ranks 4, 8, and 16. Both run `python3 -m mlx_lm generate` as a process, as the originals do, since **MLX-LM** has no **Rust** binding, read both of its streams with `std::process::Command`, and compare the answer with the answer key field by field with **serde_json**.

## Requirements

- **Rust** 1.88 or later
- **MLX-LM** on Apple Silicon, with `mlx-community/gemma-4-e2b-it-bf16`, for real generations
- The lesson's `mlx-adapters`, `mlx-adapters-rank4`, and `mlx-adapters-rank16` folders beside `Cargo.toml`, copied from the lesson

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/adapter-comparison-tool
target/release/rank-adapter-comparison-tool
```

Each tool reads its data and adapters from the folder of `Cargo.toml`, wherever it runs.
