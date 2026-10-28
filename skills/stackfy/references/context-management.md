---
name: context-management
description: Keeping an agent's prompt within the context window, from estimating tokens per prompt section and reading the provider's real usage to cutting each section to its own budget in one place and folding the history that leaves the window into a rolling summary, as OpsPilot does.
---

# Context management

## Concept

Everything an agent sends on a turn competes for one context window: the system prompt, a summary of older turns, the recent history, recalled memories, and the new message. A long conversation fills it, costs more on every call, and buries early decisions under recent chatter, which is known as context rot. Managing the context means measuring each source, assembling the prompt in a single place where every section has a token budget and its own rule for what to cut, and compressing the turns that leave the recent window into a summary instead of dropping them. A rough estimate, such as four characters per token, is enough for budgeting, while the usage the provider reports tells what a call really cost.

## How the course implements it

Unit 5 measures, summarizes, and budgets OpsPilot's chat turns ([conversation-memory](conversation-memory.md)).

A token is estimated as a text's length divided by four and rounded down, with the length counted the way **JavaScript** counts it, in UTF-16 code units. Every strategy reports promptTokens, the sum of the prompt tokens the provider reported for the calls of its run ([reasoning-strategies](reasoning-strategies.md)): ReAct counts its agent's calls but not the history's messages, plan-and-execute counts the agents of its steps but not the planner or the replanner, and reflection adds up its runs without the critic. When no call reports usage, the field is absent. The chat API's metrics also gain contextBreakdown, five estimates of what the turn sent, always present: system for the system prompt, history for the history as "role: content" lines, memories for the memories as "- " lines, message for the bare message, and summary for the summary, each one after its cut and without the headings that wrap it ([rest-api](rest-api.md)).

The window holds the 8 latest messages, and a conversation_summaries table keeps one summary per conversation, with how many of its oldest messages it covers and when it last changed ([sql-database](sql-database.md)). Before loading the history, each turn checks whether at least eight messages beyond those the summary covers have left the window. When they have, it sends the next eight, in insertion order, to the summarizer, a plain chat call ([chat-model](chat-model.md)) whose Portuguese system prompt asks for at most 150 tokens of terse topics that keep decisions, established facts, incidents, and open items. Its user message holds "Resumo anterior:" and the previous summary on the next line, or "Resumo anterior: (nenhum)", then a blank line and "Trecho a comprimir:" followed by the batch as "role: content" lines. The trimmed answer replaces the summary, cut to 600 characters when its estimate passes 150, the covered count grows by eight, and the turn's trace starts with a summarize event holding the stored text. A turn summarizes one batch at most, and any failure, an empty answer included, keeps the previous summary without breaking the turn.

One pure function builds every turn's context from the system prompt, the summary, the latest messages, the recalled memories ([semantic-memory](semantic-memory.md)), and the message. Each section has a budget in estimated tokens, read from CONTEXT_BUDGET_SUMMARY (200 by default), CONTEXT_BUDGET_HISTORY (1200, with CONTEXT_BUDGET_WINDOW as an older name), and CONTEXT_BUDGET_MEMORIES (300). CONTEXT_BUDGET_SYSTEM is read but never cuts, and the message is never cut either. The summary is truncated to four characters per token of its budget. The history drops its oldest message while its estimate exceeds the budget, and a single message that still does not fit is truncated instead, its "role: " prefix included in the count. The memories drop the lowest score while their estimate exceeds the budget, the later one on a tie, the survivors keep their order, and a single memory that does not fit is truncated, its "- " prefix included. A budget of zero or less empties its section. The strategy receives the fitted history and a message made of "Conversation summary:", the summary, and a blank line in front of the memories block and the message, while the conversation stores the bare message.

The unit's specs for measuring, summarizing, and budgeting come from **Spec Kit** ([coding-agent-harness](coding-agent-harness.md)), and scripts/conversa-longa.sh drives a thirty-turn conversation that shows the summary keeping the deploy freeze decision of its third turn, printing promptTokens on every turn ([command-line-interface](command-line-interface.md)).

Unit 6 runs the same steps in the production graph's context node ([state-graph](state-graph.md)), so the summarizer's call still comes first in a turn, ahead of the reflector's and the router's, and the summarize event carries the node contexto. The router's prompt is neither measured nor cut, and promptTokens still counts only the strategy's calls.

## What usually goes wrong in other languages

- Lengths and cuts count UTF-16 code units, as strings do in **Java** and **C#**. **Python** counts code points, which only differ for characters outside the Basic Multilingual Plane, such as emoji, while **Go** and **Rust** count bytes, so every accented letter would count twice. Those three measure and cut the UTF-16 encoding, such as **Go**'s utf16.Encode or **Rust**'s encode_utf16.
- A section fits while its estimate, rounded down, does not exceed the budget, so it may run three characters past four per token, while a truncation cuts to exactly four per token.
- The summary in the prompt is cut to its budget, while the stored summary, the summarize event, and the previous summary handed to the next batch stay whole. A summary cut to 600 characters is stored as cut, even when it ends in a space, and only the prompt and the breakdown trim it.
- Summarizing waits for a full batch of eight messages outside the window, so until the next batch, the messages that left the window are in neither the summary nor the history. Summarizing each message as it leaves changes every later prompt.
- The summarizer runs before the strategy and before the memories are recalled, so its call comes first among the turn's requests. It reads the stored messages, which never include the current one.
- The breakdown counts the bare message and each section without its heading, so it never adds up to the prompt's size, and it keeps all five keys at zero when sections are empty.
- promptTokens is left out, not written as zero or null, when no call reported usage. **LangChain** for **Python** exposes the usage as usage_metadata on the model's message, like **JavaScript**, and the OpenAI SDKs as usage.prompt_tokens on the response.
- Budgets follow **JavaScript**'s number conversion: a blank or non-numeric value means the default and a fraction is truncated toward zero. **Python**'s int rejects 12.5, so a transcription converts with float and truncates. CONTEXT_BUDGET_WINDOW counts only when CONTEXT_BUDGET_HISTORY is not set at all, and a blank CONTEXT_BUDGET_HISTORY means the default.

## How close common targets get

Every target can count, cut, and sum integers, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                                    |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | The UTF-16 encoding of str for lengths and cuts, and sqlite3               |
| **JavaScript** and **TypeScript** | Direct equivalent | String length and slice, and node:sqlite                                   |
| **Go**                            | Direct equivalent | unicode/utf16 for lengths and cuts, and **modernc.org/sqlite**             |
| **Rust**                          | Direct equivalent | encode_utf16 and String::from_utf16 for lengths and cuts, and **rusqlite** |
| **C#**                            | Direct equivalent | string.Length and Substring, and **Microsoft.Data.Sqlite**                 |
| **Java**                          | Direct equivalent | String.length and substring, and **sqlite-jdbc**                           |
| **C++**                           | Direct equivalent | std::u16string converted from UTF-8, and SQLite's C API                    |

No tested transcription exists yet.

## Tolerance

The estimates come from replayed texts and promptTokens from replayed usage, so the cases compare both exactly. The summaries are the model's, replayed, so the cases compare them exactly too, in the summarize event and in every later request that carries them.

## Where it appears

- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos
- modulo04-criacao-de-agentes-autonomos-novo/05-gerenciamento-de-contextos/scripts
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos
- modulo04-criacao-de-agentes-autonomos-novo/06-langgraph-e-workflows-complexos/scripts
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia
- modulo04-criacao-de-agentes-autonomos-novo/07-observabilidade-e-limites-de-autonomia/scripts
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado/scripts
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems/scripts
