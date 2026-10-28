# modulo06-aiops-engenharia-agentica

The Nexus AIOps dashboard in **TypeScript**: one HTML page served by node:http, with the orchestrator overview, an S3 explorer over **LocalStack** through **@aws-sdk/client-s3**, and the governance sandbox.

## Requirements

- **Node.js** 24 or later, which runs **TypeScript** without a build step
- **LocalStack** at `AWS_ENDPOINT_URL`, http://localhost:4566 by default, such as `docker run --rm -p 4566:4566 localstack/localstack:3.0`

## Setup

```bash
npm install
npm run typecheck
```

## Running

```bash
node ui/app.ts
```

The page listens on `PORT`, 8501 by default as with **Streamlit**, and reaches http://localstack:4566 instead whenever `RUNNING_IN_DOCKER` is set.

ui/app.ts stands in for **Streamlit**'s reruns: the page posts every click to /run with the bucket field's value, and the server runs the whole script again, creating the bucket only for Criar Bucket, adding the toast only for Atualizar Lista, and listing the buckets every time, so a message lasts until the next click, as in the original. The tabs and the expander switch in the browser alone, and ui/app.html renders each run with textContent, so a bucket name or an error never becomes markup. The client uses path-style addressing, which **LocalStack** answers at any address, and shows creation times in UTC, as **boto3** returns them.

The governance sandbox keeps the original's failure. ui/app.py calls the validate_opa_policies tool object as a function, which **CrewAI** refuses, so every audit shows TypeError: 'Tool' object is not callable under the report's heading. The tool's run method would return the verdict.
