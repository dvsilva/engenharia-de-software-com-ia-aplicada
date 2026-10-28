# modulo06-aiops-engenharia-agentica

The Kubernetes GitOps lab of the Nexus AIOps project in **TypeScript**: the architect generates the nexus-api manifests, and the SRE applies them with kubectl and judges the canary metrics, in a crew written by hand over the **openai** package pointed at **Groq**.

## Requirements

- **Node.js** 24 or later, which runs **TypeScript** without a build step
- kubectl, with a cluster in the current context for a real sync
- A **Groq** key in `GROQ_API_KEY`, or in a `.env` file at the project's root

## Setup

```bash
npm install
npm run typecheck
```

## Running

```bash
node labs/modulo3_k8s_ops.ts
```

The lab writes nexus-api-k8s.yaml to the working directory and applies it with kubectl, which reads `KUBECONFIG`. `GROQ_API_BASE` points the model calls to another **Groq**-compatible server.

core/crew.ts stands in for **CrewAI**: it writes the same persona and task prompts, offers each agent's tools with **CrewAI**'s strict schema, runs every tool call of one answer at once with Promise.all, answers them in call order, and passes every earlier answer of the crew to the next task as context. Only the lab's two agents and the tools of tools/k8s_ops.py are transcribed, and core/llm_config.ts omits the Authorization header when there is no key, as **LiteLLM** does.
