import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readCasesFile } from '../cases-file.mjs';
import { SKILL_FOLDERS } from './artifacts.mjs';
import { isCourseModule, naturalCompare } from './folders.mjs';
import { MAPPING, scanFolders } from './modules.mjs';
import { compareSurvey, readHead, readLock } from './survey.mjs';

const listCourseModules = async (root) =>
  (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isCourseModule(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompare);

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const readCases = (path) => readCasesFile(path).catch(() => ({}));

const countSynthesized = (cases = []) =>
  cases
    .flatMap(({ replay = [] }) => replay)
    .filter(({ synthesized }) => synthesized === true).length;

const groupUnmapped = (modules) => {
  const groups = new Map();

  for (const { module, stack, unknown } of modules)
    for (const dependency of unknown) {
      const key = `${stack}\0${dependency}`;
      const group = groups.get(key) ?? { stack, dependency, modules: [] };

      groups.set(key, { ...group, modules: [...group.modules, module] });
    }

  return [...groups.values()].sort(
    (left, right) =>
      naturalCompare(left.stack, right.stack) ||
      naturalCompare(left.dependency, right.dependency)
  );
};

const casesFileOf = (module) =>
  module.includes('/') ? `${module}.json` : `${module}/index.json`;

export const audit = async (
  root,
  { mapping = MAPPING, cases = SKILL_FOLDERS.cases, lock } = {}
) => {
  const head = await readHead(root);
  const folders = lock ?? (await readLock());
  const modules = [];

  for (const name of await listCourseModules(root))
    modules.push(...(await scanFolders(join(root, name), root, mapping)));

  const scanned = modules.filter(({ stack }) => stack);
  const covered = scanned.filter(({ coverage }) => coverage === 'covered');
  const uncased = [];
  const blocked = [];
  const synthesized = [];

  for (const module of new Set(covered.map(({ module }) => module))) {
    const path = join(cases, casesFileOf(module));

    if (!(await exists(path))) {
      uncased.push(module);
      continue;
    }

    const { blocked: block, cases: moduleCases } = await readCases(path);
    const exchanges = countSynthesized(moduleCases);

    if (block) blocked.push({ module, ...block });
    if (exchanges > 0) synthesized.push({ module, exchanges });
  }

  return {
    modules: scanned.length,
    uncovered: scanned
      .filter(({ coverage }) => coverage !== 'covered')
      .map(({ module, stack, coverage, unknown }) => ({
        module,
        stack,
        coverage,
        unknown,
      })),
    unmapped: groupUnmapped(scanned),
    uncased,
    blocked,
    synthesized,
    survey: head === null ? null : compareSurvey(folders, head),
  };
};
