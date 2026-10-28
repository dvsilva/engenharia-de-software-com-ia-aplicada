---
name: monte-carlo-simulation
description: Forecasting an uncertain result, such as a project's finish or an investment's return, by drawing every three-point estimate from a triangular distribution thousands of times, combining the draws the way the model does, and reading percentiles, the mean, and the share of favorable runs from the sorted results.
---

# Monte Carlo simulation

## Concept

A three-point estimate gives an uncertain input, such as a story's duration or a cost, an optimistic, a most likely, and a pessimistic value. Instead of computing with single numbers, a Monte Carlo simulation draws every input from a distribution shaped by its three points, combines the draws the way the model does (a schedule in sequence, in parallel, or after a fixed date, or a stream of discounted savings), and repeats the whole computation thousands of times. Sorting the results turns them into a forecast: the value below which a given share of the runs fell, such as P50 for the likely case, P85 for a commitment, and P95 for a conservative one, next to the mean and the share of runs on the right side of a threshold. The triangular distribution is the usual shape for three-point estimates, sampled by inverting its cumulative distribution: a uniform draw below the most likely value's share of the range lands on the rising side of the triangle, and any other draw on the falling side.

## How the course implements it

The estimates and forecasts lesson of the project management module hands the PERT arithmetic to **Gemini** in **Google AI Studio** through a prompt template, which has no program to transcribe. The lesson's point is that a language model cannot sample, so the simulation runs in code, written twice with only the standard library: once in **JavaScript**, for **Node.js** or a browser's console, and once in **Python**.

Both versions hold four RouteWise stories with estimates in weeks: US-01 Alertas de Velocidade (2, 3, 5), US-03 Score de Comportamento (3, 4, 6), US-04 Sensor de Abertura de Bau (1, 2, 3), and US-09 Carga Refrigerada (2, 3, 5). Each of 10,000 runs draws all four. The software track adds US-01 and US-03 and divides the sum by 1.3 for their overlap. The hardware track starts at week 9, when the sensors arrive, and adds US-04 and US-09 divided by 1.5. A run finishes with the slower track. The results are sorted, and each percentile is the result at the position given by the percentage of the run count, rounded down, without interpolation.

The output is a rule of 50 equals signs, a header with the number of simulations, another rule, P50, P85, P95, and the mean in weeks with one decimal, and a closing rule, in Portuguese without accents. The two versions differ only in the header's thousands separator: **JavaScript** prints 10.000 in the Brazilian format, and **Python** prints 10,000 in its default one. The prompt template carries shorter copies of both scripts with other labels, and the cases follow the program files.

The software track never decides: its longest run, 11 weeks divided by 1.3, ends before the hardware even arrives, so every result is week 9 plus the hardware stories divided by 1.5, between 11 and about 14.3 weeks.

The decision framework lesson of the data processing and fine-tuning module simulates the return on fine-tuning ([investment-analysis](investment-analysis.md)) in a tool written in **JavaScript** and mirrored in **Python** with only the standard library. Each of 10,000 runs draws the monthly growth of calls and the costs per call of the status quo and of the fine-tuned model from the triangular estimates in the cases file, and computes the NPV over the horizon. The results are sorted, each percentile takes the result at the position given by the percentage of the run count, rounded down and capped at the last one, and the summary holds the mean, P5, P50, and P95 with two decimals and the share of positive results as a percentage with one decimal. Another 10,000 runs of the same draws give the gross present values whose spread is the volatility of the option to wait. The demo seeds neither generator.

## What usually goes wrong in other languages

- Integer estimates in a statically typed language turn the most likely value's share of the range into integer division, which is zero for all four stories, so every draw lands on the falling side. The printed results move by less than their single decimal (P50 prints 12.6 instead of 12.5), so the cases cannot tell, and the estimates have to be floating-point.
- **C#** and **Java** format numbers in the machine's culture, so on a Brazilian system 12.5 prints as 12,5 and the cases fail. Formatting with the invariant culture, or Locale.ROOT in **Java**, keeps the period. **Python**'s format specifications, **JavaScript**'s toFixed, **Go**'s fmt, **Rust**'s format!, and **C++**'s streams in their default locale ignore the system's culture.
- **JavaScript**'s default sort compares numbers as text, which is why the original sorts with a numeric comparator.
- Library samplers take the three points in other orders: **Python**'s random.triangular takes the low, the high, and the mode, while **NumPy**'s triangular takes the left, the mode, and the right. The original's inverse transform takes a few lines in any language and keeps the estimates in their usual order.
- Percentile helpers such as **NumPy**'s interpolate between neighbors by default instead of taking one result. With 10,000 results, the difference stays far below the printed decimal.
- The generators are unseeded, so no two runs print the same digits, in any language. A fixed seed makes one language repeatable but never matches another language's sequence.
- The em dash in the header is UTF-8, which a **Windows** console only shows with UTF-8 output.

## How close common targets get

Every target has a uniform random generator, a square root, and sorting, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                            |
| --------------------------------- | ----------------- | ------------------------------------------------------------------ |
| **Python**                        | Direct equivalent | random and math from the standard library                          |
| **JavaScript** and **TypeScript** | Direct equivalent | Math.random, Math.sqrt, and a numeric sort                         |
| **Go**                            | Direct equivalent | math/rand/v2 and slices.Sort                                       |
| **Rust**                          | Direct equivalent | **rand**, because the standard library has no random generator     |
| **C#**                            | Direct equivalent | Random.Shared, LINQ, and FormattableString.Invariant               |
| **Java**                          | Direct equivalent | ThreadLocalRandom, Arrays.sort, and String.format with Locale.ROOT |
| **C++**                           | Direct equivalent | std::mt19937_64 with std::uniform_real_distribution, and std::sort |

A tested **C#** transcription of the RouteWise simulation exists, and the tested **Rust** transcription of the fine-tuning tool, with **rand**, sits with the investment-analysis examples.

## Tolerance

The cases compare each printed value with the exact distribution instead of a recorded run. Since the hardware track always decides, P50, P85, P95, and the mean are 12.533, 13.096, 13.412, and 12.556 weeks, and each printed value must fall within 0.1 of its exact one. That admits the decimal on either side of a rounding boundary and rejects a whole decimal off. The layout must match exactly, with either thousands separator in the header. In 300 runs of each original, P50 printed 12.5 in all but 3, the mean printed 12.6 in 524 of the 600 and 12.5 in the rest, P85 always printed 13.1, and P95 always 13.4, so every run passed. The **C#** transcription passed 100 runs under a Brazilian culture.

The fine-tuning tool's summary for Amplitude Auto is compared the same way, with the exact distribution computed from five million draws: the mean at R$ 5,078.30, P5 at R$ 2,648.30, P50 at R$ 4,960.15, and P95 at R$ 7,906.35, each printed value within R$ 100, R$ 150, R$ 130, and R$ 240 of them, about six times the standard deviation that 300 runs of each original showed, and 100.0% positive exactly, since even the worst draws save more than the training costs. When the cases file raises the volume by half, the tolerances grow by half around R$ 8,818.10, R$ 5,170.40, R$ 8,643.10, and R$ 13,062.50. Each original passed 300 runs of both cases.

## Where it appears

- modulo07-ferramentas-de-ia-para-gestao-de-projetos/modulo-04-estimativas-e-previsoes (the same simulation in **JavaScript** and in **Python**)
- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-01-decision-framework (the NPV of fine-tuning and the volatility of the option to wait, in **JavaScript** and in **Python**)
