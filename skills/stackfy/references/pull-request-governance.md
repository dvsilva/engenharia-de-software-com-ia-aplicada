---
name: pull-request-governance
description: Turning a team's pull request conventions into rules that CI evaluates on every pull request, reading its title, description, changed files, reviews, size, and test coverage, and reporting failures that block the merge, warnings that do not, and informative messages, with Danger or against the GitHub REST API.
---

# Pull request governance

## Concept

Governance as code turns the conventions a team agrees on for pull requests into rules that a CI job evaluates before any merge. Each rule reads facts about the pull request: its title and description, the files it changes, its reviews, how many lines it adds and removes, and reports that earlier CI steps produce, such as test coverage. A verdict has three levels: a failure blocks the merge, a warning only alerts, and a message informs. The job reports every verdict on the pull request and fails when any rule failed, so branch protection keeps the merge locked. **Danger** is the usual runtime for these rules: it gathers the pull request from the code host into one DSL, runs a file of rules called a Dangerfile, and reports the result as text, a comment, or a commit status. The same rules can also call the code host's API themselves.

## How the course implements it

The governance and compliance lesson of the project management module hands the writing of a Dangerfile and of a compliance checklist to **Gemini** in **Google AI Studio** through prompt templates and saved outputs, which leave nothing to transcribe. Its code is two programs that apply five rules to the RouteWise project, configured at the top of each: the card prefix ROUTEWISE, the critical paths src/integrations/gps, src/services/notifications, src/api/routes, migrations/, .env, and docker-compose, two approvals for critical files, a warning above 500 changed lines, and a warning when line coverage drops more than 5 points.

1. The title or the description must hold the prefix, a hyphen, and digits, in any case, or the check fails.
2. When a changed file's path contains a critical path anywhere, the pull request needs two reviews in the APPROVED state, or the check fails listing the critical files. Other review states never count, and enough approvals give a message. Without critical files, the rule says nothing.
3. More than 500 added and removed lines give a warning.
4. The line percentage of coverage/coverage-summary.json, in the json-summary format of **Jest**, is compared with coverage/base-coverage.json. A drop above 5 points gives a warning, and a smaller one, a missing base, or missing coverage give a message.
5. A description shorter than 30 characters, after trimming, gives a warning.

danger-config-template.js is a Dangerfile for **Danger JS** 11.3.1, the version its **GitHub Actions** step names, and uses only the fail, warn, and message functions and the danger object that **Danger** provides, plus fs for the coverage files. Its changed files are the created files followed by the modified ones, so deleted files never count, and only its failure lists the critical files. Coverage it cannot parse gives a warning, a summary without a line percentage prints indisponivel as the percentage, and a base without one counts as within the limit. A final message always lists the rules checked. The lesson's routewise-danger-demo submodule holds the same rules as dangerfile.js, plus a failure for committed .env files and a 50-character description, and runs them with danger ci --text-only --failOnErrors in a pull_request workflow. A second workflow, triggered by workflow_run, posts that text as a comment and sets the commit status, because a pull request from a fork only gets a read-only token.

danger-config-routewise.py is the **Python** equivalent, a command-line program ([command-line-interface](command-line-interface.md)). With --local, it reads a mock file named by --mock, pr-mock-routewise.json by default, holding the pull request's title, body, additions, and deletions, the changed files, the reviews with their author and state, and both coverage reports, and prints the title, the number of files, the approvals, and the lines changed before its report. Without it, it needs GITHUB_TOKEN, GITHUB_REPOSITORY, and PR_NUMBER, reads the pull request, its files, and its reviews from the **GitHub** REST API with **requests**, sending the token as a bearer, the application/vnd.github+json media type, and API version 2022-11-28, and reads coverage from the two files. It differs from the Dangerfile in its texts and in four behaviors: every file the API lists counts, deleted ones included, in the API's order, the approval message lists the critical files, the coverage message adds the drop and the base, and coverage without a line percentage gives a warning about its format. It ends without a summary message.

The terminal report is a rule of 60 hyphens, GOVERNANCE CHECK -- RESULTADO, and another rule, followed by up to three sections, FALHAS with the count and -- bloqueiam o merge:, AVISOS with the count and -- nao bloqueiam:, and INFORMACAO with the count, each item numbered and indented by two spaces. Then come a rule, Status final: with OK or FALHOU, two lines naming the rules, and a closing rule. In CI mode it then posts the report as a Markdown comment on the pull request's issue: a bold title, each section in bold with its items as a list prefixed by FALHA: or AVISO:, and the status in bold. Any failure makes it exit with 1. pr-mock-routewise.json passes every rule, and pr-mock-falhas.json fails two and warns about three. The guide's sample outputs are shortened and drift from the code, so the cases follow the code.

## What usually goes wrong in other languages

- A Dangerfile only runs inside **Danger**. **Ruby** has the original **Danger**, and **Kotlin** and **Swift** have **danger-kotlin** and **danger-swift**, which run on **Danger JS**. Any other language runs as a **Danger JS** process: danger ci --process with the program's command sends the DSL as JSON on standard input, with **JavaScript**'s field names, such as danger.github.pr.title and danger.git.created_files, and reads an object with fails, warnings, messages, and markdowns from standard output, each item an object with a message.
- **Ruby**'s **Danger** formats its own report, unlike everything that runs on **Danger JS**, so a **Ruby** transcription that must pass the cases runs as a **Danger JS** process too.
- A Dangerfile transcription that reads the files API, or adds deleted files, changes both which files count and the order they are listed in.
- Critical paths match anywhere in a path, so .env matches config/.env.example and docker-compose matches docker-compose.yml. Prefix or glob matching changes which files count.
- Every threshold is strict: exactly 500 lines, a drop of exactly 5 points, and a description of exactly 30 characters raise nothing. The Dangerfile measures the description in UTF-16 code units and the **Python** check in characters, which differ only for characters such as emoji.
- The card pattern ignores case, so routewise-44 in the description counts.
- Percentages print with one decimal, and an exact tie rounds differently: **JavaScript**'s toFixed rounds 79.25 up to 79.3, while **Python**'s, **Go**'s, and **Rust**'s formatting round it to the even 79.2. A Dangerfile transcription rounds ties up, and a transcription of the **Python** check rounds them to even.
- **C#** and **Java** format numbers in the machine's culture, which prints 11,1 instead of 11.1 on a Brazilian system. The invariant culture, or Locale.ROOT in **Java**, keeps the period.
- The comment's title names **Python** in every language, because the cases compare the comment exactly.
- The **Python** check treats an empty variable as missing and prints its problems on standard output with exit code 1. The hint after missing variables names the **Python** command, which a transcription adapts to its own, so the cases check only its first line.
- An empty coverage object counts as missing coverage in **Python**, and a report without total.lines.pct, in either file, gives the warning about the format, whose text quotes the expected shape with single quotes.
- A failed API call raises an exception in **Python**, so the check ends with a traceback, a non-zero exit, nothing on standard output, and no comment.
- The original always calls https://api.github.com. Transcriptions read GITHUB_API_URL, which **GitHub Actions** sets, and fall back to that address, as the copy that produced the cases does. **Danger JS** reads DANGER_GITHUB_API_BASE_URL.
- The files API returns 30 files per page, and the original reads only the first page. Following the pagination changes nothing for the cases, which never list more.
- The mocks' titles carry accented letters, which a **Windows** console only shows with UTF-8 output.

## How close common targets get

The standalone check needs an HTTP client, JSON, and regular expressions, so every target is a direct equivalent for it. The fit below is the Dangerfile's:

| Target                            | Fit               | Library                                                                                                              |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **Danger JS**, and fetch for the standalone check                                                                    |
| **Python**                        | Substitute        | A **Danger JS** process with json, and **requests** for the standalone check                                         |
| **Go**                            | Substitute        | A **Danger JS** process with encoding/json, and net/http with regexp for the standalone check                        |
| **Rust**                          | Substitute        | A **Danger JS** process with **serde_json**, and **reqwest** with **regex** for the standalone check                 |
| **C#**                            | Substitute        | A **Danger JS** process with System.Text.Json, and HttpClient with Regex for the standalone check                    |
| **Java**                          | Substitute        | A **Danger JS** process with **Jackson**, and the built-in HTTP client with java.util.regex for the standalone check |
| **C++**                           | Substitute        | A **Danger JS** process with **nlohmann/json**, and **libcurl** with std::regex for the standalone check             |

Verification runs a Dangerfile with danger ci --text-only --failOnErrors, through its port or with --process and the program's command. A tested **Go** transcription exists, with the Dangerfile as a **Danger JS** process.

## Tolerance

Both programs are deterministic, so their reports are compared exactly, except the summary line **Danger** writes above its report, whose symbol varies between versions, and the hint after missing variables. The requests **Danger** makes are incidental, because each port asks in its own order, while the **Python** check's requests are compared in order, including the comment it posts. Every **GitHub** response is synthesized from the documented format.

## Where it appears

- modulo07-ferramentas-de-ia-para-gestao-de-projetos/modulo-08-governanca-e-compliance (a Dangerfile for **Danger JS** and its **Python** equivalent)
