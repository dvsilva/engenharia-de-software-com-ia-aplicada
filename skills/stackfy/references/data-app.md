---
name: data-app
description: A web page written as a script that reruns from top to bottom on every interaction, with a per-session state that survives the reruns, as module 6 does with Streamlit for a ChatOps lab that simulates a Slack channel and for a dashboard whose tabs list and create S3 buckets on LocalStack and audit Terraform code.
---

# Data app

## Concept

A data app framework turns a script into a web page. Every call in the script, such as a title, a paragraph of markdown, a chat message, or an input, becomes an element on the page, in the order the script runs. Whenever the user interacts, the framework runs the whole script again from the top and updates the page with the difference, so nothing a variable holds survives to the next run unless it lives in the session state, which the framework keeps for each browser session. An input returns its value only in the run its interaction caused: a chat input returns the message once, when the user submits it, and a button returns true once, when it is clicked, and both return nothing in later runs. A text field keeps its value across runs and sends it when the user presses Enter or leaves the field. Tabs and expanders open and close in the browser without a run. Long work inside a run can show a spinner until it ends, and an exception stops the run and shows its message and traceback where it was raised, below what the run already drew. **Streamlit** serves the page and keeps a WebSocket to each browser, through which it sends every run's updates.

## How the course implements it

The ChatOps lab of module 6, labs/modulo6_chatops.py, simulates a **Slack** channel with **Streamlit** and runs with streamlit run, either directly or through option 6 of the command center menu ([command-line-interface](command-line-interface.md)). Its page is wide, titled Nexus Slack Simulator with the 💬 icon, and injects a style block before its heading, 💬 Nexus Slack Simulator, and a markdown line, Canais: `#infra-ops` | Logado como: `@camilla.martins`. The session state holds a list of messages with a role and a content, empty at first, and every run shows each one as a chat message of its role, rendered as markdown.

The chat input's placeholder is Ex: @nexus-bot destrua o banco de dados.... When it returns a message, the run appends it to the list as the user's, shows it, and opens an assistant message with the spinner 🤖 Nexus-Bot processando.... Inside it, a ChatOps agent with the execute_terraform tool ([tool-calling](tool-calling.md)) gets a one-task crew ([agent-crew](agent-crew.md)) whose description quotes the message: O usuário @camilla.martins disse: '<message>'. Se for algo crítico, use 'execute_terraform'. Responda curto e com emojis., with the expected output Resposta do bot confirmando a ação ou pedindo aprovação/senha. The crew's answer, or ❌ Erro na IA: and the error when the crew fails, is shown as markdown and appended to the list as the assistant's. Every message starts a new crew, so the model never sees the earlier ones, and execute_terraform holds destructive commands until the message carries the manager's password ([agent-observability](agent-observability.md)).

The dashboard, ui/app.py, runs with streamlit run ui/app.py, either directly or through option D of the menu. Its page is wide with the sidebar expanded, titled Nexus AI-Ops Platform with the 🛡️ icon, and injects a style block that imports the Outfit font from **Google Fonts**. The sidebar shows a shield image from icons8, NEXUS CONTROL, Advanced Agentic AI-Ops & Infrastructure Control Room, the list under 🟢 System Status (Engine: CrewAI Orchestrator, Platform: LocalStack Cloud, LLM Engine: Groq (Llama-3.1-8B), and Active Agents: 11 Specialists), and Powered by CrewAI & Streamlit. The heading, Nexus AI-Ops Platform 🛡️, and its subtitle, Automação, Segurança e Resiliência em Nuvem sob Governança Inteligente, sit above three tabs:

- 📊 Orchestrator Overview shows 🤖 Active Agent Swarm, an introduction, and eight static cards in four columns of two, each with a badge, a name, a description, and Online, or Master for the Nexus Manager.
- 📁 S3 Local Storage Explorer shows 📁 Buckets da Nuvem Local (LocalStack) and a collapsed expander, ➕ Criar Novo Bucket S3, holding the Nome do Bucket field, whose placeholder is Ex: nexus-finance-data, and a Criar Bucket button. The button warns ⚠️ Insira um nome válido para o bucket. when the field is empty, and otherwise creates the bucket and shows ✅ Bucket '<name>' criado com sucesso!, or ❌ Erro ao criar o bucket: and the error. Below come Buckets Existentes: and a 🔄 Atualizar Lista button, which only shows the toast Lista de Buckets atualizada!, since every run lists the buckets anyway. Each bucket shows as 📁 and its name, Criado em: and its creation time as dd/mm/YYYY HH:MM:SS in UTC, and Ativo (LocalStack), and an empty list shows ℹ️ Nenhum bucket S3 encontrado no LocalStack. Crie um acima! A failed listing shows ⚠️ Não foi possível listar os buckets. O LocalStack está de pé na porta 4566? (Erro: <error>).
- 🛡️ OPA Governance Sandbox shows 🛡️ OPA Corporate Policy Sandbox, an introduction, and a textarea, Insira seu código Terraform HCL ou YAML, holding an example with a t3.large instance in us-east-1. 🔬 Executar Auditoria OPA shows 📋 Relatório de Governança and calls validate_opa_policies ([infrastructure-as-code](infrastructure-as-code.md)) with the code, meaning to show a rejection as an error with a compliance warning and anything else as a success with an approval note. validate_opa_policies is a **CrewAI** tool object, though, which crewai 1.14.4 does not let a program call as a function, so the run stops under the heading with TypeError: 'Tool' object is not callable and no verdict ever shows. Its run method would return the verdict.

The S3 client is a **boto3** client for us-east-1 with the fixed keys mock_key and mock_secret and the endpoint in AWS_ENDPOINT_URL, http://localhost:4566 by default, or http://localstack:4566 whenever RUNNING_IN_DOCKER is set. requirements.txt leaves **boto3** out, and **Checkov** installs it. The project's manifests serve **LocalStack** and this page in a local cluster ([infrastructure-as-code](infrastructure-as-code.md)).

## What usually goes wrong in other languages

- **Streamlit** exists only for **Python**. Other targets serve the page themselves: an HTML page with its controls and server routes that run the crew or call S3, or a server-driven framework such as **Blazor Server** or **Phoenix LiveView**.
- The cases drive the ChatOps page in a browser by its generic parts: they focus the first textarea, type a message, press Enter, wait for the answer's text, and read the page title, the placeholder, the heading, the channel line, and the order of the messages. A transcription keeps one textarea that sends on Enter, the same texts, and the history above the input, oldest first.
- The history lives in the browser session, so a reload in **Streamlit** starts it empty. A server that keeps it in a process-wide list shares it between browsers, which the original never does.
- The user's message appears before the answer arrives, and the spinner's text shows while the crew runs. The cases hold the recorded answer long enough to read it.
- Answers are markdown, which **Streamlit** renders, so the cases read only plain-text parts of each answer and of the channel line, whose backticks render as code.
- The dashboard's cases click each tab, the expander, and each button by its label, fill the bucket field found by its placeholder, read the first textarea's value, and compare texts with whitespace collapsed, since **Streamlit** sets a message's leading emoji apart as its icon. A transcription keeps the labels, the placeholder, the order of the texts, and the content of inactive tabs and of the collapsed expander out of sight.
- A click shows only what its own run draws, so Atualizar Lista removes the message about the bucket created before it, and an empty name never reaches S3. **Streamlit** sends the field's value before the click, so a transcription reads the field when the button is pressed.
- Every S3 SDK takes the endpoint, the region, and the keys explicitly. Path-style addressing, which **boto3** picks for an endpoint given as an IP address, works with any **LocalStack** address, while virtual-hosted style needs a name such as nexus-finance-data.localhost to resolve, so the **AWS SDK for JavaScript** v3 needs forcePathStyle and **aws-sdk-go-v2** UsePathStyle.
- **boto3** returns the creation time in UTC, and the page formats it as it is. Most targets format a time in the machine's zone unless told otherwise, as **JavaScript**'s getHours does against getUTCHours.
- Each SDK words its errors its own way, so the cases require only **LocalStack**'s message for an invalid name, The specified bucket is not valid., and any text for an unreachable endpoint, which **boto3** retries for several seconds before giving up.
- The governance sandbox's failure belongs to the lesson's code. A transcription keeps it, and an explanation points out that calling the tool's run method fixes it.
- **Streamlit** chooses its port with --server.port. A transcription listens on PORT, which the runner sets.

## How close common targets get

| Target                            | Fit               | Library                                                                                                           |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **streamlit** and **boto3**, as the original                                                                      |
| **JavaScript** and **TypeScript** | Substitute        | node:http or **Express** serving one HTML page that posts each action, with **@aws-sdk/client-s3**                |
| **Go**                            | Substitute        | net/http with html/template and a fetch call from the page, with **aws-sdk-go-v2**'s s3 package                   |
| **Java**                          | Substitute        | **Spring Boot** serving the page and a JSON route, with the **AWS SDK for Java** 2's S3Client                     |
| **C#**                            | Substitute        | **Blazor Server**, whose components rerender over a SignalR connection, with **AWSSDK.S3**                        |
| **Rust**                          | Substitute        | **axum** serving the page and a JSON route, with **aws-sdk-s3**                                                   |
| **C++**                           | Substitute        | **cpp-httplib** serving the page and a JSON route, with **nlohmann/json** and the **AWS SDK for C++**'s S3 client |

The tested **TypeScript** transcription of the dashboard serves its page with node:http, runs the page's script again on the server for every click, and reaches **LocalStack** through **@aws-sdk/client-s3** with forcePathStyle. The ChatOps page has no tested transcription yet.

## Tolerance

Bucket creation times come from **LocalStack**'s clock, so the cases accept any time within ten minutes of the browser's, read as UTC.

## Where it appears

- modulo06-aiops-engenharia-agentica (the labs' ChatOps simulator and the dashboard in ui)
