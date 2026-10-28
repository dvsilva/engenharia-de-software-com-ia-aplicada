import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { runCases } from './cases.mjs';
import { isFilledText } from './json.mjs';
import { runProcess } from './processes.mjs';

const isText = (value) => typeof value === 'string';

const isListOf = (value, isItem) =>
  value === undefined || (Array.isArray(value) && value.every(isItem));

const isPatch = (patch) =>
  isFilledText(patch?.file) &&
  isFilledText(patch.find) &&
  isText(patch.replace);

const isValidPreparation = (prepare) =>
  typeof prepare === 'object' &&
  prepare !== null &&
  (prepare.copy === undefined || isFilledText(prepare.copy)) &&
  isListOf(prepare.files, isFilledText) &&
  isListOf(prepare.path, isFilledText) &&
  isListOf(prepare.setup, isFilledText) &&
  isListOf(prepare.patches, isPatch);

const isInside = (folder, path) => {
  const route = relative(folder, path);

  return route !== '..' && !route.startsWith(`..${sep}`) && !isAbsolute(route);
};

const inside = (folder, path) => {
  const resolved = resolve(folder, path);
  if (isInside(folder, resolved)) return resolved;

  throw new Error(`${path} leaves the folder it belongs to`);
};

const placeSupportFiles = async (files, { support, module, copy, cwd }) => {
  for (const path of files)
    await cp(
      inside(support, join(module, path)),
      inside(copy, join(cwd, path)),
      {
        recursive: true,
      }
    );
};

const isFolder = (path) =>
  stat(path).then(
    (stats) => stats.isDirectory(),
    () => false
  );

const requirePathFolders = async (folders, cwd) => {
  for (const folder of folders)
    if (!(await isFolder(folder)))
      throw new Error(
        `the original's path folder is missing after its setup: ${relative(cwd, folder)}`
      );
};

const runSetup = async (commands, { cwd, path }) => {
  for (const command of commands) {
    const { code, output } = await runProcess('sh', ['-c', command], {
      cwd,
      env: { ...process.env, PATH: path },
    });

    if (code !== 0)
      throw new Error(
        `the original's setup failed: ${command}\n${output.trim()}`
      );
  }
};

const applyPatches = async (patches, { copy, cwd }) => {
  for (const { file, find, replace } of patches) {
    const path = inside(copy, join(cwd, file));
    const text = await readFile(path, 'utf8');

    if (!text.includes(find))
      throw new Error(
        `the original's patch no longer applies to ${file}: ${find}`
      );

    await writeFile(
      path,
      text.replaceAll(find, () => replace)
    );
  }
};

const prepareCopy = async ({ module, prepare = {} }, { root, support }) => {
  if (!isValidPreparation(prepare))
    throw new Error("the cases file's prepare is not valid");

  const copied = inside(root, prepare.copy ?? module);
  const copy = await realpath(
    await mkdtemp(join(tmpdir(), 'stackfy-original-'))
  );
  const remove = () => rm(copy, { recursive: true, force: true });

  try {
    const cwd = inside(copy, module);
    const folders = (prepare.path ?? []).map((folder) =>
      inside(copy, join(cwd, folder))
    );
    const path = [...folders, process.env.PATH].join(delimiter);

    if (!isInside(copied, resolve(root, module)))
      throw new Error(`${prepare.copy} does not hold ${module}`);

    await cp(copied, inside(copy, relative(root, copied)), {
      recursive: true,
      verbatimSymlinks: true,
    });
    await placeSupportFiles(prepare.files ?? [], {
      support,
      module,
      copy,
      cwd,
    });
    await runSetup(prepare.setup ?? [], { cwd, path });
    await requirePathFolders(folders, cwd);
    await applyPatches(prepare.patches ?? [], { copy, cwd });

    return { root: copy, cwd, path, remove };
  } catch (error) {
    await remove();
    throw error;
  }
};

const withPath = (definition, path) => ({
  ...definition,
  env: { ...definition.env, PATH: path },
});

export const runOriginals = async (definition, options) => {
  const copy = await prepareCopy(definition, options);
  const runs = [];

  try {
    for (const command of definition.originals)
      runs.push({
        command,
        results: await runCases(withPath(definition, copy.path), {
          ...options,
          root: copy.root,
          command,
          cwd: copy.cwd,
        }),
      });
  } finally {
    await copy.remove();
  }

  return runs;
};
