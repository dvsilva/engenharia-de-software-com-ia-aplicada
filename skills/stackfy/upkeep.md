# Upkeep

Technical support keeps the skill in step with the course, and professors never take part: they build their modules as if the skill did not exist, nothing here runs in the course's CI or asks anything of them, and no course folder ever changes because of the skill. Everything the skill needs, including what is recorded from the modules, lives inside the skill. The commands are under "Using the scripts directly" in [SKILL.md](SKILL.md).

## The survey lock

[survey-lock.json](survey-lock.json) records every folder the skill has surveyed, so the audit finds what changed since then by comparing it with the course's latest commit, in any clone, shallow ones included. Only the scripts write it.

A lesson folder is recorded by the last commit that touched it and its **Git** tree hash, which changes whenever anything inside it changes, nested projects included. A lesson folder is the folder a lesson's material lives in, usually each folder directly inside a course module, or inside a folder that only groups lessons. Every folder above a lesson, up to the module's root, is recorded too, by its own files only, so a lesson's change never marks the folders around it.

The lock also links each tested transcription to the folder it came from, because a transcription's name alone can match several lessons.

## Handling what changed

Start every upkeep with the audit. It lists the course modules not covered, the dependencies without a mapping in [mapping.json](mapping.json), the covered modules without cases, and every folder that changed, arrived, moved, or left since the lock recorded it. Apart from those, and never as something to cover, it lists the modules an external factor blocks and counts the synthesized exchanges of each module, both described below. For each folder, the changes report lists the files changed since its commit and the mapping entries, cases, references, and tested transcriptions it affects.

- **Moved:** replace its old id in the mapping, the cases, and the references, then stamp the new folder from the old one, which keeps its tested transcriptions.
- **Left:** remove what the mapping, the cases, the references, and the examples hold for it, then forget it.
- **Changed:** read the files it changed, and update the mapping first when a dependency manifest is among them. Then replay its cases against the original. When they pass, the behavior they check still holds, so reconcile the references with the code and keep its tested transcriptions. When they fail, record the cases again, reconcile the references, and run every tested transcription linked to the folder against the new cases, fixing those that fail.
- **Arrived:** survey it as below.

A reference always describes the current code, never the history of its changes, because the lock already says when the folder was surveyed. Stamp a folder only once its cases pass against the original, linking the tested transcriptions made from it.

## Surveying a folder

Read the folder's code and record its concepts in the mapping: a dependency that signals a concept under its stack, a concept only the code reveals under the folder's own entry, and a dependency that signals nothing as neutral. A concept earns a reference, and a row in [concepts.md](concepts.md) that links it, when it appears in more than one module or is hard to move across languages. Every reference keeps the same sections: the concept independently of language, how the course implements it, what usually goes wrong in other languages, how close common targets get and which substitute to use when there is no equivalent, the tolerance for numerical results when relevant, and where it appears.

A folder with nothing to run, such as slides, prompts, notes, or diagrams, needs no mapping, reference, or cases, and is stamped as it is.

Record cases at the boundary of every runnable program, starting points included: command-line input and output, HTTP, MCP, files, or pages. Compare what is deterministic exactly, LLM calls by structure, and random or generated results by shape and within tolerance, repeating the runs until the cases can be trusted. The cases file also tells how its original was recorded and what its cases cover. When a folder's code matches a folder that already has cases, its cases file extends that one's, which extends no other, and keeps only its own module, its description, and the cases that differ, such as one on another port.

LLM exchanges come from the recorder in front of a real server, or from responses the module already documents. The recorder sets the same variables as the runner and writes every exchange in the shape the cases replay, without authentication headers. When the original provider is out of reach, its stand-in model replaces the one the program asks for, or the list of models it offers a gateway such as **OpenRouter**, and pairs such as gemma4:e2b=gemma4:12b-mlx replace only the models they name, so an embedding model the server has stays itself. Prefer a local stand-in to leaving something uncovered: **Ollama** for an LLM, a **Docker** image for a service, and the provider's documented format for anything neither can produce, with each exchange's source saying which. An exchange whose answer no server gave in full, because it was written from a documented format or edited by hand after recording, also carries `"synthesized": true`, so the audit's count per module tells what to record from the real provider once it is within reach.

When an external factor still keeps part of the folder from being covered, such as a paid provider or a GPU support lacks, the cases file records it under `blocked`, an object whose `status` is `partial` when some of the module has passing cases or `skipped` when none does, whose `reason` names the factor and what it leaves out, and whose `completion` says what would cover the rest. The audit lists it apart until the factor goes away and that part gets its cases.

Keep a tested transcription only when it passes the cases, in the examples under its concept and target, named after its original. Add one only when it shows something the existing ones do not, such as a new kind of problem or the same case in another language, and choose the target that adds the most to the set, since the skill is language-agnostic and none is the default.

## Replaying the original

The original's replay runs a module's cases against the module itself, once with each command its cases file records under `originals`, from a temporary copy outside the course that it removes afterwards, even when a case fails. Once the cases pass against the original, write those commands, and what the copy needed under `prepare`, so every later replay runs without reading how it was recorded.

When the original needs more than its own folder to run, such as an address or port the runner must replace, a driver its cases call, dependencies to install, or a runtime other than the one first on PATH, `prepare` readies the copy in this order:

- `copy` names a course folder holding the module, copied instead of the module alone when the cases reach sibling lessons.
- `files` lists paths, relative to the module, that the copy gains from the skill's `support/<module>/` folder, such as a driver.
- `path` lists folders, relative to the module, that come first on PATH for the setup commands and the original, such as one a setup command links to the runtime it finds installed, failing with a clear message when none is.
- `setup` lists shell commands run in the copy's module folder, such as installing dependencies.
- `patches` lists `{ "file", "find", "replace" }` objects, each replacing every occurrence of the exact text `find` in `file`, relative to the module, applied last so they reach installed dependencies too. Keep them as small as possible, and never inline one in an original's command.

A patch whose text the file no longer holds, a setup command that fails, or a `path` folder missing once setup ends stops the replay before any case. A tool the original lacks is answered by a case's `commands`, and infrastructure is brought up by `services`, both from the copy.
