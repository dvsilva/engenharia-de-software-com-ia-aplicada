---
name: text-embeddings
description: Turning text into fixed-size vectors whose dot product measures closeness in meaning, computed locally by a sentence embedding model, as the course does with all-MiniLM-L6-v2 through Transformers.js, or served by Ollama, as the AI gateway lesson does with nomic-embed-text compared by cosine.
---

# Text embeddings

## Concept

An embedding model maps a text to a vector of fixed size, so texts with close meanings land close together. A sentence embedding model runs a transformer over the text's tokens and pools the token vectors into one, usually by averaging them, and normalizing that vector to length 1 turns the dot product of two vectors into their cosine similarity, from -1 to 1. Comparing vectors replaces comparing words: a query finds the stored texts that score highest against it, and a near-identical text scores close to 1. A small model runs locally on the CPU, with its weights downloaded once from a model hub and cached, so no provider or key is involved. A local server such as **Ollama** can also serve an embedding model beside its chat models, behind an HTTP endpoint.

## How the course implements it

From unit 4, OpsPilot embeds with **Transformers.js** (**@huggingface/transformers** 4), running Xenova/all-MiniLM-L6-v2, the ONNX export of sentence-transformers' all-MiniLM-L6-v2, through a feature-extraction pipeline with mean pooling and normalization, which yields 384 numbers per text. On **Node.js** it loads the unquantized model.onnx. The pipeline loads lazily on the first text and is shared by the whole process, and the first load downloads about 90 MB from the **Hugging Face** hub, without a token, into the package's cache folder, which the project's ignore file keeps out of **Git**. A vector of any other size, or any failure to load or run the model, becomes a domain error that the chat API answers as 500 internal_error ([rest-api](rest-api.md)). The vectors serve the semantic memory ([semantic-memory](semantic-memory.md)), which stores them beside each fact and compares them by dot product. Unit tests replace the model with a fake embedder of deterministic unit vectors, so only one smoke test downloads it.

The embeddings lesson of module 1 runs the same model through **@huggingface/transformers** 3.8. Its template names the model in EMBEDDING_MODEL, Xenova/all-MiniLM-L6-v2 in the example environment, asks for fp32 weights, and declares **@xenova/transformers** 2.17 and **@huggingface/inference** 4.13 beside it, importing none of them. The final version embeds through **@langchain/community**'s HuggingFaceTransformersEmbeddings, which loads the same feature-extraction pipeline lazily with those fp32 weights, with mean pooling and normalization, replaces every newline with a space before embedding, and feeds the vector store ([vector-store](vector-store.md)). Its chunks of up to 997 characters run from 80 to 368 tokens, within the tokenizer's limit of 512. The RAG lesson that follows embeds the same way ([retrieval-augmented-generation](retrieval-augmented-generation.md)).

The gateway prototype of the AI systems architecture module ([ai-gateway](ai-gateway.md)) embeds through **Ollama** with nomic-embed-text, 768 numbers per text: **JavaScript** calls the legacy embeddings endpoint and gets a vector that is not normalized, and **Python** calls the embed endpoint and gets it normalized to length 1 ([llm-http-api](llm-http-api.md)). The cosine is computed by hand, the dot product over the product of the norms, so normalization changes nothing. Each clause's theme and text embed once, at startup, and each question once, and the vectors drive the semantic cache, the dense ranking of the hybrid search ([hybrid-search](hybrid-search.md)), and the confidence that decides the approval gate.

The enterprise architecture lesson embeds the same way. Its tiering prototype retrieves the clause whose theme is closest to the question and scores each draft against the clause's text ([model-routing](model-routing.md)), and its eval gate scores each answer against the expected clause ([model-evaluation](model-evaluation.md)), embedding the clause again every time.

## What usually goes wrong in other languages

- Scores only match with the same model, mean pooling, and normalization. The same model through sentence-transformers in **Python** matches the original to four decimals, while CLS pooling, a missing normalization, or another model changes every decision built on the scores.
- Quantized variants, such as **Transformers.js**'s q8 file, move scores by up to 0.08 on the course's texts, enough to cross the semantic memory's thresholds, so transcriptions load the full-precision model.
- The model is trained on English, so unrelated Portuguese sentences of the course still score between 0.15 and 0.45, around the thresholds that use them.
- The tokenizer ships with the model. It lowercases and strips accents, so a tokenizer written by hand, or one from another model, produces other tokens and other vectors.
- sentence-transformers truncates sentence-transformers/all-MiniLM-L6-v2's input at 256 tokens and **Transformers.js** at the tokenizer's 512, so long texts embed differently. Only the embeddings lesson's chunks run past 256, so a transcription of it with that model raises max_seq_length to 512, after which it matches the original within 2e-7, while at 256 some vectors move by 0.11.
- Xenova/all-MiniLM-L6-v2, the name the embeddings lesson's EMBEDDING_MODEL gives, holds only ONNX files. sentence-transformers loads it through its onnx extra, with backend onnx and the file onnx/model.onnx, builds the mean pooling itself, keeps 512 tokens, and matches the original within 2e-7 with normalize_embeddings on. The tested transcription runs it on ONNX Runtime's CPU provider, since the CoreML provider it picks on macOS fills standard error with warnings.
- The first use downloads the model, so it needs network access and takes a while, and later runs read the cache. A transcription's tests replace the model the way the original's fake embedder does.
- Targets without a sentence-transformers library run the same ONNX file through ONNX Runtime with a binding of **Hugging Face**'s tokenizers, and average the token vectors over the attention mask and normalize by hand.
- nomic-embed-text was trained with task prefixes such as search_query: and search_document:, which the gateway leaves out. Adding them moves every similarity, and the gateway's decisions with them.
- **Ollama**'s two endpoints give vectors with the same direction, but /api/embed rounds the normalized numbers to single precision, which moves a cosine by about 1e-7, and **Python**'s sum adds floats with compensation since 3.12, which moves the last digits again. Neither reaches the three decimals the gateway prints.

## How close common targets get

| Target                            | Fit               | Library                                                                                                                         |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **sentence-transformers** with sentence-transformers/all-MiniLM-L6-v2, or with Xenova/all-MiniLM-L6-v2 through its onnx backend |
| **JavaScript** and **TypeScript** | Direct equivalent | **@huggingface/transformers** with Xenova/all-MiniLM-L6-v2                                                                      |
| **Java**                          | Direct equivalent | **LangChain4j**'s in-process AllMiniLmL6V2EmbeddingModel, not the quantized one                                                 |
| **Go**                            | Substitute        | **onnxruntime_go** with the **daulet/tokenizers** binding, pooling and normalizing by hand                                      |
| **Rust**                          | Substitute        | **ort** with the **tokenizers** crate, pooling and normalizing by hand                                                          |
| **C#**                            | Substitute        | **Microsoft.ML.OnnxRuntime** with **Microsoft.ML.Tokenizers**, pooling and normalizing by hand                                  |
| **C++**                           | Substitute        | ONNX Runtime's C++ API with **tokenizers-cpp**, pooling and normalizing by hand                                                 |

nomic-embed-text runs inside **Ollama**, so the gateway only needs the HTTP client of [llm-http-api](llm-http-api.md) in any target.

The tested **Python** transcription of the embeddings lesson's final version sits with the vector-store examples.

## Tolerance

OpsPilot's vectors never leave the program, so its cases check the decisions they drive: which memories a message recalls and in which order, and whether a fact counts as a duplicate. Every score that decides something there stays at least 0.03 from its threshold and from its neighbors, which the full-precision model respects in any language. The embeddings lesson stores its vectors in **Neo4j**, where the cases check only their size, and prints no scores, so its cases check which chunks each search returns, in order. The narrowest margin there is 0.001 in cosine, between the third and fourth chunks of the last question, which the full-precision model with the same 512-token limit keeps in any language. The RAG lesson prints the best score of each search to three decimals, and the closest to rounding the other way lies 0.00006 in cosine from it, which the same model keeps too.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j-template (configured, never loaded)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag
- modulo02-integracao-apis-llms/04-song-highlights-template (declares **@huggingface/transformers** and **@xenova/transformers** without importing them, so there is nothing to transcribe)
- modulo02-integracao-apis-llms/04-song-highlights-z (declares the same packages without importing them, so there is nothing to transcribe)
- modulo04-criacao-de-agentes-autonomos-novo/04-memoria-e-reflexao-em-agentes-autonomos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo08-arquitetura-de-sistemas-com-ia/modulo-04-padroes-ai-especificos (nomic-embed-text through **Ollama**)
- modulo08-arquitetura-de-sistemas-com-ia/modulo-05-arquitetura-enterprise (nomic-embed-text through **Ollama**, to retrieve a clause and score drafts against it)
