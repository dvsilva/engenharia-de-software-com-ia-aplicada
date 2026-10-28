---
mode: agent
description: Implements the pending tasks one at a time, with tests.
---

Implement the tasks of the given feature (the text after the command).

- Resolve the feature's spec first:
  - given a number such as `001`, use `specs/001-*-spec.md`;
  - given a path, use that spec file directly.
- From the resolved spec, derive its sibling files:
  - plan: `specs/<NNN>-<slug>-plan.md`
  - tasks: `specs/<NNN>-<slug>-tasks.md`
- Always read and update the numbered files of that same feature, never a loose, generic `plan.md` or `tasks.md`.

One task at a time:

1. Pick the next `- [ ]` whose dependencies are done.
2. Implement it following the feature's numbered plan, the instructions, and the constitution.
3. Write or update the tests, then run `go test ./...` and `go vet ./...`.
4. Mark it `- [x]` only when both pass.
5. Stop after a cohesive slice and ask for review.

Never disable tests or types to make them pass. When the spec is wrong, stop and say so.
