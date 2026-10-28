import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runOriginals } from '../../../stackfy/scripts/runner/originals.mjs';

const module = 'modulo01/exemplo-11-openrouter';

const exists = (path) =>
  access(path).then(
    () => true,
    () => false
  );

const snapshot = async (folder) => {
  const paths = await readdir(folder, { recursive: true, withFileTypes: true });
  const files = paths.filter((entry) => entry.isFile());

  return Object.fromEntries(
    await Promise.all(
      files.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);

        return [path, await readFile(path, 'utf8')];
      })
    )
  );
};

const passesWith = (pattern) => [
  { type: 'exit', code: 0 },
  { type: 'output', pattern },
];

await describe("Preparing the original's copy", async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-originals-test-'));
  const root = join(folder, 'course');
  const support = join(folder, 'support');
  const log = join(folder, 'copy.log');
  const options = { root, support, host: '127.0.0.1', timeout: 30000 };

  await mkdir(join(root, module), { recursive: true });
  await mkdir(join(root, 'modulo01/exemplo-10-ollama'), { recursive: true });
  await mkdir(join(support, module), { recursive: true });
  await writeFile(
    join(root, module, 'request.sh'),
    'echo https://openrouter.ai/api/v1\n'
  );
  await writeFile(
    join(root, 'modulo01/exemplo-10-ollama/request.sh'),
    'echo ollama\n'
  );
  await writeFile(join(support, module, 'driver.sh'), 'echo driver\n');

  const course = await snapshot(root);

  await it('never writes the course folder, even when the original, its setup, and its patches write files', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: {
          files: ['driver.sh'],
          setup: ['echo installed > setup.txt'],
          patches: [
            { file: 'request.sh', find: 'openrouter.ai', replace: 'replay' },
          ],
        },
        originals: ['echo written > main.tf'],
        cases: [{ name: 'writes', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
    strict.deepEqual(await snapshot(root), course);
  });

  await it('a declared patch reaches the copy, installed dependencies included', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: {
          setup: [
            'mkdir -p node_modules/client && echo https://openrouter.ai/api/v1 > node_modules/client/address',
          ],
          patches: [
            {
              file: 'request.sh',
              find: 'https://openrouter.ai/api/v1',
              replace: '$OPENAI_BASE_URL',
            },
            {
              file: 'node_modules/client/address',
              find: 'https://openrouter.ai',
              replace: 'http://127.0.0.1',
            },
          ],
        },
        originals: [
          'OPENAI_BASE_URL=http://replay/v1 sh request.sh && cat node_modules/client/address',
        ],
        cases: [
          {
            name: 'calls the patched addresses',
            expect: passesWith(
              '^http://replay/v1\\nhttp://127\\.0\\.0\\.1/api/v1\\n$'
            ),
          },
        ],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a support file the skill keeps for the module is present in the copy', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: { files: ['driver.sh'] },
        originals: ['sh driver.sh'],
        cases: [{ name: 'runs the driver', expect: passesWith('^driver\\n$') }],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a wider copy holds the sibling lessons the cases reach', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: { copy: 'modulo01' },
        originals: ['sh ../exemplo-10-ollama/request.sh'],
        cases: [{ name: 'runs a sibling', expect: passesWith('^ollama\\n$') }],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a path the original resolves by itself is the folder the cases name as {cwd}', async () => {
    const runs = await runOriginals(
      {
        module,
        originals: ['resolve "$(pwd -P)/request.sh"'],
        cases: [
          {
            name: 'resolves its own folder',
            commands: {
              resolve: [{ args: ['{cwd}/request.sh'], stdout: 'matched\n' }],
            },
            expect: passesWith('^matched\\n$'),
          },
        ],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a runtime a setup command places in a path folder comes first on PATH for the later setup commands and the original', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: {
          path: ['runtime'],
          setup: [
            'mkdir runtime && printf "#!/bin/sh\\necho runtime 22\\n" > runtime/tool && chmod +x runtime/tool',
            'tool > setup.txt',
          ],
        },
        originals: ['cat setup.txt && tool'],
        cases: [
          {
            name: 'runs the placed runtime',
            expect: passesWith('^runtime 22\\nruntime 22\\n$'),
          },
        ],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a stand-in lets the calls it does not record through to the runtime in a path folder', async () => {
    const runs = await runOriginals(
      {
        module,
        prepare: {
          path: ['runtime'],
          setup: [
            'mkdir runtime && printf "#!/bin/sh\\necho runtime \\"\\$@\\"\\n" > runtime/tool && chmod +x runtime/tool',
          ],
        },
        originals: ['tool --version && tool generate'],
        cases: [
          {
            name: 'answers one call and lets the other through',
            commands: {
              tool: [
                { args: ['--version'], stdout: 'stand-in\n' },
                { passthrough: true },
              ],
            },
            expect: passesWith('^stand-in\\nruntime generate\\n$'),
          },
        ],
      },
      options
    );

    strict.equal(runs[0].results[0].pass, true);
  });

  await it('a path folder its setup never creates stops the run before any case, naming the folder', async () => {
    const failure = await runOriginals(
      {
        module,
        prepare: { path: ['runtime'], setup: [`pwd > ${log}`] },
        originals: [`echo case > ${join(folder, 'case.log')}`],
        cases: [{ name: 'never runs', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    ).then(
      () => '',
      (error) => error.message
    );
    const copy = (await readFile(log, 'utf8')).trim();

    strict.match(failure, /path folder is missing after its setup: runtime$/);
    strict.equal(await exists(copy), false);
    strict.equal(await exists(join(folder, 'case.log')), false);
  });

  await it('the copy is removed after a case fails', async () => {
    const runs = await runOriginals(
      {
        module,
        originals: [`pwd > ${log}; exit 1`],
        cases: [{ name: 'fails', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    );
    const copy = (await readFile(log, 'utf8')).trim();

    strict.equal(runs[0].results[0].pass, false);
    strict.equal(await exists(copy), false);
  });

  await it('the copy is removed after its setup fails, which stops the run before any case', async () => {
    const failure = await runOriginals(
      {
        module,
        prepare: { setup: [`pwd > ${log}; exit 1`] },
        originals: [`echo case > ${join(folder, 'case.log')}`],
        cases: [{ name: 'never runs', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    ).then(
      () => '',
      (error) => error.message
    );
    const copy = (await readFile(log, 'utf8')).trim();

    strict.match(failure, /setup failed/);
    strict.equal(await exists(copy), false);
    strict.equal(await exists(join(folder, 'case.log')), false);
  });

  await it('a patch whose text the module no longer holds stops the run', async () => {
    const run = runOriginals(
      {
        module,
        prepare: {
          patches: [
            {
              file: 'request.sh',
              find: 'https://api.openai.com',
              replace: '$OPENAI_BASE_URL',
            },
          ],
        },
        originals: ['sh request.sh'],
        cases: [{ name: 'never runs', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    );

    await strict.rejects(run, /no longer applies to request\.sh/);
  });

  await rm(folder, { recursive: true, force: true });
});
