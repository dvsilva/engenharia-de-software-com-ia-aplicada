# set-game

The live coding exercise of the **Set** card game in **Rust**, in four levels: `Card`, the set rule, `Deck`, and `Board`. Each level has a starting point to fill in under `src/`, the reference solution under `solution/`, and its own tests, which run against either one.

## Requirements

- **Rust** 1.85 or later

## Testing

```bash
cargo test                          # every level, against your code in src/
cargo test --test level1            # only level 1 (change the number for the others)
cargo run --bin verify-solution     # every level, against the reference solution
```

## Running

```bash
cargo run -q --bin driver -- solution/card new '[2,"green","diamond","striped"]'
cargo run -q --bin driver -- solution/board findSets null
```

`driver` is what the cases run: it takes the solution's file, an operation named after the original's method, and JSON arguments, where a deck is a list of card texts or `null` for the full deck, and prints the answer as one line of JSON.

The tests take the solution when `SOLUTION` is set, as the original's do. `build.rs` turns the variable into the `solution` cfg and asks **Cargo** to rebuild whenever it changes, so `support/helper.rs` re-exports one implementation or the other at compile time, and both always compile. The starting point's bodies are `todo!()`, so every test panics until it is filled in.

A **Rust** struct has no constructor that throws, so `Card::new` returns `Result` with `InvalidCard`, and `Display` gives each card its `to_string`. `Deck::default()` stands for the original's default argument, `draw` clamps the count before `drain`, which panics past the end where **JavaScript**'s `splice` stops, and `shuffle` takes any `FnMut() -> f64`, so a test or the driver chooses its numbers. `Board` owns its deck, so the cards left in it are read through `board.deck`.
