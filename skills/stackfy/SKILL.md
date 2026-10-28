---
name: stackfy
description: Invoked as "/stackfy [request]" or when the user asks to understand, explain, translate, port, transcribe, or migrate a course module, example, or exercise into another programming language or stack, such as "explain module X in Python", "transcribe module X to Go", "the examples are in Python, explain them as if they were TypeScript", "migrate the exercises from Angular to React", "I want to study this module in Rust", or "port this example to C#".
argument-hint: '[request]'
user-invocable: true
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
metadata:
  author: wellwelwel
  version: '2026.10.28'
  source: engenharia-de-software-com-ia-aplicada course modules
---

# stackfy

Explains or transcribes the course material in the language or stack the student is most comfortable with. The skill does not know every language. It knows the course, and that curated knowledge anchors the model's general knowledge of the target, so the same request about the same module leads to the same concepts, structure, and libraries instead of a different answer every time. It acts only on the student's own copy of the course, and the prompt decides what the student gets from the material that exists.

## Request

The prompt defines the scope (the whole course, a module, an example, or an exercise), the target (a language, a framework, or both), and the intent (explain or transcribe), as in these requests:

- "Explain module X with **Python**."
- "Transcribe module X to **Go**."
- "The examples are in **Python**, explain them as if they were **TypeScript**."
- "Transcribe the exercises from **Angular** to **React**."

When the prompt leaves out the target or the intent, ask for it with **AskUserQuestion**. Never ask about something the prompt already answers. Both intents follow the order of the lessons.

## Step 1: Locate the material

Resolve the scope to the folders that hold it. The student may name a module by its folder, title, topic, or lesson, as in "the **TensorFlow** module from the first lessons", so match against folder names and the modules each reference lists. A request that covers several examples takes every match, as "the exercises from **Angular**" takes every **Angular** exercise in the course. Ask, with the candidates as options and allowing several to be chosen, only when the request means one module or example and more than one fits, or when it never says which examples it means, as "the examples are in **Python**" does. For such a vague request, offer the folders whose code is in the language it names, and recommend only one the scan reports as `covered`. When nothing fits, say so and stop.

## Step 2: Scan

Run the scanner from the course root on the located folders:

```bash
node <skill-dir>/scripts/scan.mjs --scan <folder> [--scan <folder> ...] --json
```

For each module, in course order, it reports the source stack, the dependencies, the concepts it recognizes, the dependencies it does not know, the coverage, and the survey state. A folder inside a project that declares its dependencies further up, such as a lesson folder of one project, reports that project.

A `not-covered` module has no recognized concept, so the skill has nothing curated for it yet. Say so and stop, because continuing would be the same as asking without the skill. For a `partial` module, continue and mark its unknown dependencies as not covered in every output.

The survey state tells whether the module is still the one the skill was built from. A `current` module needs nothing more. A `changed` module was updated after the survey: say so, list what changed with the command below, and read those files first in step 3. A `new` module never entered the survey, even when its dependencies match known concepts: say so and continue as with a `partial` module, marking it as not surveyed in every output. An `unknown` state means the course is not in **Git**, so nothing tells whether the module changed.

```bash
node <skill-dir>/scripts/scan.mjs --changes <module> --json
```

When the prompt describes the material differently from what the scan found, such as another source language, follow the scan and point out the difference.

## Step 3: Read the references

Read the reference for each detected concept, which [concepts.md](concepts.md) links beside what the concept covers. A reference explains the concept independently of language, how the course implements it, what usually goes wrong when it moves to another language, how close common targets get, and where it appears in the course. Also read the tested transcriptions for that concept and target when they exist, under the concept's folder in the examples, because they set the expected style, depth, and libraries.

References describe the course as it was surveyed. When a module's current code disagrees with its reference, as a `changed` module's may, follow the code and mention the difference.

Then print a summary with each concept, the folders in the request's scope where it appears, leaving the rest of the course to its reference, and how close the target gets to it: a direct equivalent, only a substitute, or nothing comparable.

## Step 4: Explain

Write in the same natural language as the conversation. After the summary from step 3, give each of these parts its own heading, named as below in that language and kept in this order:

1. What the module teaches: the lesson in a few sentences.
2. Concept map: each concept as the original implements it and as the target would.
3. Walkthrough: each original passage, cited as file:line, paired with its equivalent in the target, so the student can follow the lesson while reasoning in the target.
4. What really changes: differences such as the concurrency model, typing, error handling, or package management, including the pitfalls the references list.
5. How to run it: how the module would run in the target.

Explaining never writes files.

## Step 5: Transcribe

Before writing, show the plan (which examples, in which order, and where) and confirm it. When the prompt does not name a destination, suggest a folder beside each original, named after it with the target appended after a dot, as in `exemplo-00-z.python`, so later requests can find it.

Look for the student's earlier transcriptions to the same target:

```bash
node <skill-dir>/scripts/scan.mjs --transcriptions --target <target> --json
```

When there are any, reuse their libraries and conventions instead of choosing new ones. Unless the prompt asks otherwise, mirror the original file by file, with the same names adapted to the target's naming conventions, so both versions can be compared side by side. When the scan reports one module twice because it holds the same program in two languages, the original is the one the student names, or else the first one reported in a language other than the target, and the plan says which. Write each file from the original: the tested transcriptions anchor style, depth, and libraries, but are never templates to copy, even when the result ends up matching one. Give each transcription the ignore file a new project in the target would have, so build output and installed dependencies never reach **Git**. Work one example at a time.

When the target has no equivalent for a concept, follow its reference: use the recommended substitute, or explain that part instead of transcribing it.

## Step 6: Verify

After transcribing, check the target's toolchain, which for a framework is its language's:

```bash
node <skill-dir>/scripts/scan.mjs --toolchain <target> --json
```

If it is missing, explain how to install it, using the address the result gives, and mark the transcription as not verified. If it is installed, install the transcription's dependencies and run the module's pre-tested cases against it, naming the cases file after the module id the scan reported, as `<module>.json`, or `<module>/index.json` when the module is a whole course module, so every course module keeps its cases in its own folder:

```bash
node <skill-dir>/scripts/run.mjs --case <skill-dir>/cases/<module>.json --cwd <transcription> --cmd "<command that runs it>"
```

A cases file that names another under `extends`, relative to itself, holds only what differs from it, and every script reads both as one cases file: its own fields replace the inherited ones, and its own cases replace those with the same name and follow the rest.

The runner serves recorded LLM responses through a local endpoint and passes its address to the command as OLLAMA_HOST and OPENAI_BASE_URL, and the cases point the variable another provider's client reads, such as ANTHROPIC_BASE_URL or GOOGLE_GEMINI_BASE_URL, to it, so LLM calls are compared by structure (which endpoint, model, and prompt) instead of by generated text. When the prompt names an absolute path that the model repeats in a tool call, the recorded call names the same file inside the transcription's folder. Numerical results are compared within the tolerance the reference gives.

When the module holds several programs, each case names its program, and the command refers to it as `{program}`, as in `--cmd "python {program}.py"`. A case's arguments follow the command, unless the command places them with `{args}`, as one that chooses its program inline must. When the transcription moves only part of the module, such as the frontend of a module whose api keeps the original stack, the command starts each program left in place from the original's folder, the way the cases file records running it, as cfp-platform's **React** frontend does with `--cmd 'if [ {program} = api ]; then cd ../cfp-platform && NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false npx nx serve api --inspect=false; else cd frontend && npx vite --port $PORT --host 127.0.0.1 --strictPort; fi'`. Install those programs' dependencies there without changing the original's files, as `npm ci` does, or `npm install --no-save` when the lock file is out of sync.

- When the module is a server, the command must start it on the PORT it receives, and the runner sends it the recorded requests, files included as multipart forms, filling in values the server generated, such as ids, from its earlier responses, and compares each answer's status, body, and the headers the cases name, such as a request id or CORS. When the server limits how often a caller may call it, the runner repeats a recorded request as many times as the limit allows, in a row, and compares only the last answer, so the transcription must count every one of them. When the server keeps working after it answers, such as learning from the turn with another LLM call, the cases give it time to settle after each response, so that work must finish within it. When the server sends itself a question as soon as it listens and keeps serving, the runner waits for the answer it prints before sending the recorded requests.
- When the module is an MCP server over standard input and output, the runner starts it, writes each recorded message as a line, waits for the answer to every request, closes its input, and compares the answers, with tools and prompt arguments in any order, since each SDK lists them its own way, and a text that holds JSON by its value, so its spacing and key order are free.
- When the module is an interactive program that reads one line per prompt, the runner types each recorded line only after the program shows its prompt again, so the transcription must show the same prompt, flushed, before every read.
- When the module is a bot that opens a WebSocket, such as a **Slack** app in Socket Mode, the cases point its API address to the replay, which hands out its own socket, and once the bot connects, the runner sends the recorded messages over it and compares the acknowledgements the bot sends back and the calls it makes, so the transcription keeps the same protocol.
- When the module also calls other HTTP services, such as a status page, the cases name the variables that hold their addresses and the runner points them to its replay too, comparing the query parameters each call sends. When it calls one at a fixed address, such as the customers API an MCP server always reaches at localhost:9999, the cases have the replay listen on that port, which must be free, and its recorded answers can require the headers the original sends, such as a bearer token.
- When a case starts from files, such as a data store or a **SQLite** database, the runner writes them in the transcription's folder before the command runs and restores what was there afterwards. When the module reads its key from a .env file, the cases write that file and remove the variable from the command's environment, and the replay answers only the bearer key the original sends, so the transcription loads .env the same way. When the module reads a public file the student downloads first, such as a dataset from **Hugging Face**, the runner downloads it once, checks its SHA-256, keeps it for later runs, and writes it there the same way. When the program writes files named after the moment it writes them, such as an answer per question, the cases match each one by its name's pattern among the files written during the run, so the transcription keeps the folder and the shape of the name.
- When the module runs a command-line tool for something it cannot do itself, such as `gcloud` for an access token, the cases record what the tool printed, and the runner puts a stand-in first on PATH that answers the same arguments the same way, so the transcription runs the same command instead of a library. A path the program passes inside its own folder, such as an adapter beside it, is expected inside the transcription's folder, one in a sibling lesson's folder only by its end, and when the tool is the one that starts the transcription too, such as `python3` running `mlx_lm`, the stand-in lets every call it does not record through to the installed tool.
- When the module is a page, the command serves it the same way, and the runner opens it in headless **Google Chrome** or **Chromium**, acts on it as the cases describe, and compares what it shows. It fills fields, chooses files, and presses keys as a user would, so any framework's form bindings see the change, and fixes the time zone and the color scheme when the cases name them, so dates and themes follow the browser as in the original. When the page calls the module's own API, the cases point the variable its dev server proxies to at the replay, or type the replay's address where the page lets the user set the API's, which it then calls across origins. The replay answers what the API answered and holds some answers long enough to read the page's loading state. When the page draws on a canvas, the cases read what it shows through a script that runs before the page's own, so the transcription keeps the drawing library the original uses. When the page uses models built into the browser, such as a language model or a translator, that script stands in for them with recorded answers, so the transcription calls the same browser APIs.
- When the module is an end-to-end suite, the cases name the spec as an argument and set BASE_URL, so the command serves the page there, runs that spec against it, and stops the page afterwards, and the runner compares the suite's exit code and what the page sent to the replay.
- When the module is an exercise with a starting point and a reference solution, the cases run its test suite, or each level's, against each one and compare only whether it fails, and they reach the solution's functions or classes through the driver its reference describes, so the transcription writes that driver too.
- When the module needs infrastructure, such as a database or the API an MCP server wraps, the runner brings it up with **Docker** the way the original does and removes it afterwards, so **Docker** must be running. When the module is a package published to a private registry, the runner brings the registry up the same way, and the cases publish the package there and then start it by name through the package runner, as an MCP client does, so the transcription keeps the package's name and its executable's. When the module sends telemetry to that infrastructure, such as **Loki** or **Prometheus**, the runner queries it too, repeating each query until it shows what the module sent, and carries the session header from one answer to the next, as an MCP server over HTTP requires. When the module stores data there, such as chunks and a vector index in **Neo4j**, the runner queries it once the program exits and compares what it holds, so the transcription keeps the same labels, properties, and indexes.

When a case fails, fix the transcription and run the cases again. A `changed` module's cases were recorded before its update, so when a failing case checks behavior the changed files touch, report the case as possibly outdated instead of bending the transcription to it. A module without a cases file stays not verified, and so does the part of a module whose cases file records `blocked`: say in the report what its `reason` leaves without cases and what its `completion` would take to cover it.

Finish with a report covering the files created, the libraries chosen and why, how to run the transcription, and the verification result.

## Using the scripts directly

```
node scan.mjs --scan <path> [--scan <path> ...] [--root <dir>] [--json]
node scan.mjs --transcriptions --target <name> [--root <dir>] [--json]
node scan.mjs --toolchain <target> [--json]
node scan.mjs --audit [--root <dir>] [--json]
node scan.mjs --changes <path> [--root <dir>] [--json]
node scan.mjs --stamp <path> [--stamp <path> ...] [--example <concept>/<target>/<name> ...] [--from <path>] [--root <dir>] [--json]
node scan.mjs --forget <path> [--forget <path> ...] [--root <dir>] [--json]
node run.mjs --case <cases.json> --cmd "<command>" [--cwd <dir>] [--root <dir>] [--host <host>] [--browser <path>] [--timeout <ms>] [--json]
node run.mjs --case <cases.json> --original [--root <dir>] [--host <host>] [--browser <path>] [--timeout <ms>] [--json]
node record.mjs --upstream <url> --out <file.json> [--cmd "<command>"] [--cwd <dir>] [--host <host>] [--port <n>] [--model <name>] [--timeout <ms>]
```

When the transcription runs inside a container, start the runner with the host set to every interface and point the container to the host's replay port.

The audit, stamping and forgetting, the original's replay, and the recorder serve technical support, never the student, as [upkeep.md](upkeep.md) describes.

Exit codes:

- `scan.mjs`: `0` success, toolchain installed, or nothing for the audit to report, `1` the audit found something to cover, `2` path not found, toolchain missing or unknown, course not in **Git**, or a folder or tested transcription the lock cannot record, `64` invalid arguments.
- `run.mjs`: `0` every case passed, `1` at least one case failed, `2` cases file missing or invalid, its services did not start, it records no command for the original, or the original's copy could not be prepared, `64` invalid arguments.
- `record.mjs`: `0` recording written, `2` upstream invalid or recording not written, `64` invalid arguments.
