---
mode: agent
description: Generates the technical plan (how) from an existing spec.
---

Generate the TECHNICAL PLAN of the given feature (the text after the command is its number or path).

- Resolve the feature's spec first:
  - given a number such as `001`, use `specs/001-*-spec.md`;
  - given a path, use that spec file directly.
- Read the resolved spec and `specs/constitution.md`.
- Create the plan beside the spec, with the same prefix and slug, changing only the suffix:
  - spec: `specs/<NNN>-<slug>-spec.md`
  - plan: `specs/<NNN>-<slug>-plan.md`
- Never write a loose, generic `plan.md`.
- The plan covers:
  1. Architecture: the layers and files created or changed (`httpapi/cli -> service -> store`).
  2. Data model: types and their parse functions.
  3. Contracts: HTTP routes and CLI commands, with input and output.
  4. Decisions and trade-offs.
  5. Testing strategy (the testing package).
- Implement nothing yet.
- Point out the risks and what needs a human decision.
