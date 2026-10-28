---
name: hybrid-search
description: Retrieving the passage that grounds an answer by fusing a lexical BM25 ranking with a dense cosine ranking through Reciprocal Rank Fusion, inside one index per domain chosen by the request's intent, and broadening the search in an agentic loop until a confidence threshold or an iteration limit, as the course does by hand over Ollama embeddings.
---

# Hybrid search

## Concept

Retrieval-augmented generation finds the text that grounds an answer before the model writes it. Dense retrieval compares the question's embedding with each passage's ([text-embeddings](text-embeddings.md)), which matches meaning but can miss an exact term, a code, or a rare identifier. Sparse retrieval scores shared words with BM25, which rewards a term that is rare in the corpus and frequent in the passage, normalized by the passage's length, and misses paraphrases. Hybrid search runs both and fuses them with Reciprocal Rank Fusion (RRF), which adds 1 / (k + rank) from each ranking, so the two scores, whose scales are incompatible, are never added directly. A multi-index layout keeps one index per domain, each with its own vocabulary, and a router picks which one to search. An agentic loop searches, judges the result by a confidence score, and searches again with a broader strategy until the score reaches a threshold or the iterations run out, and then hands the best result on with the decision of what to do about a low score.

## How the course implements it

The specific AI patterns lesson of the AI systems architecture module builds the retrieval of its gateway prototype by hand ([ai-gateway](ai-gateway.md)), in **JavaScript**, the official version, and in **Python**, its mirror, with nothing beyond the **ollama** client that embeds. Its corpus is three indexes, icf, protocolo, and csr, of two regulatory clauses each, a record with a tema, a texto, and a fonte. The request's intent picks the first index: consulta_icf searches icf, consulta_protocolo searches protocolo, and sintese_csr searches csr.

Indexing runs once, before the first request, and prints how many clauses and indexes it prepares. For each index it embeds every clause's tema and texto with nomic-embed-text and builds the BM25 statistics over the clauses' texto: each one's tokens, the number of documents, their average length, and in how many documents each term appears. **JavaScript** embeds clause by clause, tema then texto, while **Python** embeds every tema of the index and then every texto. Searching never embeds anything but the question, once per request.

The tokenizer lowercases the text, decomposes it to NFD, removes the combining marks, replaces every character that is neither a word character nor a space with a space, and splits on whitespace, dropping empty tokens. BM25 uses k1 1.5 and b 0.75 and an idf of ln((N - df + 0.5) / (df + 0.5) + 1), which stays positive with so few documents, and adds the score of every query token that appears in the clause, repeated tokens included. The dense score is the cosine between the question's embedding and the clause's tema or texto embedding. Each ranking sorts the clauses by score, highest first, keeping ties in the index's order. RRF with k 60 adds 1 / (k + position + 1) from the dense ranking and then from the sparse one, and sorts by the sum, highest first, keeping ties in the order the dense ranking filled them. The first clause wins, with its cosine, its BM25 score, and its RRF score, and its cosine, never the fused score, is the confidence.

The agentic loop makes at most three iterations and prints each one's strategy and confidence with three decimals. The first searches the routed index against the clauses' tema, the second the same index against their texto, and the third every index against texto, keeping the index whose winner has the highest cosine, the first one on a tie. The best result across iterations, by cosine, is kept, and the loop returns it as soon as an iteration reaches 0.7, with the number of iterations used. When none does, it prints that the three iterations ran out and returns the best result marked as exhausted, leaving the decision to the confidence threshold ([decision-framework](decision-framework.md)). The gateway then prints the final clause's tema, its index, its cosine and BM25 score with three decimals, its RRF score with four, and the iterations.

Two self-checks, printed with the gateway's ([ai-gateway](ai-gateway.md)), run before any embedding: over three short sentences, the one that shares idade and mínima with the query wins BM25, and when two rankings agree that the first document is the best, it wins the fusion.

## What usually goes wrong in other languages

- **JavaScript**'s \w is ASCII, while **Python**'s matches any letter, so the ordinal in Art. 4º becomes the token 4 in one and 4º in the other. No question of the course contains it, so the scores agree. **Go**'s RE2 and **Java** follow **JavaScript**, and **Rust**'s regex and .NET follow **Python** unless their ASCII options are set.
- The original removes the combining marks of U+0300 to U+036F, and **Python** every character of category Mn, which agree on Portuguese text. Without the NFD step, accented and plain words become different tokens and BM25 changes.
- The fusion ties often: with two clauses per index, two rankings that disagree give both clauses 1/61 + 1/62, so the dense ranking's winner must win, as it does for the CSR synthesis and the storage question. A map that iterates in random order, such as **Go**'s, or an unstable sort, such as **Go**'s sort.Slice or **C++**'s std::sort, picks either, so transcriptions keep the insertion order and sort stably.
- A clause that shares no word with the question scores 0 in BM25, and two zeros keep the index's order, which again needs a stable sort.
- BM25 libraries differ from the original's formula: **rank_bm25**'s BM25Okapi leaves out the + 1 inside the logarithm and floors negative idf values, and **Lucene** drops the k1 + 1 factor. The printed BM25 scores change, so transcriptions write the formula by hand.
- The query's tokens are not deduplicated, so a word the question repeats counts twice.
- The confidence is the winner's cosine, not its RRF score, and the agentic loop keeps the best cosine across iterations, so a broader iteration that scores lower never replaces an earlier result.
- The loop stops on a cosine of at least 0.7, while the third iteration replaces the best index only on a strictly higher cosine.

## How close common targets get

BM25, RRF, and the loop are a few dozen lines of arithmetic, so every target is a direct equivalent with the standard library, plus Unicode normalization where the language lacks it:

| Target                            | Fit               | Library                                                                    |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | unicodedata, re, and math from the standard library                        |
| **JavaScript** and **TypeScript** | Direct equivalent | String.prototype.normalize, regular expressions, and a Map                 |
| **Go**                            | Direct equivalent | **golang.org/x/text/unicode/norm**, regexp, and sort.SliceStable           |
| **Rust**                          | Direct equivalent | **unicode-normalization** and **regex**, with sort_by, which is stable     |
| **C#**                            | Direct equivalent | string.Normalize with NormalizationForm.FormD and LINQ's OrderByDescending |
| **Java**                          | Direct equivalent | java.text.Normalizer, java.util.regex, and List.sort, which is stable      |
| **C++**                           | Direct equivalent | **utf8proc** for NFD and std::stable_sort                                  |

The tested **C#** transcription of the gateway, whose regular expressions use RegexOptions.ECMAScript to keep \w ASCII, sits with the ai-gateway examples.

## Tolerance

The embeddings are replayed, so the cases compare every printed confidence, BM25 score, and RRF score exactly. The vectors of **Ollama**'s two embedding endpoints agree to within 4e-9 in cosine, and every printed similarity stays at least 1e-4 from a rounding boundary. The narrowest decision is the storage question's dense ranking of the icf clauses' texto, 0.006 apart, and the confidence closest to its threshold is the CSR synthesis's 0.668. The CSR synthesis and the storage question both end in an RRF tie, so a transcription that breaks it toward the sparse ranking picks another clause, sends another prompt, and fails.

## Where it appears

- modulo08-arquitetura-de-sistemas-com-ia/modulo-04-padroes-ai-especificos (in **JavaScript** and in **Python**)
