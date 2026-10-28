---
name: verifiable-reward
description: A grader that scores a model's structured answer against an answer key field by field, and GRPO's group-relative advantage, which turns the rewards of several answers to the same prompt into signals that reinforce or penalize each one.
---

# Verifiable reward

## Concept

Reinforcement fine-tuning needs a reward for every answer the model gives. When the task has a checkable answer, such as fields extracted from a document, the reward is verifiable: a grader compares the answer with an answer key, and no learned reward model is involved. GRPO (Group Relative Policy Optimization), the algorithm behind DeepSeek-R1 and the idea behind **OpenAI**'s reinforcement fine-tuning, samples a group of answers to the same prompt, rewards each one, and uses the group as its own baseline. The advantage of each answer is its reward minus the group's mean, divided by the group's standard deviation: a positive advantage reinforces the answer and a negative one penalizes it, with no separate value model as in PPO. When every answer earns the same reward, the standard deviation is zero, every advantage is zero, and the group teaches nothing, which DAPO's dynamic sampling handles by discarding such groups and sampling again.

## How the course implements it

The decision framework lesson of the data processing and fine-tuning module demonstrates the part of GRPO that produces the learning signal, without training anything, in a demo written in **JavaScript** and mirrored in **Python** with only the standard library.

The prompt asks for JSON alone with six fields extracted from a claim notice scanned with OCR noise: the claimant's name, the claim type, the incident date as DD/MM/AAAA, the estimated amount in reais as a number, the status, and a priority that is alta above R$ 5,000 and baixa otherwise. The notice garbles the name with digits, offers two dates, and writes letter O for zero in the amount. Extraction takes the text from the first opening brace to the last closing one and parses it, giving nothing when there is no brace or the JSON is invalid. The reward is the share of the six fields that match the answer key: the amount when it converts to a number within 0.01 of the key's, and every other field when its text, trimmed and lowercased, equals the key's, so an accent the key lacks, or one it has that the answer drops, misses. An answer without JSON earns zero. The advantage divides by the population standard deviation, replaced by 0.0001 when it is zero.

The demo first runs ten self-checks of the extraction, the reward, and the advantage, printing an [OK] or [FALHOU] line for each and a total. It then names the model, gemma4:e2b, the group size, 6, and the temperature, 1.0, and sends a connection test, the prompt teste de conexao at temperature 0.1, through **Ollama**'s native generation endpoint ([llm-http-api](llm-http-api.md)). When that call fails, it prints the address and the error, suggests starting **Ollama** and checking the model, and ends with exit code 0. Otherwise it sends the extraction prompt six times at temperature 1.0 and prints, for each answer, its position, its reward with two decimals, whether it held valid JSON, and its divergences, each field that missed with the value it got and the key's. A failed call prints its position and is left out of the group. Then come the group's mean and standard deviation with three decimals, and either a table with each answer's position within the group, its reward, its advantage with three decimals, and whether it would be reinforced, penalized, or left neutral, or, when every reward is the same, an explanation of the degenerate group. A note on the advantage formula ends the output.

The **Python** version writes its prose without accents, booleans as True and False, the temperature as 1.0, and the divergences as a list of **Python** reprs, while the **JavaScript** version writes the list as JSON.

## What usually goes wrong in other languages

- Lowercasing depends on the locale in **Java** without Locale.ROOT and in **C#** without ToLowerInvariant, where a Turkish culture lowercases I to a dotless i. The grader compares in the invariant form.
- The amount may arrive as a number or as text such as "8450.00", and both convert. **Go**'s encoding/json and **Rust**'s serde_json hand back either kind, so the grader accepts a number and parses a string.
- A missing field converts to an empty string in **JavaScript** and to None in **Python**, and neither matches the key, so a transcription only has to make sure a missing field never matches.
- The advantage divides by the population standard deviation. **Python**'s statistics.stdev and most libraries' sample deviation divide by n - 1 instead.
- A degenerate group must give exactly zero. **Python**'s fmean and pstdev compute exactly, while a plain sum divided by the count can leave a tiny deviation for some rewards. Rewards here are multiples of one sixth, whose plain sum over six answers comes back exact, so both originals agree.
- The table numbers the answers by their position within the group, so a failed call shifts the positions after it, while the per-answer lines keep the position of the call.

## How close common targets get

Every target has an HTTP client, a JSON parser, and floating-point arithmetic, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                 |
| --------------------------------- | ----------------- | ------------------------------------------------------- |
| **Python**                        | Direct equivalent | urllib.request, json, re, and statistics                |
| **JavaScript** and **TypeScript** | Direct equivalent | fetch and JSON                                          |
| **Go**                            | Direct equivalent | net/http, encoding/json, and regexp                     |
| **Rust**                          | Direct equivalent | **reqwest** with its blocking client and **serde_json** |
| **C#**                            | Direct equivalent | HttpClient and System.Text.Json                         |
| **Java**                          | Direct equivalent | java.net.http and **Jackson**                           |
| **C++**                           | Direct equivalent | **cpp-httplib** and **nlohmann/json**                   |

The tested **Rust** transcription of the GRPO demo sits with the investment-analysis examples.

## Tolerance

Once the answers are fixed, the grader and the advantages are deterministic, so the cases replay recorded answers and compare every reward, divergence, mean, standard deviation, and advantage exactly. They accept the prose with or without accents, booleans in either case, the temperature as 1 or 1.0, and each divergence as JSON or as a **Python** repr. The requests are compared by structure: the model, the prompt, stream false, and the temperature, 0.1 for the connection test and 1 for the six samples.

## Where it appears

- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-01-decision-framework (the GRPO demo, in **JavaScript** and in **Python**)
