import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isCourseModule, naturalCompare } from './folders.mjs';
import { filesChangedSince, lastCommitOf, readHeadEntries } from './git.mjs';

const LOCK = fileURLToPath(new URL('../../survey-lock.json', import.meta.url));

const LOCK_VERSION = 1;

const PRINT_WIDTH = 80;

export const isInsideFolder = (path, folder) => path.startsWith(`${folder}/`);

const isWithinFolder = (path, folder) =>
  path === folder || isInsideFolder(path, folder);

const parentOf = (path) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

const holdsAny = (folder, surveyed) =>
  surveyed.some((other) => isInsideFolder(other, folder));

const leavesOf = (surveyed) =>
  surveyed.filter((folder) => !holdsAny(folder, surveyed));

const affecting = (id, leaves) => (path) =>
  isWithinFolder(path, id) ||
  (leaves.includes(path) && isInsideFolder(id, path));

export const holdsSurveyed = (folder, folders) =>
  holdsAny(folder, Object.keys(folders));

export const readLock = async () => {
  const text = await readFile(LOCK, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;

    throw error;
  });

  return text === null ? {} : JSON.parse(text).folders;
};

const inlineShortLists = (json) =>
  json.replace(
    /^( *"[^"\n]+": )\[\n((?: *"[^"\n]*",?\n)+) *\]/gm,
    (block, key, items) => {
      const inline = `${key}[${items.trim().split(/,\n */).join(', ')}]`;

      return inline.length <= PRINT_WIDTH ? inline : block;
    }
  );

export const writeLock = async (folders) => {
  const sorted = Object.entries(folders).sort(([left], [right]) =>
    naturalCompare(left, right)
  );
  const lock = { version: LOCK_VERSION, folders: Object.fromEntries(sorted) };

  await writeFile(LOCK, `${inlineShortLists(JSON.stringify(lock, null, 2))}\n`);
};

export const readHead = async (root) => {
  const entries = await readHeadEntries(root);
  if (entries === null) return null;

  const course = entries.filter(({ path }) => isCourseModule(path));
  const trees = course.filter(({ type }) => type === 'tree');
  const files = course.filter(({ type }) => type !== 'tree');

  return {
    trees: new Map(trees.map(({ path, hash }) => [path, hash])),
    files: Map.groupBy(files, ({ path }) => parentOf(path)),
    algorithm: entries[0]?.hash.length === 64 ? 'sha256' : 'sha1',
  };
};

const ownFilesHash = (files, algorithm) => {
  const body = Buffer.concat(
    files.flatMap(({ mode, path, hash }) => [
      Buffer.from(`${mode} ${nameOf(path)}\0`),
      Buffer.from(hash, 'hex'),
    ])
  );

  return createHash(algorithm)
    .update(`tree ${body.length}\0`)
    .update(body)
    .digest('hex');
};

const hashOf = (folder, surveyed, head) => {
  if (!head.trees.has(folder)) return null;
  if (!holdsAny(folder, surveyed)) return head.trees.get(folder);

  return ownFilesHash(head.files.get(folder) ?? [], head.algorithm);
};

const findUnsurveyed = (surveyed, head) => {
  const leaves = leavesOf(surveyed);
  const uncovered = [...head.trees.keys()].filter(
    (path) =>
      !surveyed.includes(path) &&
      !leaves.some((leaf) => isInsideFolder(path, leaf))
  );
  const fresh = uncovered.filter((path) => !holdsAny(path, surveyed));
  const freshFolders = new Set(fresh);
  const topmost = fresh.filter((path) => !freshFolders.has(parentOf(path)));
  const withOwnFiles = uncovered.filter(
    (path) => holdsAny(path, surveyed) && head.files.has(path)
  );

  return { fresh, unsurveyed: [...topmost, ...withOwnFiles] };
};

const findMoves = (missing, fresh, folders, head) =>
  missing
    .map((from) => ({
      from,
      targets: fresh.filter(
        (path) => head.trees.get(path) === folders[from].tree
      ),
    }))
    .filter(({ targets }) => targets.length === 1)
    .map(({ from, targets: [to] }) => ({ from, to }))
    .filter(
      ({ to }, _, moves) => moves.filter((move) => move.to === to).length === 1
    );

export const compareSurvey = (folders, head) => {
  const surveyed = Object.keys(folders);
  const current = new Map(
    surveyed.map((folder) => [folder, hashOf(folder, surveyed, head)])
  );
  const missing = surveyed.filter((folder) => current.get(folder) === null);
  const { fresh, unsurveyed } = findUnsurveyed(surveyed, head);
  const moved = findMoves(missing, fresh, folders, head);
  const changed = surveyed.filter(
    (folder) =>
      current.get(folder) !== null &&
      current.get(folder) !== folders[folder].tree
  );

  return {
    changed: changed.sort(naturalCompare),
    new: unsurveyed
      .filter((path) => !moved.some(({ to }) => to === path))
      .sort(naturalCompare),
    moved,
    removed: missing
      .filter((folder) => !moved.some(({ from }) => from === folder))
      .sort(naturalCompare),
  };
};

const touchedBy = (comparison) => [
  ...comparison.changed,
  ...comparison.new,
  ...comparison.removed,
  ...comparison.moved.flatMap(({ from, to }) => [from, to]),
];

export const surveyOf = (id, folders, comparison) => {
  if (comparison === null) return 'unknown';

  const surveyed = Object.keys(folders);
  const leaves = leavesOf(surveyed);
  const isSurveyed =
    surveyed.includes(id) || leaves.some((leaf) => isInsideFolder(id, leaf));
  if (!isSurveyed) return 'new';

  return touchedBy(comparison).some(affecting(id, leaves))
    ? 'changed'
    : 'current';
};

export const changesWithin = async (root, id, folders, comparison) => {
  const surveyed = Object.keys(folders);
  const affects = affecting(id, leavesOf(surveyed));
  const changed = await Promise.all(
    comparison.changed.filter(affects).map(async (folder) => {
      const { commit } = folders[folder];
      const files = await filesChangedSince(root, commit, folder);
      const ownFiles = holdsAny(folder, surveyed)
        ? files?.filter(({ path }) => parentOf(path) === folder)
        : files;

      return { folder, commit, files: ownFiles ?? null };
    })
  );

  return {
    changed,
    new: comparison.new.filter(affects),
    moved: comparison.moved.filter(
      ({ from, to }) => affects(from) || affects(to)
    ),
    removed: comparison.removed.filter(affects),
  };
};

const keepKinds = (previous, next, head) => {
  const before = Object.keys(previous);
  const after = Object.keys(next);

  return Object.fromEntries(
    Object.entries(next).map(([folder, entry]) => {
      const kindChanged = holdsAny(folder, before) !== holdsAny(folder, after);
      const wasCurrent =
        previous[folder]?.tree === hashOf(folder, before, head);

      return [
        folder,
        kindChanged && wasCurrent
          ? { ...entry, tree: hashOf(folder, after, head) }
          : entry,
      ];
    })
  );
};

const linkedExamples = (lists) =>
  [...new Set(lists.flat())].sort(naturalCompare);

export const stampFolders = async (
  root,
  ids,
  folders,
  head,
  { examples = [], from } = {}
) => {
  const kept = Object.fromEntries(
    Object.entries(folders).filter(([folder]) => folder !== from)
  );
  const surveyed = [...new Set([...Object.keys(kept), ...ids])];
  const carried = from === undefined ? [] : (folders[from]?.examples ?? []);
  const stamped = await Promise.all(
    ids.map(async (id) => {
      const linked = linkedExamples([
        folders[id]?.examples ?? [],
        carried,
        examples,
      ]);
      const entry = {
        commit: await lastCommitOf(root, id),
        tree: hashOf(id, surveyed, head),
      };

      return [id, linked.length > 0 ? { ...entry, examples: linked } : entry];
    })
  );

  return keepKinds(folders, { ...kept, ...Object.fromEntries(stamped) }, head);
};

export const forgetFolders = (ids, folders, head) =>
  keepKinds(
    folders,
    Object.fromEntries(
      Object.entries(folders).filter(([folder]) => !ids.includes(folder))
    ),
    head
  );
