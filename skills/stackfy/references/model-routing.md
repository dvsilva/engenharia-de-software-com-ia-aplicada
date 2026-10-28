---
name: model-routing
description: Letting a gateway choose the model for each request, as the course does with OpenRouter, from a list of fallback models to provider preferences sorted by price, throughput, or latency, with the response naming the model that answered, or retrying each call and falling back to a reserve model on the client, as OpsPilot does with LangChain, or retrying only transient failures, as the single-agent lesson does with Ollama, or choosing a cheap or a capable model by the request's intent and retrying every failure, as the AI gateway lesson does, or trying a cheap tier first and escalating when the retrieval's or the answer's confidence falls below a threshold, as the enterprise architecture lesson does.
---

# Model routing

## Concept

A model gateway puts many providers and models behind one OpenAI-compatible chat completion API ([llm-http-api](llm-http-api.md)). Instead of naming a single model, a request can offer a list of models in priority order, plus preferences for choosing among the providers that serve them, and the gateway decides where the request goes. Sorting by price favors the cheapest endpoint, by throughput the one that produces the most tokens per second, and by latency the one that starts answering first. The sort applies within each model, so the first model's endpoints always come first, or across every model in the list. The response's model field names the model that actually answered, which is how the caller learns the decision and what the gateway bills. A client can also route by itself: it retries a failing call a few times, then sends it to a reserve model, and records which model answered. It can also route by the request: a classifier labels the intent, and each intent maps to a model, a cheap one for routine work and a capable one where an error costs most.

## How the course implements it

The smart model router gateway of module 2 is a **Fastify** 5 server ([rest-api](rest-api.md)) in front of **OpenRouter**, reached through its official SDK, **@openrouter/sdk** 0.5. One configuration object holds the key from OPENROUTER_API_KEY, the attribution **OpenRouter** shows for the app (http://pos-ia.com as the referer and SmartModelRouterGateway as the title), two free models, arcee-ai/trinity-large-preview:free and nvidia/nemotron-3-nano-30b-a3b:free, a temperature of 0.2, at most 100 tokens, the system prompt You are a helpful assistant., and the provider preference to sort by throughput with partition none, so endpoints of both models compete. A missing key only prints an assertion failure to standard error, and the server starts anyway.

An OpenRouterService wraps the client. Its generate method sends one chat completion without streaming, carrying the list of models, the system prompt and the question as messages, the temperature, the token limit, and the provider preference, and returns the model the response names together with the first choice's content. The module's end-to-end tests build the server with the configuration overridden to sort by price and then by throughput, inject the same question without listening, and expect arcee-ai/trinity-large-preview:free for price and nvidia/nemotron-3-nano-30b-a3b:free for throughput, the models **OpenRouter** picked when the lesson was written.

The medical appointment lesson of module 2 declares **@openrouter/sdk** without importing it and reaches **OpenRouter** through **LangChain**'s ChatOpenAI instead ([chat-model](chat-model.md)). Its final version sends one free model, arcee-ai/trinity-large-preview:free, as the model and as the only entry of the list, with the provider sort by throughput and partition none, in every call. Its template configures upstage/solar-pro-3:free and the same sort, and never sends them. The song highlights lesson of module 2 also declares **@openrouter/sdk** without importing it and keeps the same configuration, which its final version sends in every call and its template never sends. The safeguard lesson of module 2 configures qwen/qwen-2.5-7b-instruct as the model and the only entry of the list, with the provider sort by price and partition none, which its template never sends. Its final version sends them with every call, the guardrail model's calls included, whose model is openai/gpt-oss-safeguard-20b while the list still names only the main model ([prompt-injection-defense](prompt-injection-defense.md)). The RAG lesson of module 2 over students configures arcee-ai/trinity-large-preview:free as the model and the only entry of the list, with the provider sort by throughput and partition none, which its final version sends with every call and its template never sends. The document analysis lesson of module 2 sends google/gemini-2.5-flash-lite-preview-09-2025 as the model and the only entry of the list, with the provider sort by throughput and partition none, in every call, and prints the model the response names.

OpsPilot's unit 6 routes on the client instead. Its model factory ([chat-model](chat-model.md)) builds the primary model from OPENROUTER_MODEL, trimmed, or openai/gpt-4o-mini, and a reserve from OPENROUTER_MODEL_FALLBACK, trimmed, unless it is blank or names the primary, each a ChatOpenAI whose own retries are off. Every call, whether it binds tools, asks for structured output, or invokes plainly, goes to the primary through **LangChain**'s withRetry with two attempts, and when both fail, to the reserve with the same retry, through withFallbacks. The retry waits between one and two seconds and retries any error, a rejected key included. A structured answer whose arguments do not fit the schema fails inside the retried call, so it is asked again, while an answer without the extract call parses to nothing and fails only in its caller, without a retry. When the reserve fails too, or there is none, the call fails with a domain error carrying the primary's first error message, which the chat API answers as 503 model_unavailable ([rest-api](rest-api.md)). A callback on each model records, per turn, which model finished each call: modelUsed in the metrics is the last one, and when the reserve answered any call, the trace ends with a fallback event from the resposta node ([state-graph](state-graph.md)) whose content is the primary, an arrow, and the reserve, as in openai/gpt-4o-mini → meta-llama/llama-3.3-70b-instruct:free.

The single-agent lesson of module 8 retries on the client without a reserve. Its ReAct prototype gives each **Ollama** call up to three attempts, waiting 500 ms and then 1 s and printing a [Retry] line before each wait, but only for transient failures: a refused, reset, or timed-out connection, or an error that mentions a timeout or a failed fetch. A 404, which **Ollama** answers for a model that is not installed, is a configuration error and fails at once, like any other error, and the program's catch escalates the failure to the Approval Gate ([reasoning-strategies](reasoning-strategies.md)).

The gateway prototype of the specific AI patterns lesson routes by intent ([ai-gateway](ai-gateway.md)): a sintese_csr request goes to gemma4:latest, printed as caro/capaz, and every other to gemma4:e2b, printed as barato/rápido. It retries every **Ollama** call, each embedding and the call that opens each answer's stream, up to three times on any error, a 404 included, without waiting, printing a [Retry] line with the attempt and the error after each failure, and fails with the last error after the third. Each attempt is bounded by 20 seconds: **JavaScript** races the call against a timer and abandons it, and **Python** runs it on a worker thread and stops waiting for its future, which cannot cancel the call.

The tiering prototype of the enterprise architecture lesson ([ai-gateway](ai-gateway.md)) replaces routing by intent with a cascade in the manner of FrugalGPT. A routine question always tries the cheap tier, gemma4:e2b, first, and escalates to gemma4:latest when either of two signals falls below 0.75 ([text-embeddings](text-embeddings.md)): the retrieval confidence, the cosine between the question and the chosen clause's theme, and the answer's confidence, which the paper calls g(question, answer), the cosine between the cheap draft and the clause's text. They catch different failures: an off-topic question retrieves the wrong clause with a low confidence, while the cheap model may still answer that wrong clause faithfully. The prototype prints the retrieval confidence before generating and the answer's confidence after, both with three decimals, and when it escalates, which signal failed, as confiança de busca, confiança de resposta, or busca e resposta, with both values. The expensive tier answers from the same clause, and its draft is scored too, for the trail, without escalating again. A CSR synthesis skips the cascade and goes straight to gemma4:latest, a fixed rule for a costly and irreversible error. A third, paid tier is only described, and neither tier is retried.

## What usually goes wrong in other languages

- The request carries no model field, only the list. Clients that require a model, such as the official **OpenAI** libraries and **LangChain**'s ChatOpenAI, send the first model of the list as model and add the list and the provider preference as extra body fields. The gateway's cases check the list and the preference, never a model field, while the medical appointment lesson's also check the model ChatOpenAI sends.
- The SDK names the limit maxTokens and sends it as max_tokens, which is the field the cases check. Clients that send max_completion_tokens fail them.
- The SDK takes the key, the referer, and the title in its constructor and sends them as an Authorization bearer header, HTTP-Referer, and X-Title. A plain HTTP client sets those headers itself.
- The original always calls https://openrouter.ai/api/v1. Transcriptions read the base URL from OPENAI_BASE_URL and fall back to that address, which is how verification points them to the recorded answers, as the copy that produced the cases does.
- The answer's model comes from the response, never from the configuration, because only the response says which model the gateway picked.
- The original converts the first choice's content to a string, so a missing content becomes the text undefined or null. Transcriptions answer the empty string the code means, and no case depends on it.
- The tests override only the sort, and node:test runs them in file order, price first, which is the order the cases expect the requests in. Runners that run tests in parallel, such as Cargo's, run them one at a time. Some runners also fail with their own exit code, such as 101 for Cargo, which the cases accept.
- OpsPilot's retries and reserve wrap every call of a turn, the reflector's, the router's, and the summarizer's included, so a primary that is down receives each request twice before the reserve does, in the order the cases check. **LangChain** for **Python** has with_retry and with_fallbacks, and other targets loop over the attempts and the models themselves.
- The 503 carries the primary's error, never the reserve's, and the JS client appends a troubleshooting link to an authentication error, so the cases check the status code and the provider's message at the start.
- The fallback event appears once per turn, at the end, whenever any call used the reserve, and modelUsed names whichever model answered last.
- The single-agent retry tells transient failures apart by the error, **JavaScript** by the codes ECONNREFUSED, ETIMEDOUT, and ECONNRESET and **Python** by the message, so each target maps its own client's connection and timeout errors to a retry and anything else, a 404 included, to an immediate failure.
- The official **Anthropic** and **OpenAI** SDKs that provedores-pagos uses retry connection errors and 5xx answers twice on their own, which a client written by hand does not.
- The gateway retries any error, unlike the single-agent lesson, so a missing embedding model is asked three times before the gateway fails.
- **ollama** for **Python** returns a stream as a generator that sends its request only when iterated, outside the retry, so the gateway retries a failed stream in **JavaScript** and not in **Python**. Its cases cover only a failed embedding, which both retry.
- The gateway's timeout covers the start of a stream, not its end, and an abandoned attempt keeps running on the server, so a slow model can receive the same request again.
- The cascade escalates only when a signal is strictly below 0.75, so 0.75 itself stays on the cheap tier, and the escalated draft replaces the cheap one whatever its own score.
- A CSR synthesis still embeds its question and retrieves a clause, which its prompt carries and its trail records, although no confidence decides anything for it.

## How close common targets get

**OpenRouter** publishes official SDKs only for **TypeScript** and **Python**. Every other target sends the same JSON to the chat completion endpoint, so the routing behaves the same and only the client is a substitute.

| Target                            | Fit               | Library                                                        |
| --------------------------------- | ----------------- | -------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **@openrouter/sdk**                                            |
| **Python**                        | Direct equivalent | **openrouter**, the official SDK                               |
| **Go**                            | Substitute        | The standard library (net/http and encoding/json)              |
| **Rust**                          | Substitute        | **reqwest** with blocking and JSON support, and **serde_json** |
| **C#**                            | Substitute        | HttpClient and System.Text.Json                                |
| **Java**                          | Substitute        | The built-in HTTP client and **Jackson**                       |
| **C++**                           | Substitute        | **libcurl** and **nlohmann/json**                              |

OpsPilot's retries and reserve need no gateway, so every target that reaches an OpenAI-compatible API gets them directly.

Tested transcriptions exist for **Rust**, and the tested **Rust** transcription of the song highlights lesson sits with the conversation-memory examples.

## Tolerance

Which model answers depends on **OpenRouter**'s live prices and statistics, so the same request may route elsewhere on another day. The cases fix the decision in the replayed answers, with the model the tests expect for each sort, and compare the request exactly: the list of models, the messages, the temperature, the token limit, and the provider preference. The gateway passes the answer through unchanged, so its text is compared exactly too. OpsPilot's failures are synthesized from **OpenRouter**'s documented errors, and the cases check which model each attempt names and in what order, never the wait between attempts. The single-agent lesson's 404 is recorded from a real **Ollama** without the model, and its case expects exactly one request. The gateway's is recorded from a real **Ollama** without nomic-embed-text, and its case expects exactly three requests for the first clause's embedding, while the model each intent picks is compared exactly in every request. The cascade's escalation follows from the replayed drafts' embeddings: the routine draft scores 0.999 and stays on the cheap tier, and the off-topic draft scores 0.701 and escalates on both signals, with each tier's model compared exactly. A missing nomic-embed-text stops the tiering prototype at its first embedding, which it never retries.

## Where it appears

- modulo02-integracao-apis-llms/01-smart-model-router-gateway
- modulo02-integracao-apis-llms/03-medical-appointment-template (configured, never sent)
- modulo02-integracao-apis-llms/03-medical-appointment-z
- modulo02-integracao-apis-llms/04-song-highlights-template (configured, never sent)
- modulo02-integracao-apis-llms/04-song-highlights-z
- modulo02-integracao-apis-llms/05-safeguard-prompt-injection-template (configured, never sent)
- modulo02-integracao-apis-llms/05-safeguard-prompt-injection-z (sent with the guardrail model's calls too)
- modulo02-integracao-apis-llms/06-rag-neo4j-students-template (configured, never sent)
- modulo02-integracao-apis-llms/06-rag-neo4j-students-z
- modulo02-integracao-apis-llms/07-doc-analysis
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo08-arquitetura-de-sistemas-com-ia/modulo-02-single-agent (retries of transient failures only)
- modulo08-arquitetura-de-sistemas-com-ia/modulo-04-padroes-ai-especificos (by intent, with retries of every failure)
- modulo08-arquitetura-de-sistemas-com-ia/modulo-05-arquitetura-enterprise (a two-tier cascade by retrieval and answer confidence)
