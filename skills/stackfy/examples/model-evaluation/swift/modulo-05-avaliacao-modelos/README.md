# Model evaluation harness

The model evaluation lesson's harness in **Swift**, with nothing beyond **Foundation**. It builds the held-out set with a port of the fine-tuning via API lesson's example generator, checks each answer's schema with JSONSerialization and its fields after decomposedStringWithCanonicalMapping drops the accents, calls the tuned endpoint on **Vertex AI** with URLSession and a token from `gcloud auth print-access-token` run through Process, records the baseline criterion in `resultado-medido.json` under an exclusive lock file, and asks the first example three times to count the distinct answers.

## Requirements

- **Swift** 6.0 or later on macOS 13 or later
- The **Google Cloud CLI**, logged in with `gcloud auth login`
- `ENDPOINT_MODULO32` with the endpoint of the model tuned in the fine-tuning via API lesson

## Building

```bash
swift build -c release
```

## Running

```bash
.build/release/model-evaluation-harness-tool
```

It calls **Vertex AI** at `https://us-central1-aiplatform.googleapis.com`, or at the address in `GOOGLE_VERTEX_BASE_URL`, and reads and writes `resultado-medido.json` in the folder it runs in.
