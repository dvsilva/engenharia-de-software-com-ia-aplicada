import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

const git = async (root, args) => {
  try {
    const { stdout } = await execute('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });

    return stdout;
  } catch {
    return null;
  }
};

const recordsOf = (output) => output.split('\0').slice(0, -1);

const parseEntry = (record) => {
  const separator = record.indexOf('\t');
  const [mode, type, hash] = record.slice(0, separator).split(' ');

  return { mode, type, hash, path: record.slice(separator + 1) };
};

export const readHeadEntries = async (root) => {
  const prefix = await git(root, ['rev-parse', '--show-prefix']);
  if (prefix === null) return null;

  const listing = await git(root, [
    'ls-tree',
    '-r',
    '-t',
    '-z',
    '--full-tree',
    'HEAD',
  ]);
  if (listing === null) return null;

  const base = prefix.trim();

  return recordsOf(listing)
    .map(parseEntry)
    .filter(({ path }) => path.startsWith(base))
    .map((entry) => ({ ...entry, path: entry.path.slice(base.length) }));
};

export const lastCommitOf = async (root, folder) =>
  (await git(root, ['rev-list', '-1', 'HEAD', '--', folder]))?.trim() || null;

export const filesChangedSince = async (root, commit, folder) => {
  const output = await git(root, [
    'diff-tree',
    '-r',
    '-z',
    '--relative',
    '--no-renames',
    '--name-status',
    commit,
    'HEAD',
    '--',
    folder,
  ]);
  if (output === null) return null;

  const records = recordsOf(output);

  return Array.from({ length: records.length / 2 }, (_, index) => ({
    status: records[index * 2],
    path: records[index * 2 + 1],
  }));
};
