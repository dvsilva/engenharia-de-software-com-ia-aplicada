#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fail, readFlags, start } from './cli.mjs';
import { artifactsOf, SKILL_FOLDERS } from './scanner/artifacts.mjs';
import { audit } from './scanner/audit.mjs';
import { isCourseModule, toId } from './scanner/folders.mjs';
import { MAPPING, scanFolders } from './scanner/modules.mjs';
import {
  changesWithin,
  compareSurvey,
  forgetFolders,
  holdsSurveyed,
  readHead,
  readLock,
  stampFolders,
  surveyOf,
  writeLock,
} from './scanner/survey.mjs';
import { checkToolchain, slugTarget } from './scanner/targets.mjs';
import { listTranscriptions } from './scanner/transcriptions.mjs';

const FLAGS = Object.freeze({
  scan: { type: 'string', multiple: true, default: [] },
  transcriptions: { type: 'boolean', default: false },
  audit: { type: 'boolean', default: false },
  changes: { type: 'string' },
  stamp: { type: 'string', multiple: true, default: [] },
  forget: { type: 'string', multiple: true, default: [] },
  example: { type: 'string', multiple: true, default: [] },
  from: { type: 'string' },
  target: { type: 'string' },
  toolchain: { type: 'string' },
  root: { type: 'string' },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
});

const HELP_TEXT = `Usage:
  node scan.mjs --scan <path> [--scan <path> ...] [--root <dir>] [--json]
  node scan.mjs --transcriptions --target <name> [--root <dir>] [--json]
  node scan.mjs --toolchain <target> [--json]
  node scan.mjs --audit [--root <dir>] [--json]
  node scan.mjs --changes <path> [--root <dir>] [--json]
  node scan.mjs --stamp <path> [--stamp <path> ...] [--example <name> ...] [--from <path>] [--root <dir>] [--json]
  node scan.mjs --forget <path> [--forget <path> ...] [--root <dir>] [--json]

Flags:
  --scan <path>       Report the stack, dependencies, concepts, coverage, and
                      survey state of every module under <path>, in course
                      order.
  --transcriptions    List the student's transcriptions for --target, found by
                      the "<original>.<target>" folder naming.
  --target <name>     Target language or stack, such as python, go, or c#.
  --toolchain <name>  Check whether the target's toolchain is installed, or
                      its language's when the target is a framework.
  --audit             List the course modules that are not covered or have no
                      cases, the dependencies without a mapping, and the
                      folders that changed, arrived, moved, or left since the
                      survey lock recorded them, and apart from those, the
                      modules an external factor blocks and how many
                      synthesized exchanges each module's cases hold, which
                      never count as something to cover.
  --changes <path>    Report what changed under <path> since the survey: the
                      files changed in each surveyed folder, the folders that
                      arrived, moved, or left, and the mapping, cases,
                      references, and tested transcriptions they affect.
  --stamp <path>      Record the folder in the survey lock as surveyed at the
                      last commit that touched it.
  --example <name>    Link a tested transcription, as <concept>/<target>/<name>
                      under the examples, to the one folder --stamp records.
  --from <path>       Stamp the one folder as the new place of a surveyed
                      folder that moved, keeping its tested transcriptions.
  --forget <path>     Remove a folder that left the course from the survey lock.
  --root <dir>        Course root that module ids are relative to.
                      Defaults to process.cwd().
  --json              Emit JSON instead of human-readable lines.
  -h, --help          Show this help.

Exit codes:
  0  success (or toolchain installed, or nothing for the audit to report)
  1  the audit found modules, dependencies, or folders to cover
  2  path not found, toolchain missing or unknown, course not in Git, or a
     folder or tested transcription the survey lock cannot record
  64 invalid CLI arguments
`;

const formatList = (values) => (values.length > 0 ? values.join(',') : '-');

const formatModule = ({ module, stack, concepts, unknown, coverage, survey }) =>
  `${module} [${coverage}] survey=${survey} stack=${stack ?? 'unknown'} concepts=${formatList(concepts)} unknown=${formatList(unknown)}\n`;

const formatTranscription = ({ folder, original, stack, dependencies }) =>
  `${folder} (from ${original}) stack=${stack ?? 'unknown'} dependencies=${formatList(dependencies)}\n`;

const toolchainLabel = ({ target, language }) =>
  language === target ? target : `${target} (${language})`;

const formatToolchain = (result) => {
  if (!result.known) return `${result.target}: unknown target\n`;
  if (!result.installed)
    return `${toolchainLabel(result)}: missing, install from ${result.install}\n`;

  return `${toolchainLabel(result)}: installed (${result.version})\n`;
};

const formatSurveyGaps = (survey) => {
  if (survey === null) return ['survey unknown: the course is not in Git\n'];

  return [
    ...survey.changed.map((folder) => `changed since the survey: ${folder}\n`),
    ...survey.new.map((folder) => `new since the survey: ${folder}\n`),
    ...survey.moved.map(
      ({ from, to }) => `moved since the survey: ${from} -> ${to}\n`
    ),
    ...survey.removed.map((folder) => `removed since the survey: ${folder}\n`),
  ];
};

const countSurveyGaps = (survey) =>
  survey === null
    ? 0
    : Object.values(survey).reduce((total, gaps) => total + gaps.length, 0);

const formatAudit = ({
  modules,
  uncovered,
  unmapped,
  uncased,
  blocked,
  synthesized,
  survey,
}) =>
  [
    `${modules} modules audited\n`,
    ...uncovered.map(
      ({ module, stack, coverage, unknown }) =>
        `not covered: ${module} [${coverage}] stack=${stack} unknown=${formatList(unknown)}\n`
    ),
    ...unmapped.map(
      ({ stack, dependency, modules: found }) =>
        `unmapped: ${stack} ${dependency} (${found.length} modules)\n`
    ),
    ...uncased.map((module) => `without cases: ${module}\n`),
    ...formatSurveyGaps(survey),
    ...blocked.map(
      ({ module, status, completion }) =>
        `blocked: ${module} [${status}] ${completion}\n`
    ),
    ...synthesized.map(
      ({ module, exchanges }) =>
        `synthesized: ${module} (${exchanges} ${exchanges === 1 ? 'exchange' : 'exchanges'})\n`
    ),
  ].join('');

const formatChangedFolder = ({ folder, commit, files }) => [
  `changed: ${folder} since ${commit}\n`,
  ...(files === null
    ? ['  the surveyed commit is not in this clone\n']
    : files.map(({ status, path }) => `  ${status} ${path}\n`)),
];

const formatChanges = ({
  folder,
  survey,
  changed,
  new: arrived,
  moved,
  removed,
  artifacts,
}) =>
  [
    `${folder} survey=${survey}\n`,
    ...changed.flatMap(formatChangedFolder),
    ...arrived.map((path) => `new: ${path}\n`),
    ...moved.map(({ from, to }) => `moved: ${from} -> ${to}\n`),
    ...removed.map((path) => `removed: ${path}\n`),
    ...Object.entries(artifacts).map(
      ([kind, values]) => `${kind}: ${formatList(values)}\n`
    ),
  ].join('');

const formatStamp = ({ folder, commit }) => `stamped: ${folder} at ${commit}\n`;

const formatForget = ({ folder }) => `forgot: ${folder}\n`;

const emit = (value, asJson, format) => {
  if (asJson) {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    return;
  }

  const items = Array.isArray(value) ? value : [value];
  for (const item of items) process.stdout.write(format(item));
};

const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

const ensureDirectory = async (path) => {
  const absolute = resolve(path);
  if (!(await isDirectory(absolute))) fail(`directory not found: ${absolute}`);

  return absolute;
};

const courseFolderOf = (root, path) => {
  const id = toId(root, resolve(path));
  if (!isCourseModule(id)) fail(`not a folder of a course module: ${path}`);

  return id;
};

const ensureHead = async (root) => {
  const head = await readHead(root);
  if (head === null) fail(`the course is not in Git: ${root}`);

  return head;
};

const isExampleName = (name) => {
  const parts = name.split('/');

  return (
    parts.length === 3 &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..')
  );
};

const ensureExamples = async (names) => {
  const found = await Promise.all(
    names.map(
      async (name) =>
        isExampleName(name) &&
        (await isDirectory(join(SKILL_FOLDERS.examples, name)))
    )
  );
  const missing = names.filter((_, index) => !found[index]);

  if (missing.length > 0)
    fail(`tested transcriptions not found: ${missing.join(', ')}`);
};

const reportChanges = async (root, path, asJson) => {
  const head = await ensureHead(root);
  const folder = courseFolderOf(root, path);
  const folders = await readLock();
  const comparison = compareSurvey(folders, head);
  const artifacts = await artifactsOf(folder, {
    mapping: MAPPING,
    folders,
    container: holdsSurveyed(folder, folders),
  });

  emit(
    {
      folder,
      survey: surveyOf(folder, folders, comparison),
      ...(await changesWithin(root, folder, folders, comparison)),
      artifacts,
    },
    asJson,
    formatChanges
  );
};

const stamp = async (root, flags) => {
  const head = await ensureHead(root);
  const ids = flags.stamp.map((path) => courseFolderOf(root, path));
  const untracked = ids.filter((id) => !head.trees.has(id));
  if (untracked.length > 0)
    fail(`not folders of the course in Git: ${untracked.join(', ')}`);

  await ensureExamples(flags.example);

  const folders = await readLock();
  const from =
    flags.from === undefined ? undefined : courseFolderOf(root, flags.from);
  if (from !== undefined && !(from in folders))
    fail(`not in the survey lock: ${from}`);

  const next = await stampFolders(root, ids, folders, head, {
    examples: flags.example,
    from,
  });

  await writeLock(next);
  emit(
    ids.map((folder) => ({ folder, ...next[folder] })),
    flags.json,
    formatStamp
  );
};

const forget = async (root, flags) => {
  const head = await ensureHead(root);
  const ids = flags.forget.map((path) => courseFolderOf(root, path));
  const folders = await readLock();
  const unknown = ids.filter((id) => !(id in folders));
  if (unknown.length > 0) fail(`not in the survey lock: ${unknown.join(', ')}`);

  await writeLock(forgetFolders(ids, folders, head));
  emit(
    ids.map((folder) => ({ folder })),
    flags.json,
    formatForget
  );
};

const scanWithSurvey = async (root, paths) => {
  const head = await readHead(root);
  const folders = await readLock();
  const comparison = head === null ? null : compareSurvey(folders, head);
  const modules = [];

  for (const path of paths)
    modules.push(...(await scanFolders(await ensureDirectory(path), root)));

  return modules.map((module) => ({
    ...module,
    survey: surveyOf(module.module, folders, comparison),
  }));
};

const main = async () => {
  const flags = readFlags(FLAGS);

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const modes = [
    flags.scan.length > 0,
    flags.transcriptions,
    flags.toolchain !== undefined,
    flags.audit,
    flags.changes !== undefined,
    flags.stamp.length > 0,
    flags.forget.length > 0,
  ].filter(Boolean).length;
  if (modes !== 1)
    fail(
      'choose exactly one of --scan, --transcriptions, --toolchain, --audit, --changes, --stamp, --forget.',
      64
    );

  const linksOneFolder = flags.example.length > 0 || flags.from !== undefined;
  if (linksOneFolder && flags.stamp.length !== 1)
    fail('--example and --from take exactly one --stamp.', 64);

  if (flags.toolchain !== undefined) {
    const result = checkToolchain(flags.toolchain);

    emit(result, flags.json, formatToolchain);
    process.exit(result.installed ? 0 : 2);
  }

  const root = await ensureDirectory(flags.root ?? process.cwd());

  if (flags.audit) {
    const report = await audit(root);
    const gaps =
      report.uncovered.length +
      report.unmapped.length +
      report.uncased.length +
      countSurveyGaps(report.survey);

    emit(report, flags.json, formatAudit);
    process.exitCode = gaps > 0 ? 1 : 0;
    return;
  }

  if (flags.changes !== undefined) {
    await reportChanges(root, flags.changes, flags.json);
    return;
  }

  if (flags.stamp.length > 0) {
    await stamp(root, flags);
    return;
  }

  if (flags.forget.length > 0) {
    await forget(root, flags);
    return;
  }

  if (flags.transcriptions) {
    if (!flags.target) fail('--transcriptions requires --target.', 64);

    const transcriptions = await listTranscriptions(root, flags.target);
    if (transcriptions.length === 0 && !flags.json) {
      process.stdout.write(
        `stackfy: no transcriptions for ${slugTarget(flags.target)}.\n`
      );
      return;
    }

    emit(transcriptions, flags.json, formatTranscription);
    return;
  }

  emit(await scanWithSurvey(root, flags.scan), flags.json, formatModule);
};

start(main);
