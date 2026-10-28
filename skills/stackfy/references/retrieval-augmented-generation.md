---
name: retrieval-augmented-generation
description: Answering a question with a chat model given the passages a search retrieves for it, from keeping the results above a score and joining them into a prompt template's context to saving each answer, as the course does with LangChain over a Neo4j vector store and a model on OpenRouter.
---

# Retrieval-augmented generation

## Concept

Retrieval-augmented generation answers a question from a knowledge base instead of from what the model memorized. A retrieval step searches the base for the passages closest to the question, through a vector store ([vector-store](vector-store.md)) or a fusion of lexical and dense rankings ([hybrid-search](hybrid-search.md)), keeps those that score above a threshold, and joins them into one context. Over structured data, retrieval runs a query a model writes from the question instead, and the rows it returns are the context ([text-to-query](text-to-query.md)). A generation step fills a prompt template with the question, the context, and rules that tell the model to answer only from that context and to say when it is not enough, and sends it to a chat model ([chat-model](chat-model.md)). When retrieval finds nothing, the pipeline answers an apology without calling the model. The two steps form a chain, where each step receives the state the previous one returned, so a step can stop the rest by setting an error.

## How the course implements it

The RAG lesson of module 1 builds on the embeddings lesson: it indexes the same PDF into the same **Neo4j** store the same way ([document-chunking](document-chunking.md), [text-embeddings](text-embeddings.md), [vector-store](vector-store.md)), and replaces the plain searches with an answer for each question. At import time, the configuration reads two files relative to the working directory: prompts/answerPrompt.json, whose role, task, eight instructions, and the constraints' tone, language, and format reach the prompt while its metadata, maximum length, examples, and context rules do not, and prompts/template.txt, kept whole with its final newline. It also builds a ChatOpenAI from **@langchain/openai** 0.4 for the model in NLP_MODEL, with the key from OPENROUTER_API_KEY, **OpenRouter**'s address, a temperature of 0.3, two retries, and the referer and title from OPENROUTER_SITE_URL and OPENROUTER_SITE_NAME as headers.

An AI class answers each question through **@langchain/core** 0.3's RunnableSequence of two steps over a state that starts as the question. The retrieval step prints 🔍 Buscando no vector store do Neo4j..., asks the store for the three closest chunks with their scores, and, when there are none, prints a warning and sets the error Desculpe, não encontrei informações relevantes sobre essa pergunta na base de conhecimento. Otherwise it prints ✅ Encontrados 3 resultados relevantes (melhor score: followed by the first score to three decimals and a closing parenthesis, keeps the results that score above 0.5, and joins their texts with a blank line, three hyphens, and a blank line. Each text starts with a newline and text:, as the store returns it. The generation step returns early on an error, prints 🤖 Gerando resposta com IA..., and pipes ChatPromptTemplate.fromTemplate over the template into the model and a StringOutputParser. The template fills role, task, tone, language, format, the instructions numbered 1. to 8. one per line, the question, and the context, and becomes a single user message. It starts with Você é um before a role that already starts with those words, so the prompt says Você é um Você é um assistente. After the chain, the class prints 🎙️ Pergunta: and the question, then 💬 Resposta: and the answer or the error, the question and the answer each followed by a space and an empty line.

The program asks five of the embeddings lesson's six questions, with the first commented out, each framed by rules of 80 equals signs under 📌 PERGUNTA:. An error prints ❌ Erro: with it and moves to the next question. An answer prints between empty lines and is written, without a trailing newline, to respostas/resposta-, the question's position from 0, a hyphen, the time in epoch milliseconds, and .md, creating the folder when needed. A failed model call escapes the chain and the loop, so the program prints error and the exception to standard error, closes the store, skips the remaining questions, and still exits with 0. The client retries a rate limit or a server error twice, but never a rejected key.

The RAG lesson of module 2 over students retrieves rows of its sales graph through Cypher a model writes from the question ([text-to-query](text-to-query.md)), and its analytical response node sends the model the question, the query, and the rows as JSON, or every step's question, query, and rows, and asks for an answer in the question's language with two or three follow-up questions. When the query fails or returns nothing, the node asks the model to explain the error or to suggest other questions instead. In the template, no node retrieves or answers anything.

## What usually goes wrong in other languages

- The configuration reads the prompts and the PDF relative to the working directory, so a transcription keeps prompts/answerPrompt.json, prompts/template.txt, and tensores.pdf beside it, unchanged, and fills the template from the JSON instead of copying the text it produces.
- The threshold of 0.5 applies to **Neo4j**'s score, (1 + cosine) / 2, so it keeps every chunk whose cosine is positive, and every chunk the lesson's questions retrieve passes, the lowest at 0.6895. A transcription that filters the raw cosine at 0.5 drops chunks and sends another context.
- The context keeps the newline and text: in front of every chunk, because the store built from an existing graph returns them ([vector-store](vector-store.md)). A transcription that reads the text property itself adds them to send the same prompt.
- **LangChain**'s f-string template fills each placeholder once and never reads the inserted text as a template, so the braces of the JavaScript objects in the chunks reach the model as written. **Python**'s str.format and a plain replacement of each placeholder behave the same, while a template engine that reads double braces, such as **LangChain4j**'s PromptTemplate, needs the template rewritten.
- console.log with two arguments joins them with a space, so the question and the answer after Pergunta: and Resposta: end in a space before the empty line, as **Python**'s print and **Go**'s fmt.Println also print them.
- The file name takes the question's position from 0 and the time in milliseconds, which **Python** writes as int(time.time() * 1000) and **Go** as time.Now().UnixMilli(). A name in seconds or a position from 1 fails the cases.
- A transcription that lets the exception end the program with 1, or that skips only the failed question, fails the cases.
- ChatOpenAI turns off the **OpenAI** SDK's own retries and retries through **LangChain**, while **langchain-openai** for **Python** leaves them to the SDK. Both send a rejected key once.

## How close common targets get

| Target                            | Fit               | Library                                                                                                           |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **langchain-core**'s ChatPromptTemplate, RunnableSequence, and StrOutputParser, with **langchain-openai**         |
| **JavaScript** and **TypeScript** | Direct equivalent | **@langchain/core**'s ChatPromptTemplate, RunnableSequence, and StringOutputParser, with **@langchain/openai**    |
| **Java**                          | Substitute        | **LangChain4j**'s OpenAiChatModel, with the template filled by hand, since its PromptTemplate reads double braces |
| **Go**                            | Substitute        | **openai-go**, with the template filled by a strings.Replacer and the two steps as plain functions                |
| **Rust**                          | Substitute        | **reqwest** and **serde_json** against the chat completion endpoint, with the template filled by hand             |
| **C#**                            | Substitute        | The official **OpenAI** library for .NET, with the template filled by hand                                        |
| **C++**                           | Substitute        | **libcurl** and **nlohmann/json** against the chat completion endpoint, with the template filled by hand          |

The tested **Go** transcription of the final version of the RAG lesson over students, with the text-to-query examples, answers from the rows of generated queries. For module 1's lesson, the tested **Python** transcription of the embeddings lesson, with the vector-store examples, covers everything before the answer chain.

## Tolerance

The cases compare the output exactly, accepting the deletion's confirmation once anywhere among the lines of the chunks being added, as the embeddings lesson's do. That includes the best score of each search to three decimals: the closest to rounding the other way is 0.856469, 0.00003 from 0.8565, which the full-precision model keeps in any language. Each question's request is compared by its model, its temperature, and its single user message, exactly, so the chunks retrieved, their order, the threshold, and the separator all show there. The answers come from the replay, so the cases compare them exactly where they are printed and in the file each one is written to, matched by its name's pattern among those written during the run. With a rejected key, standard error must start with error and name the status 401 on its first line, since each client words the exception its own way. After each run, the cases query **Neo4j**'s HTTP API for what the program stored, as the embeddings lesson's do. In the RAG lesson over students, the rows in each answer's prompt are compared exactly when the query reads only courses and as a JSON array when it reads the random students, as [text-to-query](text-to-query.md) describes.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag
- modulo02-integracao-apis-llms/06-rag-neo4j-students-template (prompts and stub nodes, no retrieval)
- modulo02-integracao-apis-llms/06-rag-neo4j-students-z (rows a generated query returns)
