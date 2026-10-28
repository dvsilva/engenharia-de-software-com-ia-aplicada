import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isFilledText, isRecord, parseJson } from './runner/json.mjs';

const readJson = async (path) => {
  const text = await readFile(path, 'utf8').catch(() => {
    throw new Error(`cases file not found: ${path}`);
  });
  const parsed = parseJson(text);

  if (!isRecord(parsed?.value))
    throw new Error(`cases file is not valid: ${path}`);

  return parsed.value;
};

const mergeCases = (inherited, own) => {
  const replacements = new Map(
    own.map((testCase) => [testCase.name, testCase])
  );
  const inheritedNames = new Set(inherited.map(({ name }) => name));

  return [
    ...inherited.map((testCase) => replacements.get(testCase.name) ?? testCase),
    ...own.filter(({ name }) => !inheritedNames.has(name)),
  ];
};

const extendedDefinition = async (path, { extends: base, ...own }) => {
  const basePath = resolve(dirname(path), base);
  const inherited = await readJson(basePath);

  if (inherited.extends !== undefined)
    throw new Error(`${basePath} extends another cases file itself: ${path}`);

  if (!Array.isArray(inherited.cases))
    throw new Error(`cases file is not valid: ${basePath}`);

  return {
    ...inherited,
    ...own,
    cases: mergeCases(inherited.cases, own.cases ?? []),
  };
};

const isExtension = ({ extends: base, cases }) =>
  isFilledText(base) && (cases === undefined || Array.isArray(cases));

export const readCasesFile = async (path) => {
  const own = await readJson(path);

  if (own.extends === undefined && Array.isArray(own.cases)) return own;
  if (isExtension(own)) return extendedDefinition(path, own);

  throw new Error(`cases file is not valid: ${path}`);
};
