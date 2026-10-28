# modulo-03-multi-agent

The TrialForge message-queue prototype in **Go**: the Protocolo, ICF, CSR, and Supervisor agents joined by an event bus, with timeouts, bounded retries, an idempotent document store, and a saga that regenerates only the stale result, using the standard library alone.

## Requirements

- **Go** 1.27 or later

## Building

```bash
go build -o bin/ .
```

## Running

```bash
bin/trialforge-message-queue-prototype
```

The program runs its ten self-checks and then the five scenarios, in about 20 seconds, and exits with 1 when a check fails.

Each agent is a goroutine that delivers its result on a buffered channel, so one that hangs past its timeout never blocks anyone and finishes on its own later, as a promise that loses a race does in **Node.js**. A timeout is a select against time.After, the fail-fast join returns at the first error it receives, and the settled join waits for both channels. Unlike **Node.js** and asyncio, goroutines run in parallel on several threads, so the protocol state, the document store, the execution order, and the bus each hold a mutex, and `go build -race` finds no race. The order the self-check prints comes from recording each agent's start before its goroutine launches. Records print as JSON, with fields in the original's order.
