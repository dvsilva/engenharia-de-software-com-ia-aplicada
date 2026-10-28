import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { slugTarget } from '../../../stackfy/scripts/scanner/targets.mjs';
import { listTranscriptions } from '../../../stackfy/scripts/scanner/transcriptions.mjs';

const targets = [
  ['C#', 'csharp'],
  ['C++', 'cpp'],
  ['Golang', 'go'],
  ['TS', 'typescript'],
  ['Node.js', 'javascript'],
  ['Python', 'python'],
  [' Vue 3 ', 'vue-3'],
];

await describe('Transcriptions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackfy-transcriptions-'));

  for (const folder of [
    'modulo01/exemplo-00-z',
    'modulo01/exemplo-10-ollama',
    'modulo01/exemplo-00-z.python',
    'modulo01/exemplo-10-ollama.go',
    'modulo05/cfp-platform',
    'modulo05/cfp-platform.react/frontend/node_modules/left-pad',
    'modulo05/cfp-platform.react/frontend-e2e',
  ])
    await mkdir(join(root, folder), { recursive: true });

  await writeFile(
    join(root, 'modulo01/exemplo-00-z.python/requirements.txt'),
    'tensorflow==2.21.0\n'
  );
  await writeFile(
    join(root, 'modulo01/exemplo-10-ollama.go/go.mod'),
    'module x\n\ngo 1.22\n'
  );
  await writeFile(
    join(root, 'modulo05/cfp-platform.react/frontend/package.json'),
    '{"dependencies":{"react":"^19.3.1"},"devDependencies":{"vite":"^8.3.5"}}'
  );
  await writeFile(
    join(
      root,
      'modulo05/cfp-platform.react/frontend/node_modules/left-pad/package.json'
    ),
    '{"dependencies":{"installed-only":"1"}}'
  );
  await writeFile(
    join(root, 'modulo05/cfp-platform.react/frontend-e2e/package.json'),
    '{"devDependencies":{"cypress":"15.13.0","typescript":"~5.9.2"}}'
  );

  for (const [typed, slug] of targets)
    it(`"${typed}" names the same folder suffix as "${slug}"`, () => {
      strict.equal(slugTarget(typed), slug);
    });

  await it('finds earlier transcriptions to a target with the libraries they use', async () => {
    const transcriptions = await listTranscriptions(root, 'Python');

    strict.deepEqual(transcriptions, [
      {
        folder: 'modulo01/exemplo-00-z.python',
        original: 'modulo01/exemplo-00-z',
        target: 'python',
        stack: 'python',
        dependencies: ['tensorflow'],
      },
    ]);
  });

  await it('reads the libraries of every project inside a transcription, leaving installed packages out', async () => {
    const transcriptions = await listTranscriptions(root, 'React');

    strict.deepEqual(transcriptions, [
      {
        folder: 'modulo05/cfp-platform.react',
        original: 'modulo05/cfp-platform',
        target: 'react',
        stack: 'node',
        dependencies: ['cypress', 'react', 'typescript', 'vite'],
      },
    ]);
  });

  await it('finds nothing for a target the student never used', async () => {
    strict.deepEqual(await listTranscriptions(root, 'rust'), []);
  });

  await rm(root, { recursive: true, force: true });
});
