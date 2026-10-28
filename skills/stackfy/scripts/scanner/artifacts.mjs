import { readdir, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { naturalCompare } from './folders.mjs';
import { isInsideFolder } from './survey.mjs';

const SKILL = fileURLToPath(new URL('../../', import.meta.url));

export const SKILL_FOLDERS = Object.freeze({
  cases: join(SKILL, 'cases'),
  references: join(SKILL, 'references'),
  examples: join(SKILL, 'examples'),
});

const COURSE_ID = /modulo\d+[\w.-]*(?:\/[\w.-]+)*/g;

const relatedTo = (folder, container) => (id) =>
  id === folder ||
  isInsideFolder(folder, id) ||
  (!container && isInsideFolder(id, folder));

const readModulesOfCases = async (folder) => {
  const paths = (await readdir(folder, { recursive: true })).filter((path) =>
    path.endsWith('.json')
  );

  return Promise.all(
    paths.map(async (path) => ({
      path: path.split(sep).join('/'),
      module: JSON.parse(await readFile(join(folder, path), 'utf8')).module,
    }))
  );
};

const readCitations = async (folder) => {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.md'));

  return Promise.all(
    names.map(async (name) => ({
      name,
      ids: [...(await readFile(join(folder, name), 'utf8')).matchAll(COURSE_ID)]
        .map(([id]) => id.replace(/\.+$/, ''))
        .filter(Boolean),
    }))
  );
};

export const artifactsOf = async (
  folder,
  { mapping, folders, container, skill = SKILL_FOLDERS }
) => {
  const isRelated = relatedTo(folder, container);
  const cases = await readModulesOfCases(skill.cases);
  const citations = await readCitations(skill.references);

  return {
    mapping: Object.keys(mapping.modules)
      .filter(isRelated)
      .sort(naturalCompare),
    cases: cases
      .filter(({ module }) => isRelated(module))
      .map(({ path }) => path)
      .sort(naturalCompare),
    references: citations
      .filter(({ ids }) => ids.some(isRelated))
      .map(({ name }) => name)
      .sort(naturalCompare),
    examples: Object.entries(folders)
      .filter(([id]) => isRelated(id))
      .flatMap(([, entry]) => entry.examples ?? [])
      .sort(naturalCompare),
  };
};
