import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const dataset = {
  name: 'writes the cleaned dataset',
  expect: [
    {
      type: 'file',
      path: 'out/dataset.jsonl',
      pattern: '^\\{"prompt"',
      values: [{ prompt: 'hi', completion: 'hello' }],
    },
  ],
};

const programs = [
  {
    promise: 'a program that writes the expected records passes',
    command:
      'mkdir -p out && echo \'{"prompt":"hi","completion":"hello"}\' > out/dataset.jsonl',
    pass: true,
  },
  {
    promise: 'a program that writes other records fails',
    command:
      'mkdir -p out && echo \'{"prompt":"hi","completion":"bye"}\' > out/dataset.jsonl',
    pass: false,
  },
];

await describe('Checking the files a transcription writes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-files-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const { promise, command, pass } of programs)
    await it(promise, async () => {
      const result = await runCase(dataset, { ...options, command });

      strict.equal(result.pass, pass);
    });

  await it('a file left from an earlier run does not count as written', async () => {
    const earlier = join(folder, 'out/dataset.jsonl');

    await writeFile(earlier, '{"prompt":"hi","completion":"hello"}\n');
    await utimes(earlier, new Date(0), new Date(0));

    const result = await runCase(dataset, { ...options, command: 'true' });

    strict.equal(result.pass, false);
  });

  await rm(folder, { recursive: true, force: true });
});

await describe('Checking a file named after the moment it was written', async () => {
  const answer = {
    name: 'writes the first answer',
    expect: [
      {
        type: 'file',
        path: 'answers',
        name: '^answer-0-\\d+\\.md$',
        pattern: '^hello$',
      },
    ],
  };
  const programs = [
    {
      promise: 'a program that writes the answer under a matching name passes',
      command: 'mkdir -p answers && printf hello > answers/answer-0-$$.md',
      pass: true,
    },
    {
      promise: 'a program that writes another answer under that name fails',
      command: 'mkdir -p answers && printf bye > answers/answer-0-$$.md',
      pass: false,
    },
    {
      promise: 'a program that writes the answer under another name fails',
      command: 'mkdir -p answers && printf hello > answers/reply-0-$$.md',
      pass: false,
    },
    {
      promise: 'a program that writes the answer twice fails',
      command:
        'mkdir -p answers && printf hello > answers/answer-0-1.md && printf hello > answers/answer-0-2.md',
      pass: false,
    },
  ];

  for (const { promise, command, pass } of programs)
    await it(promise, async () => {
      const folder = await mkdtemp(join(tmpdir(), 'stackfy-named-'));
      const result = await runCase(answer, {
        cwd: folder,
        host: '127.0.0.1',
        timeout: 30000,
        command,
      });

      await rm(folder, { recursive: true, force: true });

      strict.equal(result.pass, pass);
    });

  await it('an answer left from an earlier run does not count as written again', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'stackfy-named-'));
    const earlier = join(folder, 'answers/answer-0-1.md');

    await mkdir(join(folder, 'answers'));
    await writeFile(earlier, 'hello');
    await utimes(earlier, new Date(0), new Date(0));

    const result = await runCase(answer, {
      cwd: folder,
      host: '127.0.0.1',
      timeout: 30000,
      command: 'printf hello > answers/answer-0-2.md',
    });

    await rm(folder, { recursive: true, force: true });

    strict.equal(result.pass, true);
  });
});

await describe('Starting a case from seeded files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-seeds-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  await it('a program reads the JSON a case seeds', async () => {
    const result = await runCase(
      {
        name: 'lists the seeded tasks',
        files: { 'store.json': { tasks: ['buy milk'] } },
        expect: [{ type: 'json', values: [{ tasks: ['buy milk'] }] }],
      },
      { ...options, command: 'cat store.json' }
    );

    strict.equal(result.pass, true);
  });

  await it('a program reads the exact bytes of a binary file a case seeds', async () => {
    const result = await runCase(
      {
        name: 'dumps the seeded database',
        files: { 'store.db': { $base64: 'UwD/' } },
        expect: [{ type: 'output', pattern: '^\\s*53\\s+00\\s+ff\\s*$' }],
      },
      { ...options, command: 'od -An -tx1 store.db' }
    );

    strict.equal(result.pass, true);
  });

  await it('a seeded file the program never touches does not count as written', async () => {
    const result = await runCase(
      {
        name: 'rewrites the store',
        files: { 'store.json': '{"tasks":[]}' },
        expect: [{ type: 'file', path: 'store.json', values: [{ tasks: [] }] }],
      },
      { ...options, command: 'true' }
    );

    strict.equal(result.pass, false);
  });

  await it('a case leaves the folder as it found it', async () => {
    await writeFile(join(folder, 'store.json'), 'mine');
    await writeFile(join(folder, 'kept.json'), 'keep');

    const result = await runCase(
      {
        name: 'changes the seeded store',
        files: { 'store.json': 'seeded', 'new.json': 'new', 'kept.json': null },
        expect: [
          { type: 'exit', code: 0 },
          { type: 'output', pattern: '^new$' },
        ],
      },
      {
        ...options,
        command:
          'test ! -e kept.json && cat new.json && echo changed > store.json',
      }
    );
    const remaining = (await readdir(folder)).sort();
    const store = await readFile(join(folder, 'store.json'), 'utf8');
    const kept = await readFile(join(folder, 'kept.json'), 'utf8');

    strict.equal(result.pass, true);
    strict.deepEqual(remaining, ['kept.json', 'store.json']);
    strict.equal(store, 'mine');
    strict.equal(kept, 'keep');
  });

  await rm(folder, { recursive: true, force: true });
});

await describe('Starting a case from a downloaded file', async () => {
  const dataset =
    '{"instruction":"When did Virgin Australia start operating?"}\n';
  const datasetSha256 =
    '99b10d5e9ccfc845f1ee7c1646ab861bc408877b19ccf5ecc7854c160bc06a76';
  const otherSha256 =
    '7f116dd9503e8c9b14885ec254dac463927ed4abb753dfa1c0c8974dfd094ecd';
  const server = createServer((request, response) => {
    if (request.url !== '/dolly.jsonl') {
      response.writeHead(404);
      response.end();
      return;
    }

    response.end(dataset);
  });
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-downloads-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));

  const address = `http://127.0.0.1:${server.address().port}`;
  const readsDownload = (path, sha256) => ({
    name: 'prints the downloaded dataset',
    files: {
      'dolly.jsonl': { $download: `${address}${path}`, sha256 },
    },
    expect: [{ type: 'output', pattern: '^\\{"instruction":"When did' }],
  });
  const downloads = [
    {
      promise: 'a program reads the file a case downloads',
      download: readsDownload('/dolly.jsonl', datasetSha256),
      pass: true,
    },
    {
      promise: 'a download whose bytes differ from its SHA-256 fails the case',
      download: readsDownload('/dolly.jsonl', otherSha256),
      pass: false,
    },
    {
      promise: 'a download the server refuses fails the case',
      download: readsDownload('/missing.jsonl', otherSha256),
      pass: false,
    },
  ];

  for (const { promise, download, pass } of downloads)
    await it(promise, async () => {
      const result = await runCase(download, {
        ...options,
        command: 'cat dolly.jsonl',
      });

      strict.equal(result.pass, pass);
    });

  await it('a file downloaded once is read again without the network', async () => {
    await new Promise((closed) => server.close(closed));

    const result = await runCase(readsDownload('/dolly.jsonl', datasetSha256), {
      ...options,
      command: 'cat dolly.jsonl',
    });

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});
