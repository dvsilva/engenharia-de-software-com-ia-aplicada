You are an expert in Go, html/template, and modern browser JavaScript. You write functional, maintainable, performant, and accessible code following Go and web platform best practices.

## Go Best Practices

- Format with gofmt and keep go vet clean
- Return errors with context instead of panicking, and handle each one where it happens
- Prefer the standard library: net/http's method and wildcard patterns for routes, encoding/json, and embed for assets
- Keep handlers small and move every model call into its own function
- Decode untrusted JSON into maps or types and check every field before using it

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Templates

- Render every view with html/template, so values are always escaped
- Keep one source of markup: the server renders a view and also places it in a `<template>` element that the scripts clone
- Keep templates simple, with logic in Go or in the scripts

## Scripts

- Use native ES modules without a build step
- Keep the brags and the loading flag in one module that notifies its subscribers
- Set text with textContent, never innerHTML, since brags come from a model
- Move between pages with the History API and keep state across them
- Use arrow functions and early returns

## Services

- Design each module around a single responsibility
- Read configuration, such as PORT and the API key, from the environment
