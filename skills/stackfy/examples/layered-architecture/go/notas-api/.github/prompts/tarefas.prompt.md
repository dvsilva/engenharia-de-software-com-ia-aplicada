---
mode: agent
description: Breaks the plan into small, ordered, testable tasks.
---

Generate the tasks file of the given feature (the text after the command is its number or path).

- Resolve the feature's spec first:
  - given a number such as `001`, use `specs/001-*-spec.md`;
  - given a path, use that spec file directly.
- From the resolved spec, derive its sibling files:
  - spec: `specs/<NNN>-<slug>-spec.md`
  - plan: `specs/<NNN>-<slug>-plan.md`
  - tasks: `specs/<NNN>-<slug>-tasks.md`
- Read the spec and the plan of that same feature.
- Write the tasks in `specs/<NNN>-<slug>-tasks.md`.
- Never write a loose, generic `tasks.md`.
- In the numbered list, each task:
  - is small enough for a single commit;
  - has a clear definition of done (such as test X passes);
  - declares its dependencies, when it has any;
  - starts with `- [ ]` so progress can be checked off.
- Order by dependency. Implement nothing.
