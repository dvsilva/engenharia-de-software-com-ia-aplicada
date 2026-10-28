---
name: full-stack-monorepo
description: One repository holding a browser frontend, an HTTP backend, and a library of the types they exchange, wired by one workspace tool whose dev server proxies the API to the page's own origin, as the course does with Nx, Angular, and NestJS.
---

# Full-stack monorepo

## Concept

A full-stack monorepo keeps the frontend, the backend, and the code they share in one repository, so a change to the contract between them lands in one commit. A workspace tool knows every project and its targets, such as build, serve, test, and lint, and the order they depend on: building the backend builds the shared library first, and serving the frontend can start the backend too. Projects import the shared library through a path alias instead of a published package. The library holds the data transfer objects (DTOs), the shapes each request and response carry. In development, the frontend's dev server forwards the API's path to the backend, so the page calls its own origin and the browser never makes a cross-origin request. Types exist only at compile time, so one declaration serves both sides only while both are written in the same language.

## How the course implements it

From its third lesson on, the UI/UX module builds cfp-platform, a call for papers platform, in an **Nx** 22 workspace. It holds the frontend, an **Angular** 21 application ([component-framework](component-framework.md)), the api, a **NestJS** 11 application ([rest-api](rest-api.md)), an end-to-end project for each, and the shared-types library. shared-types declares SpeakerDTO (id, name, email, talkTitle, and isGDE) and EventDTO (id, nome, endereco, capacidade, and data), plus a sharedTypes function the generator left, which nothing calls. The base TypeScript configuration maps @cfp-platform/shared-types to the library's source, so both applications compile it in, and the api's validation classes implement each DTO without its id ([schema-validation](schema-validation.md)).

**Nx** infers each project's targets from its configuration and plugins. The api builds with webpack, and its serve target runs the build through **Nx**'s node executor, which rebuilds on every change and opens the inspector on port 9229. The frontend builds and serves with the **Angular CLI**'s builders, and its serve target depends on the api's, so serving the frontend starts both. Its dev server proxies /api to http://localhost:3000, where the api listens unless PORT says otherwise, and the api prefixes every route with api, so the page's /api/speakers reaches the speakers controller unchanged. Data lives in the api's memory and is lost when it restarts.

The end-to-end projects start as generator leftovers: the api's checks only the greeting at /api through **axios**, and the frontend's **Playwright** test expects a Welcome heading the application never renders. The fourth lesson's cfp-platform_v1 keeps the same api, frontend, and shared-types, and adds **Cypress** specs to the frontend's end-to-end project ([end-to-end-testing](end-to-end-testing.md)). How the lessons build the platform with an agent follows [coding-agent-harness](coding-agent-harness.md).

## What usually goes wrong in other languages

- The cases check each program on its own. The api cases start the api, and the frontend cases start only the frontend, against a replay that answers what the api answered and records every request the page sends, so a frontend transcription runs without its api, which nx serve frontend would start.
- The proxy target is hard-coded, while the replay listens on a new port every run, so the cases pass its address in API_URL. A transcription's dev server proxies /api to API_URL and falls back to http://localhost:3000, as **Vite**'s server.proxy does when its configuration reads the variable. The copy of the original that produced the cases has a proxy configuration that reads it.
- A backend in another language restates the DTOs in its own types, such as **pydantic** models, **Go** structs with JSON tags, or **C#** records, or generates both sides from one schema, such as an OpenAPI document. The field names, Portuguese ones included, stay as they are, because they are the JSON on the wire.
- **Nx** waits instead of starting a continuous task that another of its processes already runs in the same workspace, so a server left running blocks the next case. The copy that produced the cases runs it with its daemon and cloud turned off.
- The lock file is out of sync with package.json, so npm ci fails, and npm install rewrites the lock file. A frontend transcription that runs the original api installs the workspace's dependencies with npm install --no-save, which leaves the lock file as it is.

## How close common targets get

The frontend stays in a language the browser runs, as [component-framework](component-framework.md) explains, so the targets below are for the backend beside it.

| Target                            | Fit               | Library                                                                                                      |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **JavaScript** and **TypeScript** | Direct equivalent | An **Nx** or **npm** workspace with a shared types package, and the frontend dev server's proxy              |
| **Python**                        | Substitute        | A **uv** project beside the frontend, **pydantic** models, and **TypeScript** types generated from OpenAPI   |
| **Go**                            | Substitute        | A **Go** module beside the frontend, structs with JSON tags, and **TypeScript** types generated from OpenAPI |
| **Rust**                          | Substitute        | A **Cargo** workspace, **serde** structs, and **TypeScript** types generated by **ts-rs**                    |
| **C#**                            | Substitute        | A .NET solution, records, and a **TypeScript** client generated by **NSwag**                                 |
| **Java**                          | Substitute        | A **Maven** or **Gradle** multi-module build, records, and **TypeScript** types generated from OpenAPI       |
| **C++**                           | Substitute        | A **CMake** project beside the frontend, structs with **nlohmann/json**, and the types written on each side  |

The tested **React** transcription of cfp-platform, kept with the component-framework examples, replaces only the frontend and keeps the shared types in **TypeScript**, so its api cases run against the original api.

## Where it appears

- modulo05-ferramentas-de-IA-para-UI-UX/modulo-03/cfp-platform
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-03/cfp-platform/shared-types (the shared DTOs, with nothing to run on their own)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-04/cfp-plataform_v1/cfp-platform_v1/shared-types (the same DTOs)
