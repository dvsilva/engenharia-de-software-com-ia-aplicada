import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, strict } from 'poku';

const run = fileURLToPath(
  new URL('../../../stackfy/scripts/run.mjs', import.meta.url)
);

const casesFiles = {
  'words.json': {
    module: 'unit06',
    cases: [
      { name: 'first', args: ['one'], expect: [{ type: 'exit', code: 0 }] },
      {
        name: 'second',
        args: ['two'],
        expect: [{ type: 'output', pattern: '^never$' }],
      },
    ],
  },
  'words-07.json': {
    module: 'unit07',
    extends: 'words.json',
    cases: [
      {
        name: 'second',
        args: ['two'],
        expect: [{ type: 'output', pattern: '^two\\n$' }],
      },
      { name: 'third', args: ['three'], expect: [{ type: 'exit', code: 0 }] },
    ],
  },
  'folder.json': {
    module: 'unit06',
    originals: ['basename "$PWD"'],
    cases: [
      {
        name: 'runs from its module',
        expect: [{ type: 'output', pattern: '^unit07\\n$' }],
      },
    ],
  },
  'folder-07.json': { module: 'unit07', extends: 'folder.json' },
  'chained.json': { module: 'unit08', extends: 'words-07.json' },
  'orphan.json': { module: 'unit08', extends: 'missing.json' },
};

const runCases = (args) => {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [run, ...args, '--json'],
    { encoding: 'utf8' }
  );

  return { status, stderr, results: status === 2 ? [] : JSON.parse(stdout) };
};

const summary = (results) => results.map(({ name, pass }) => [name, pass]);

await describe("Reusing another cases file's cases", async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-extends-test-'));
  const cases = join(folder, 'cases');
  const root = join(folder, 'course');

  await mkdir(cases);
  await mkdir(join(root, 'unit07'), { recursive: true });

  for (const [name, definition] of Object.entries(casesFiles))
    await writeFile(join(cases, name), JSON.stringify(definition));

  it('a transcription runs the inherited cases in order, an own case in place of the inherited one with its name, and the new ones after them', () => {
    const { status, results } = runCases([
      '--case',
      join(cases, 'words-07.json'),
      '--cmd',
      'echo',
    ]);

    strict.equal(status, 0);
    strict.deepEqual(summary(results), [
      ['first', true],
      ['second', true],
      ['third', true],
    ]);
  });

  it("the original of a cases file that extends another runs from the extending file's module", () => {
    const { status } = runCases([
      '--case',
      join(cases, 'folder-07.json'),
      '--original',
      '--root',
      root,
    ]);

    strict.equal(status, 0);
  });

  it('a cases file that extends one that extends another is refused, naming both', () => {
    const { status, stderr } = runCases([
      '--case',
      join(cases, 'chained.json'),
      '--cmd',
      'echo',
    ]);

    strict.equal(status, 2);
    strict.match(
      stderr,
      /words-07\.json extends another cases file itself: .*chained\.json/
    );
  });

  it('a cases file whose base is missing is refused, naming the base', () => {
    const { status, stderr } = runCases([
      '--case',
      join(cases, 'orphan.json'),
      '--cmd',
      'echo',
    ]);

    strict.equal(status, 2);
    strict.match(stderr, /cases file not found: .*missing\.json/);
  });

  await rm(folder, { recursive: true, force: true });
});
