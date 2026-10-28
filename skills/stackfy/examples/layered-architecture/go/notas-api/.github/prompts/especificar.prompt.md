---
mode: agent
description: Writes the specification (what and why) of a feature, without code.
---

Write a SPECIFICATION for the feature described below.

Rules:

- Read `specs/constitution.md` and follow every principle.
- Do NOT write code or implementation decisions.
- Create `specs/<NNN>-<slug>-spec.md` (the next free number) with:
  1. Context and problem.
  2. User stories ("As <role>, I want <goal>, so that <benefit>").
  3. Numbered functional requirements (FR-1...).
  4. Acceptance criteria in EARS ("When <event>, the system shall <response>").
  5. Out of scope.
  6. Open questions.
- When something is ambiguous, ASK before finishing.
