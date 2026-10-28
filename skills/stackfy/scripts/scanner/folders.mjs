import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SKIPPED_FOLDERS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  'vendor',
  '__pycache__',
  'venv',
]);

const TRANSCRIPTION_FOLDER = /^(?<original>[^.].*)\.(?<target>[a-z0-9-]+)$/;

const COURSE_MODULE = /^modulo\d+/;

export const isCourseModule = (name) => COURSE_MODULE.test(name);

export const naturalCompare = (left, right) =>
  left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });

const transcriptionOf = (name, siblings) => {
  const match = name.match(TRANSCRIPTION_FOLDER);
  if (!match || !siblings.has(match.groups.original)) return null;

  return { original: match.groups.original, target: match.groups.target };
};

export const walk = async (
  folder,
  found = { folders: [], transcriptions: [] }
) => {
  const entries = await readdir(folder, { withFileTypes: true });
  const directories = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !SKIPPED_FOLDERS.has(entry.name)
  );
  const siblings = new Set(directories.map((entry) => entry.name));

  found.folders.push({
    folder,
    files: entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  });

  for (const entry of directories) {
    const path = join(folder, entry.name);
    const transcription = transcriptionOf(entry.name, siblings);

    if (transcription) {
      found.transcriptions.push({
        folder: path,
        original: join(folder, transcription.original),
        target: transcription.target,
      });
      continue;
    }

    await walk(path, found);
  }

  return found;
};

export const toId = (root, path) =>
  relative(root, path).split(sep).join('/') || '.';

export const isWithin = (path, root) =>
  path === root || path.startsWith(`${root}${sep}`);
