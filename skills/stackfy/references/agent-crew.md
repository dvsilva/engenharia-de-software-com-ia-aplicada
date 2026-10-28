---
name: agent-crew
description: Splitting work among role-playing agents, each with a role, a goal, a backstory, and its own tools, given tasks with an expected output that run in order with the earlier answers as context or under a manager that delegates, as the AIOps labs of module 6 do with CrewAI on Groq.
---

# Agent crew

## Concept

A crew divides a job among LLM agents that each play one role, following two of the patterns of [multi-agent-orchestration](multi-agent-orchestration.md), sequential and supervisor, which **CrewAI** calls hierarchical, with every agent driven by its prompt instead of by code. An agent is a persona, made of a role, a goal, and a backstory, plus the model it calls and the tools it may use. A task describes the work, the output expected from it, and the agent that owns it. The crew runs its tasks through a process. In a sequential process, each task runs in order, and every later task receives the answers of the earlier ones as context. In a hierarchical process, a manager agent receives the work and hands parts of it to coworkers. Inside a task, the agent runs a tool loop ([tool-calling](tool-calling.md)): the model either calls tools, whose results go back to it, or answers, and that answer is the task's output. Delegation is a tool as well: an agent allowed to delegate gets one tool that hands a coworker a task and another that asks a coworker a question, and the coworker's answer comes back as the tool's result.

## How the course implements it

The labs of module 6 build a crew of AIOps agents with **CrewAI** 1.14. core/agents.py declares twelve factories, each returning an agent with a role, a goal, and a backstory in Portuguese, the tools it is given, and verbose output, all sharing one model: **CrewAI**'s LLM for groq/llama-3.1-8b-instant at temperature 0.2 ([chat-model](chat-model.md)). Each lab under labs/ creates its agents with tools from tools/ or with tools it declares itself through **CrewAI**'s tool decorator, defines its tasks, prints a header, and kicks off a crew. Each lab puts the project root first on the import path and runs as python labs/<lab>.py from the root, where its tools read and write their files, and nexus_iac_copilot.py offers every lab in a menu ([command-line-interface](command-line-interface.md)).

**CrewAI** writes the prompts. The agent's system message is You are, the role, a period, a space, and the backstory, then a line with Your personal goal is: and the goal. The task's user message starts with a line break and Current Task: with the description, then a blank line and This is the expected criteria for your final answer: with the expected output, and a line with you MUST return the actual complete content as the final answer, not a summary. A task with context adds a blank line, This is the context you're working with:, and on the next line every earlier answer of the crew, joined by a line of ten dashes between blank lines. Every request offers the agent's tools, asks for temperature 0.2 without streaming, and stops at a line break followed by Observation:. After each tool result, a user message asks the model to analyze it and either answer or call the next tool. The model's first answer without tool calls is the task's output, and the crew's result is the last task's output.

- modulo1_foundation: the Nexus cloud architect designs an S3 bucket for logs with check_compliance_rules.
- modulo2_iac_copilot: in sequence, the architect writes main.tf for the nexus-apollo-data bucket with write_file, and the DevSecOps engineer validates it with run_checkov_scan and validate_opa_policies ([infrastructure-as-code](infrastructure-as-code.md)).
- modulo3_k8s_ops: in sequence, the architect designs nexus-api with generate_k8s_manifest, and the **Kubernetes** SRE syncs nexus-api-k8s.yaml with apply_k8s_manifest and then decides whether the rollout with error_rate: 1%, latency: 80ms is healthy, with analyze_canary_metrics available.
- modulo4_troubleshooting: in sequence, the on-call SRE investigates the checkout with query_prometheus_metrics, query_jaeger_traces, inspect_pod_failure, and suggest_fix, and the architect writes checkout-k8s-fix.yaml with write_file under strict rules for the Deployment. The on-call SRE may delegate, so **CrewAI** also offers it delegate_work_to_coworker and ask_question_to_coworker, whose descriptions name the architect as the only coworker.
- modulo5_aiops: the AIOps agent turns a question into PromQL with nl_to_promql, predicts the disk saturation with predictive_disk_alert, and writes a dashboard with generate_grafana_dashboard.
- modulo6_chatops: a **Streamlit** page that runs a one-task crew for every message ([data-app](data-app.md)).
- modulo7_devsecops, modulo8_cicd, and modulo9_finops: the DevSecOps analyst, the CI/CD engineer, and the FinOps consultant each read a file of data/ through a tool the lab declares, analyze_trivy_report, analyze_workflow_yaml, or analyze_cloud_costs, which takes the file's path. The task names that path as an absolute path built from the project root, so the model repeats it in its call.
- modulo10_remediation: the incident responder reads data/runbook_<service>.md through consult_runbook, which takes the service's name and answers Error: Runbook for service '<service>' not found. when there is no such file.
- modulo11_guardrails: the safety SRE submits a fixed Deployment to a guardrail tool that asks a human for approval ([agent-observability](agent-observability.md)), and the lab prints 📋 RESULTADO FINAL: and the crew's result.
- modulo12_projeto_final: a hierarchical crew of the on-call SRE, the DevSecOps analyst, and the FinOps consultant, with the Nexus manager as its manager agent and memory off, prints 🏆 RELATÓRIO FINAL DO PROJETO INTEGRADO: and the result. The mission names the manager as its own agent, so **CrewAI** offers the manager delegation tools whose only coworker is the manager itself, and the specialists never run. Delegating to it runs the manager again, without tools, on a task whose description is the delegated task, whose expected output is Your best answer to your coworker asking you this, accounting for the context shared., and whose context is the delegation's, and that answer comes back as the tool's result.

## What usually goes wrong in other languages

- **CrewAI** exists only for **Python**. Other targets write the agents, the tasks, the crew, and the tool loop by hand over the chat completion API. The cases count the requests of every run and check each one's model, temperature, persona, task, context, tools, and tool results, so a transcription keeps the same wording, the same order of calls, and the same tools in the same order. **CrewAI**'s own sentences, such as the request to analyze each tool result, may be reproduced or left out.
- A task with context receives every earlier answer of the crew, not only the last one.
- An answer with text beside a tool call is not final: **CrewAI** runs the call and asks again, so the loop ends only at an answer without tool calls, as in the troubleshooting lab's last task.
- Delegation tools are named after **CrewAI**'s sentences, Delegate work to coworker and Ask question to coworker, turned into delegate_work_to_coworker and ask_question_to_coworker. Their arguments are a task or a question, a context, and a coworker, all required strings, and their descriptions list the coworkers by role.
- An agent allowed to delegate offers the delegation tools after its own, and a manager agent offers only them.
- **CrewAI** prints its progress in framed panels, checks **PyPI** for a newer version, and can ask about tracing on the first run. None of it is part of the lesson: the cases set CREWAI_TRACING_ENABLED, CREWAI_DISABLE_TELEMETRY, and OTEL_SDK_DISABLED to keep the original quiet and check only the lines the labs print.
- Paths in the tasks of the file-reading labs are absolute, and the model repeats them, so the replay hands them back inside the folder the transcription runs in.

## How close common targets get

| Target                            | Fit               | Library                                                                              |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| **Python**                        | Direct equivalent | **crewai**, as the original                                                          |
| **JavaScript** and **TypeScript** | Substitute        | The **openai** package pointed at **Groq**, with agents, tasks, and the loop by hand |
| **Go**                            | Substitute        | **openai-go** pointed at **Groq**, with agents, tasks, and the loop by hand          |
| **Java**                          | Substitute        | **LangChain4j**'s OpenAI module pointed at **Groq**, with the crew written by hand   |
| **C#**                            | Substitute        | The official **OpenAI** library for .NET pointed at **Groq**, with the crew by hand  |
| **Rust**                          | Substitute        | **async-openai** pointed at **Groq**, with agents, tasks, and the loop by hand       |
| **C++**                           | Substitute        | **libcurl** and **nlohmann/json** against the chat completion endpoint, crew by hand |

**KaibanJS** follows **CrewAI**'s agents, tasks, and teams in **JavaScript**, but writes its own prompts, so the cases' persona and task checks favor a loop written by hand, as the tested **TypeScript** transcription of the **Kubernetes** lab does over the **openai** package.

## Tolerance

The model's answers come from the replay, so every task's output is the recorded one. Only the persona, the task, the context, and the tool results are compared, by the texts they must contain, so a transcription may frame them in its own sentences.

## Where it appears

- modulo06-aiops-engenharia-agentica (the twelve agents of core and the labs that run them)
