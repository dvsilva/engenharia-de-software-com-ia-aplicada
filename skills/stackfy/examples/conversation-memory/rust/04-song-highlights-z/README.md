# Song highlights

A music recommender chat at the terminal in **Rust** that keeps each conversation in **PostgreSQL**, each user's preferences in SQLite, and a summary of the conversation after every turn, with the state graph written by hand, **reqwest** for the **OpenRouter** calls, **postgres** for the threads, and **rusqlite** for the preferences.

## Requirements

- **Rust** 1.85 or later
- **PostgreSQL** on `localhost:5432` with the `song_recommender` database, such as the one the lesson's `docker-compose.yml` starts
- An **OpenRouter** key in `OPENROUTER_API_KEY`

## Building

```bash
cargo build --release
```

## Running

```bash
target/release/index --user ana
```

The chat reads one message per `Você:` prompt until `exit`. The preferences live in `preferences.db` in the current folder, and `OPENAI_BASE_URL` points the calls to another OpenRouter-compatible server.

### Tests

The end-to-end test calls **OpenRouter**:

```bash
cargo test --release
```
