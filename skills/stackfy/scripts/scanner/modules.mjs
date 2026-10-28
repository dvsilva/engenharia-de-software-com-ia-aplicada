import { readFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  detectStack,
  readDependencies,
  readSourceDependencies,
  sourceStacksOf,
  unique,
} from './dependencies.mjs';
import { isWithin, naturalCompare, toId, walk } from './folders.mjs';

export const MAPPING = JSON.parse(
  await readFile(new URL('../../mapping.json', import.meta.url), 'utf8')
);

const classify = (stack, dependencies, mapping) => {
  const concepts = Object.entries(mapping.concepts)
    .filter(([, signals]) =>
      (signals[stack] ?? []).some((name) => dependencies.includes(name))
    )
    .map(([concept]) => concept);
  const known = new Set([
    ...Object.values(mapping.concepts).flatMap(
      (signals) => signals[stack] ?? []
    ),
    ...(mapping.neutral[stack] ?? []),
  ]);

  return {
    concepts,
    unknown: dependencies.filter((name) => !known.has(name)),
  };
};

const coverageOf = (concepts, unknown) => {
  if (concepts.length === 0) return 'not-covered';

  return unknown.length === 0 ? 'covered' : 'partial';
};

const describe = (id, stack, dependencies, mapping) => {
  const classified = classify(stack, dependencies, mapping);
  const concepts = [
    ...new Set([...classified.concepts, ...(mapping.modules?.[id] ?? [])]),
  ];

  return {
    module: id,
    stack,
    dependencies,
    concepts,
    unknown: classified.unknown,
    coverage: coverageOf(concepts, classified.unknown),
  };
};

const describeFolder = async (folder, files, root, mapping) => {
  const stack = detectStack(files);
  const dependencies = stack
    ? await readDependencies(folder, files, stack)
    : [];

  return describe(toId(root, folder), stack, dependencies, mapping);
};

const findSourceRoots = (folders, manifestRoots) => {
  const roots = [];

  for (const { folder, files } of folders) {
    if (detectStack(files) || sourceStacksOf(files).length === 0) continue;
    if ([...manifestRoots, ...roots].some((root) => isWithin(folder, root)))
      continue;

    roots.push(folder);
  }

  return roots;
};

const membersOf = (sourceRoot, folders, manifestRoots) =>
  folders.filter(
    ({ folder }) =>
      isWithin(folder, sourceRoot) &&
      !manifestRoots.some(
        (manifest) =>
          isWithin(manifest, sourceRoot) && isWithin(folder, manifest)
      )
  );

const describeSourceRoot = async (sourceRoot, members, root, mapping) => {
  const stacks = unique(members.flatMap(({ files }) => sourceStacksOf(files)));
  const described = [];

  for (const stack of stacks)
    described.push(
      describe(
        toId(root, sourceRoot),
        stack,
        await readSourceDependencies(members, stack),
        mapping
      )
    );

  return described;
};

const fileNamesOf = async (folder) =>
  (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

const enclosingProject = async (folder, root) => {
  const parent = dirname(folder);
  if (parent === root || !isWithin(parent, root)) return null;

  const files = await fileNamesOf(parent);
  if (detectStack(files)) return { folder: parent, files };

  return enclosingProject(parent, root);
};

export const scanFolders = async (start, root, mapping = MAPPING) => {
  const { folders } = await walk(start);
  const manifestRoots = folders
    .filter(({ files }) => detectStack(files))
    .map(({ folder }) => folder);
  const project =
    manifestRoots.length === 0 ? await enclosingProject(start, root) : null;

  if (project)
    return [await describeFolder(project.folder, project.files, root, mapping)];

  const modules = [];

  for (const { folder, files } of folders) {
    if (!detectStack(files)) continue;
    modules.push(await describeFolder(folder, files, root, mapping));
  }

  for (const sourceRoot of findSourceRoots(folders, manifestRoots))
    modules.push(
      ...(await describeSourceRoot(
        sourceRoot,
        membersOf(sourceRoot, folders, manifestRoots),
        root,
        mapping
      ))
    );

  if (modules.length === 0) {
    const { files } = folders[0];

    modules.push(await describeFolder(start, files, root, mapping));
  }

  return modules.sort(
    (left, right) =>
      naturalCompare(left.module, right.module) ||
      naturalCompare(left.stack, right.stack)
  );
};
