import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describeFile } from './checks.mjs';

const SEED_AGE = 1000;

const DOWNLOADS = join(tmpdir(), 'stackfy-downloads');

const readIfWritten = async (path, since) => {
  try {
    const { mtimeMs } = await stat(path);

    return mtimeMs >= since ? [await readFile(path, 'utf8')] : [];
  } catch {
    return [];
  }
};

const readWrittenNamed = async (folder, name, since) => {
  const pattern = new RegExp(name);
  const entries = await readdir(folder).catch(() => []);
  const written = await Promise.all(
    entries
      .filter((entry) => pattern.test(entry))
      .map((entry) => readIfWritten(join(folder, entry), since))
  );

  return written.flat();
};

export const readWrittenFiles = async (checks, cwd, since) => {
  const files = {};

  for (const check of checks.filter(({ type }) => type === 'file')) {
    const absolute = resolve(cwd, check.path);

    files[describeFile(check)] =
      check.name === undefined
        ? await readIfWritten(absolute, since)
        : await readWrittenNamed(absolute, check.name, since);
  }

  return files;
};

const readExisting = (path) => readFile(path).catch(() => null);

const digestOf = (content) =>
  createHash('sha256').update(content).digest('hex');

const keepDownload = async (path, content) => {
  const partial = `${path}.${process.pid}`;

  await mkdir(DOWNLOADS, { recursive: true });
  await writeFile(partial, content);
  await rename(partial, path);
};

const fetchBytes = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return { error: `answered ${response.status}` };

    return { content: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    return { error: error.message };
  }
};

const download = async ({ $download: url, sha256 }) => {
  const cached = join(DOWNLOADS, sha256);
  const kept = await readExisting(cached);
  if (kept && digestOf(kept) === sha256) return { content: kept };

  const { content, error } = await fetchBytes(url);
  if (error) return { error: `could not download ${url}: ${error}` };
  if (digestOf(content) !== sha256)
    return { error: `${url} does not match its sha256 ${sha256}` };

  await keepDownload(cached, content);
  return { content };
};

export const downloadSeeds = async (seeds) => {
  const entries = await Promise.all(
    Object.entries(seeds).map(async ([path, content]) => [
      path,
      content?.$download === undefined ? { content } : await download(content),
    ])
  );
  const failure = entries.find(([, { error }]) => error);
  if (failure) return { error: failure[1].error };

  return {
    files: Object.fromEntries(
      entries.map(([path, { content }]) => [path, content])
    ),
  };
};

const seedContent = (content) => {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === 'string') return content;
  if (typeof content?.$base64 === 'string')
    return Buffer.from(content.$base64, 'base64');

  return `${JSON.stringify(content, null, 2)}\n`;
};

const placeFile = async (path, content, time) => {
  if (content === null) return rm(path, { force: true });

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, seedContent(content));
  await utimes(path, time, time);
};

export const seedFiles = async (seeds, cwd, since) => {
  const time = new Date(since - SEED_AGE);
  const previous = [];

  for (const [path, content] of Object.entries(seeds)) {
    const absolute = resolve(cwd, path);

    previous.push([absolute, await readExisting(absolute)]);
    await placeFile(absolute, content, time);
  }

  return () =>
    Promise.all(
      previous.map(([absolute, original]) =>
        original === null
          ? rm(absolute, { force: true })
          : writeFile(absolute, original)
      )
    );
};
