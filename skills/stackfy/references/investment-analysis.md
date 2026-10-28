---
name: investment-analysis
description: Deciding whether a one-time cost pays for itself through recurring savings, with a net present value discounted month by month, its breakeven month, a ranking of the inputs by how far they move it, and the value of waiting priced on a binomial tree.
---

# Investment analysis

## Concept

An investment pays a cost now for savings later. Dividing each month's saving by (1 + r)^m, where r is the monthly discount rate and m the month, brings it to today's money, and the net present value (NPV) is the sum of the discounted savings minus the cost. The breakeven month is the first in which the running NPV turns positive. Sensitivity analysis moves one input at a time up and down by the same percentage, keeping the others at their most likely values, and ranks the inputs by how far the NPV swings, which is the order of a tornado chart.

When the decision can wait for information, a real option prices the wait. A Cox-Ross-Rubinstein binomial tree lets the value of the savings move up by u = e^σ or down by d = 1/u each step, where σ is its volatility per step, with the risk-neutral probability p = (e^r - d) / (u - d). Each final node pays the value minus the cost when that is positive and nothing otherwise, and stepping back through the tree weighs each pair of nodes by p and 1 - p and discounts them by e^r. The value of waiting is the option's value today minus the value of investing now.

## How the course implements it

The decision framework lesson of the data processing and fine-tuning module asks whether fine-tuning pays for itself, in the same tool as its four-question gate ([decision-framework](decision-framework.md)), written in **JavaScript** and mirrored in **Python** with only the standard library. Every business figure comes from the cases file beside the tool: the monthly volume of calls, their monthly growth, the cost per call of the status quo (prompt plus RAG) and of the fine-tuned model, the training cost, the horizon in months, and the monthly discount rate. The growth and both costs are triangular estimates, and the deterministic analysis takes their most likely values. Later lessons of the module import the tool's NPV function, each version from the file in its own language.

The NPV starts at minus the training cost. Each month from the first grows the volume, then adds the volume times the difference between the two costs per call, divided by (1 + r)^m, except during an optional delay, when nothing is saved. The result is rounded to two decimals, and the breakeven is the first month with a positive running NPV, or none. For Amplitude Auto, which passes the gate, the demo prints the training cost, the NPV over 24 months, the breakeven month, the Monte Carlo summary of the same NPV ([monte-carlo-simulation](monte-carlo-simulation.md)), and the sensitivity: the growth, both costs per call, and the training cost, each moved by 20% down and up, ranked by the absolute difference between the two NPVs, rounded to two decimals.

Amplitude Saúde Empresarial fails the gate only for lack of data, the one failure that time resolves, so the tool prices the option to wait. The wait lasts the months the data score needs to reach its target at its expected monthly growth, rounded up. The underlying value is the gross present value of the savings, the NPV plus the training cost, in the most likely scenario. Its volatility is the sample standard deviation of the logarithm of each of 10,000 gross present values drawn from the triangular estimates, divided by their median, and each step of the tree is one month, discounted at the monthly rate. Investing now adds the expected cost of errors from insufficient data to the fine-tuned cost per call, and its value is the gross present value minus the training cost, or zero. A positive value of waiting recommends waiting, and any other recommends fine-tuning. The volatility, u, d, and p are rounded to four decimals and money to two, and the demo prints the months to wait, the volatility as a percentage, u, d, p, the gross present value, the value of investing now, the option's value, the value of waiting, the recommendation, and the lesson where the case is reassessed.

The LoRA and PEFT lesson reopens that NPV for a regional partnership of 400 calls a month, growing 3% a month, at the same costs per call over 24 months, comparing a GPU rented for R$ 2,400 a job with local LoRA at no fixed cost ([parameter-efficient-fine-tuning](parameter-efficient-fine-tuning.md)). The rented GPU never breaks even, at R$ -2,040.99, local LoRA earns R$ 359.01 and breaks even in the first month, and the demo multiplies the fixed cost by five partnerships.

The versions differ only in the labels of the Real Options block and in p, which **JavaScript** prints without trailing zeros.

## What usually goes wrong in other languages

- The volume grows before each month's saving, so the first month already uses the grown volume. Growing it after the saving shifts every month.
- The NPV discounts by (1 + r)^m and the tree by e^r per step. Using one formula for both changes the option's value.
- The gross present value adds the training cost back to the NPV after rounding it to two decimals, as the originals do.
- The volatility is a sample standard deviation, divided by n - 1, while **NumPy**'s std divides by n unless ddof is 1.
- The sensitivity ranking keeps the input order between equal swings, which **JavaScript**'s sort and **Python**'s sort guarantee, while **Go**'s sort.Slice and **C++**'s std::sort do not, so those use sort.SliceStable and std::stable_sort.
- Money prints with a period as the decimal separator, so **C#** formats with the invariant culture and **Java** with Locale.ROOT, as [monte-carlo-simulation](monte-carlo-simulation.md) explains.
- Later lessons import the NPV and the gate from the tool, so its self-checks and demo run only when it is the program started, behind require.main in **JavaScript** and the main guard in **Python**, and a transcription keeps its functions importable the same way.

## How close common targets get

Every target has floating-point arithmetic, exponentials, logarithms, and sorting, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                      |
| --------------------------------- | ----------------- | ------------------------------------------------------------ |
| **Python**                        | Direct equivalent | math from the standard library                               |
| **JavaScript** and **TypeScript** | Direct equivalent | Math and a numeric comparator                                |
| **Go**                            | Direct equivalent | math and sort.SliceStable                                    |
| **Rust**                          | Direct equivalent | f64's methods and sort_by with total_cmp                     |
| **C#**                            | Direct equivalent | Math, a stable OrderByDescending, and the invariant culture  |
| **Java**                          | Direct equivalent | Math, a stable List.sort, and String.format with Locale.ROOT |
| **C++**                           | Direct equivalent | cmath and std::stable_sort                                   |

A tested **Rust** transcription of the tool exists, with the GRPO demo of the same lesson beside it.

## Tolerance

The NPV, the breakeven, the sensitivity, the months to wait, the gross present value, the value of investing now, and the regional comparison are deterministic and compared exactly. The volatility comes from unseeded draws, and so do u, d, p, the option's value, and the value of waiting. Five million draws put the volatility at 25.22%, u at 1.2868, d at 0.7771, p at 0.4570, and the option to wait 9 months at R$ 228.86, and each printed value must fall within 1 percentage point, 0.013, 0.008, 0.004, and R$ 18 of them, about six times the standard deviation that 300 runs of each original showed. When the cases file shortens the wait to 5 months, the option is worth R$ 115.85, within R$ 12. Each original passed 300 runs of both cases.

## Where it appears

- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-01-decision-framework (the NPV, the sensitivity, and the option to wait, in **JavaScript** and in **Python**)
- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-04-lora-e-peft (the NPV of a regional partnership with a rented GPU and with local LoRA, imported from the first lesson's tool)
- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-05-avaliacao-modelos (the projected NPV recomputed with the measured training cost, imported from the first lesson's tool, in **JavaScript** and in **Python**)
