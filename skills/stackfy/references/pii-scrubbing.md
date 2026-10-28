---
name: pii-scrubbing
description: Removing personal data from a document before it becomes a training example, by finding structured identifiers with a format pattern confirmed by their check digits, such as the Brazilian CPF, and names anchored on known labels, and replacing each with a placeholder while the fields the task needs stay intact.
---

# PII scrubbing

## Concept

A fine-tuning dataset built from customers' documents carries their personal data, and a model trained on it can memorize and leak that data, while every copy of the dataset, checkpoint, or log widens the exposure that laws such as LGPD regulate. Scrubbing finds personally identifiable information (PII) and replaces it with a placeholder before the document becomes an example, keeping the data the task needs, such as a plate or an amount, which identifies no one.

Structured identifiers are found by their format and confirmed by their own rules. The Brazilian CPF has eleven digits, often written as 000.000.000-00, and its last two are check digits computed by modulo 11: each of the first nine digits is multiplied by a weight from 10 down to 2, and the remainder of the sum divided by 11 gives the first check digit, 0 when it is below 2 and 11 minus it otherwise. The second repeats the rule over the first ten digits with weights from 11 down to 2. A sequence of one repeated digit passes the arithmetic but is never a real CPF. Checking the digits keeps an arbitrary eleven-digit number, such as a protocol, from being redacted. Names have no format, so a pattern anchored on the label that precedes them, such as Segurado:, finds them with high confidence, while a name in free text needs named entity recognition (NER), as **Microsoft Presidio** combines with its patterns. The legal basis for using the data at all is a separate gate that runs before ([decision-framework](decision-framework.md)), and scrubbing is one step of preparing the dataset ([dataset-preparation](dataset-preparation.md)).

## How the course implements it

The dataset preparation lesson of the data processing and fine-tuning module scrubs documents in a gate written in **JavaScript** and mirrored in **Python** with only the standard library. It takes no input and reads nothing.

A CPF is any match of \b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b, so the dots and the hyphen are optional, and it is valid when its digits are eleven, not all the same, and end with both check digits. A name is the group after Segurado, Beneficiário, Beneficiario, or Nome do segurado, a colon with spaces or tabs around it, and two to five words on the same line, each starting with a capital letter, accented capitals included. Scanning a document lists every CPF found with whether it is valid and every anchored name, then replaces every occurrence of each valid CPF's text with [CPF_REDIGIDO] and then of each name with [NOME_REDIGIDO]. An invalid CPF stays in the text.

Eleven self-checks run first, covering the check digits, the anchored names with and without the accent, a text without a known label, and two full scans, printing an [OK] or [FALHOU] line each under == Testes: titles and a total. A failed check raises before the gate. The gate then scans two hardcoded documents, a workshop estimate and a medical receipt with the same test CPF, 111.444.777-35, and prints each one's text before scrubbing, how many names and valid CPFs it found, and its text after, with the plate and the amount untouched. A note on what the label anchor misses ends the output. The **Python** version writes its prose without accents.

## What usually goes wrong in other languages

- \w matches only ASCII letters in **JavaScript** without the u flag, in **Go**'s RE2, and in **Java** without UNICODE_CHARACTER_CLASS, and any Unicode letter in **Python**, **C#**, and **Rust**. The name pattern adds the ranges À-Ú and À-ú itself, so accented names match everywhere, and those ranges also take × and ÷, as the originals do.
- \d matches any Unicode decimal digit in **Python**, **C#**, and **Rust**, and **Python**'s str.isdigit, which the **Python** version uses to keep the digits, also takes superscripts such as ². Writing [0-9] and comparing with '0' to '9' keeps a CPF to ASCII digits in every language, which is all these documents hold.
- **JavaScript**'s global expressions keep lastIndex between calls, which the original resets before each scan. **Python**'s finditer, **Go**'s FindAllStringSubmatch, and **Rust**'s captures_iter start fresh.
- The repeated-digit check uses the backreference ^(\d)\1{10}$, which **Go**'s RE2 and **Rust**'s **regex** lack, so a loop compares every digit with the first.
- Redaction replaces every occurrence of the literal text. **JavaScript**'s String.replace with a string replaces only the first, hence split and join, and **Java**'s replaceAll reads its argument as a pattern, while **Python**'s str.replace, **Go**'s strings.ReplaceAll, **Rust**'s str::replace, **C#**'s string.Replace, and **Java**'s String.replace replace every literal occurrence.
- Both lists keep the order the matches appear in.
- Accented output reaches a **Windows** console only with UTF-8 enabled.

## How close common targets get

Every target has regular expressions and string replacement, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                            |
| --------------------------------- | ----------------- | ------------------------------------------------------------------ |
| **Python**                        | Direct equivalent | re                                                                 |
| **JavaScript** and **TypeScript** | Direct equivalent | RegExp with the g flag                                             |
| **Go**                            | Direct equivalent | regexp, with a loop in place of the backreference                  |
| **Rust**                          | Direct equivalent | **regex**, with a loop in place of the backreference               |
| **C#**                            | Direct equivalent | System.Text.RegularExpressions with [0-9]                          |
| **Java**                          | Direct equivalent | java.util.regex and String.replace                                 |
| **C++**                           | Direct equivalent | std::wregex over wide strings, or **ICU**, for the accented ranges |

No tested transcription of the gate exists yet.

## Tolerance

The gate is deterministic, so its output is compared exactly, with or without accents in the prose, while the self-check report is compared only by its total.

## Where it appears

- modulo09-processamento-de-dados-e-fine-tuning-de-modelos/modulo-02-preparacao-datasets (the CPF and name gate before fine-tuning, in **JavaScript** and in **Python**)
