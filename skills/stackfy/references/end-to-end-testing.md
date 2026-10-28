---
name: end-to-end-testing
description: Test suites that drive a served application through a real browser as a user would, typing into fields, clicking, and asserting what the page shows with assertions that retry, either through selectors or through plain-English steps a model resolves, as the course does with Cypress and cy.prompt.
---

# End-to-end testing

## Concept

An end-to-end test drives a running application through a real browser as a user would: it opens an address, types into fields, clicks, and asserts what the page shows. The page answers asynchronously, so assertions retry until they hold or a timeout passes. Steps find elements by id, class, test attribute, or accessible role and name. The application under test is served on its own at a base URL, and a flow that saves data also needs the backend behind it. AI-driven steps are written in plain English and resolved by a model into commands against the current page, which tools cache and resolve again when the page changes. The suite is a program of its own: it reports each test and exits with a failure when any test failed.

## How the course implements it

The fourth UI/UX lesson's cfp-platform_v1 is modulo-03's workspace ([full-stack-monorepo](full-stack-monorepo.md)) with **Cypress** 15.13 added to the frontend's end-to-end project through **Nx**'s **Cypress** plugin. The plugin infers an e2e target, which runs cypress run in the project's folder and which **Nx** caches, plus open-cypress to open **Cypress**'s app. Its e2e replaces the one the **Playwright** plugin infers from the generator's leftover configuration, while e2e-ci stays **Playwright**'s. The **Cypress** configuration spreads **Nx**'s preset, sets the base URL to http://localhost:4200 and a **Cypress Cloud** project id, and names no server to start, so the frontend must already be served, as nx serve frontend does together with the api.

The traditional spec visits /event/new before each test. Its success test types Alvaro Neto Conference, Main Street, 456, 200, and 2026-06-15 into the fields with ids nome, endereco, capacidade, and data, clicks the submit-btn button, and expects the success-msg paragraph to be visible and contain Evento cadastrado com sucesso!. Its empty form test clicks the button and expects four error-text messages, for the name, the address, the capacity, and the date in that order ([component-framework](component-framework.md)). Only the success test reaches the api.

The AI-driven spec has one test that visits /event/new and hands cy.prompt five steps in English: type Auditório Oracle in the event name field, Av. Dr. Chucri Zaidan, SP in the address field, 500 in the capacity field, and 2026-12-31 in the date field, then click the button that submits or saves the event. A second cy.prompt verifies that a success message is visible. cy.prompt sends the steps and the page to **Cypress Cloud**, which resolves each step into **Cypress** commands, caches them for later runs, and resolves a step again when its selector breaks. It requires a logged-in **Cypress** account or a run with --record and a record key, and without either the test fails at once with PromptAuthenticationError.

How the agent planned the traditional spec and explored the page follows [coding-agent-harness](coding-agent-harness.md). The generator's support files, a login command that only logs and a getGreeting helper, and its example fixture are never used.

## What usually goes wrong in other languages

- **Cypress** runs only **JavaScript** and **TypeScript**, inside the browser beside the page, and queues its commands. Other languages drive the browser from outside, through **Playwright** or the WebDriver protocol, and await each command in turn.
- **Cypress** retries an assertion for 4 seconds by default and **Playwright**'s expect for 5, while **Selenium** never retries, so a **Selenium** transcription waits explicitly, as WebDriverWait does. The cases hold the api's answer for 1.5 seconds, so a success test that checks only once fails.
- type appends keystrokes to what a field already holds, so typing 200 into capacidade, which starts at 0, leaves 0200, which the number field reads as 200. **Playwright**'s fill and **Selenium**'s clear before send_keys replace the value, and both send 200.
- The configuration hard-codes the base URL. A transcription reads BASE_URL, as the workspace's leftover **Playwright** configuration does, and falls back to http://localhost:4200. **Cypress** itself takes CYPRESS_BASE_URL or --config baseUrl.
- The suite starts no server, so the cases' command serves the frontend at BASE_URL first, with its proxy sending /api to API_URL, runs the suite, and stops the frontend afterwards. The cases pass the spec's name, event-registration, as the command's argument.
- The cases check the suite's exit code and the request its success test makes the page send, never the report, so each target keeps its own runner and reporter, such as pytest, **JUnit**, or go test.
- cy.prompt has no equivalent outside **Cypress**. A transcription keeps the steps in English and resolves them with an agent of its own, such as **Stagehand**'s act in **TypeScript** or **Python**, **Midscene.js**, **browser-use**, or a model driving the **Playwright** MCP server, all of which can run on **Ollama**. No case checks the AI-driven spec, because the original needs **Cypress Cloud**.
- **Cypress**'s binary is **Electron**, so ELECTRON_RUN_AS_NODE, which some editors set for the processes they start, makes it reject its own flags and fail to start. Running without the variable fixes it.
- **Nx** caches the e2e target, so a second run with the same inputs replays the earlier result without opening a browser unless the cache is skipped.

## How close common targets get

The suite tests a page, not a framework, so it stays as it is when the frontend moves to another framework: the original spec passes the cases against the tested **React** frontend too. The fit below is the suite's own:

| Target                            | Fit               | Library                                                                               |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **Cypress**, or **Playwright Test**                                                   |
| **Python**                        | Substitute        | **pytest-playwright**, with **browser-use** or **Stagehand** for the AI-driven steps  |
| **Java**                          | Substitute        | **Playwright** for **Java** with **JUnit**, or **Selenium** WebDriver                 |
| **C#**                            | Substitute        | **Playwright** for .NET with **NUnit** or **xUnit**                                   |
| **Go**                            | Substitute        | **playwright-go** or **chromedp** with go test                                        |
| **Rust**                          | Substitute        | **thirtyfour** over WebDriver with cargo test                                         |
| **C++**                           | Substitute        | WebDriver commands sent to chromedriver with **libcurl**, checked with **GoogleTest** |

The tested **Python** transcription of the traditional spec, with **pytest-playwright**, leaves the AI-driven spec out and matches **Cypress**'s 4-second retry.

## Tolerance

The suite's exit code and the body its success test sends are compared exactly. Whether a run fails depends on timing only through the retry window, which the replay's 1.5-second hold stays well within.

## Where it appears

- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1 (the frontend-e2e project)
