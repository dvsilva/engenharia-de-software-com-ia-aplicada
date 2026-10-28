#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCasesFile } from './cases-file.mjs';
import { fail, readFlags, readInteger, start } from './cli.mjs';
import { runCases } from './runner/cases.mjs';
import { isFilledText } from './runner/json.mjs';
import { runOriginals } from './runner/originals.mjs';
import { DEFAULT_TIMEOUT } from './runner/processes.mjs';

const SUPPORT = fileURLToPath(new URL('../support/', import.meta.url));

const FLAGS = Object.freeze({
  case: { type: 'string' },
  cmd: { type: 'string' },
  original: { type: 'boolean', default: false },
  cwd: { type: 'string' },
  root: { type: 'string' },
  host: { type: 'string', default: '127.0.0.1' },
  browser: { type: 'string' },
  timeout: { type: 'string' },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
});

const HELP_TEXT = `Usage:
  node run.mjs --case <cases.json> --cmd "<command>" [--cwd <dir>] [--root <dir>] [--host <host>] [--browser <path>] [--timeout <ms>] [--json]
  node run.mjs --case <cases.json> --original [--root <dir>] [--host <host>] [--browser <path>] [--timeout <ms>] [--json]

Flags:
  --case <file>    The module's pre-tested cases.
  --cmd <command>  Command that starts the transcription, run through the shell.
  --original       Run the cases against the module itself, once with each
                   command the cases file records under originals, from a
                   temporary copy of the module that its prepare readies and
                   that is removed afterwards. Every one must pass.
  --cwd <dir>      Directory to run the command in. Defaults to process.cwd().
  --root <dir>     Course root, where the services a module needs are declared.
                   Defaults to process.cwd().
  --host <host>    Interface the LLM replay listens on. Defaults to 127.0.0.1.
                   Use 0.0.0.0 when the transcription runs inside a container.
  --browser <path> Google Chrome or Chromium that opens the pages a case serves.
                   Defaults to the first one installed.
  --timeout <ms>   Time limit for each case. Defaults to ${DEFAULT_TIMEOUT}.
  --json           Emit JSON instead of human-readable lines.
  -h, --help       Show this help.

A case's program takes the place of {program} in the command, and its
arguments take the place of {args}, or follow the command when it does not
name {args}.

The command receives OLLAMA_HOST, OPENAI_BASE_URL, STACKFY_REPLAY_URL, and
STACKFY_REPLAY_PORT pointing to the replay of recorded LLM responses, plus
PORT when a case serves HTTP. A case's variables, page steps, and recorded
responses may contain {replay}, which becomes the replay's address, for other
HTTP services the program calls, and {replaySocket}, the same address for a
WebSocket, where the replay plays the case's socket messages. A variable a case
sets to null is left out, so the program runs without it, such as a key it then
reads from a .env file the case writes. Recorded responses may also contain
{cwd}, which becomes the directory the command runs in, for paths a model
repeats from the program's prompt. A case whose program calls a service at a
fixed address names that port as replayPort, and the replay listens there. A
case's commands put a stand-in first on PATH for each command-line tool the
program runs, such as gcloud, printing what the tool printed for the same
arguments, where {cwd} also applies and an argument that differs per machine,
such as an absolute path outside that directory, may be a $pattern, and exiting
with its code, or letting the calls it does not record through to the installed
tool. A case's files may name a public download, such as a dataset the module
asks the student to fetch, by its URL and SHA-256, which the runner downloads
once and keeps for later runs.

A cases file's prepare readies the original's copy: copy names a wider course
folder to copy when the cases reach sibling lessons, files lists the support
files the skill keeps under support/<module>/ that the copy gains at the same
path, path lists the folders, relative to the module, that come first on PATH
for the setup and the original, such as one a setup command links to the
runtime the original needs, and must exist once setup ends, setup lists the
commands run in the copy's module folder next, and patches lists the
{ file, find, replace } edits made last, every occurrence of find in file, so
they reach installed dependencies too.

A cases file may name another, relative to itself, under extends, which it
reuses: it takes every field of that file, its own fields replace them, and its
own cases replace the inherited ones with the same name and follow the rest. A
file it extends extends no other.

Exit codes:
  0  every case passed
  1  at least one case failed
  2  cases file missing or invalid, its services did not start, or it records
     no command for --original or the copy it prepares for it failed
  64 invalid CLI arguments
`;

const formatResult = (result) =>
  result.pass
    ? `PASS  ${result.name}\n`
    : `FAIL  ${result.name}\n${result.failures.map((failure) => `      - ${failure}\n`).join('')}`;

const requireOriginals = ({ module, originals }, path) => {
  const recorded =
    typeof module === 'string' &&
    Array.isArray(originals) &&
    originals.length > 0 &&
    originals.every(isFilledText);

  if (!recorded)
    fail(
      `the cases file records no command for the original: ${resolve(path)}`
    );
};

const passes = (results) => results.every((result) => result.pass);

const writeResults = (results) => {
  for (const result of results) process.stdout.write(formatResult(result));
};

const replayOriginals = async (definition, flags, options) => {
  requireOriginals(definition, flags.case);

  const runs = await runOriginals(definition, { ...options, support: SUPPORT });

  if (flags.json) process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
  else
    for (const { command, results } of runs) {
      process.stdout.write(`ORIGINAL  ${command}\n`);
      writeResults(results);
    }

  process.exitCode = runs.every(({ results }) => passes(results)) ? 0 : 1;
};

const main = async () => {
  const flags = readFlags(FLAGS);

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (!flags.case || Boolean(flags.cmd) === flags.original)
    fail('--case and either --cmd or --original are required.', 64);

  const timeout = readInteger(flags, 'timeout', 1) ?? DEFAULT_TIMEOUT;
  const definition = await readCasesFile(resolve(flags.case)).catch((error) =>
    fail(error.message)
  );
  const options = {
    root: resolve(flags.root ?? process.cwd()),
    host: flags.host,
    timeout,
    browser: flags.browser,
  };

  if (flags.original) {
    await replayOriginals(definition, flags, options).catch((error) =>
      fail(error.message)
    );
    return;
  }

  const results = await runCases(definition, {
    ...options,
    command: flags.cmd,
    cwd: resolve(flags.cwd ?? process.cwd()),
  }).catch((error) => fail(error.message));

  if (flags.json) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  else writeResults(results);

  process.exitCode = passes(results) ? 0 : 1;
};

start(main);
