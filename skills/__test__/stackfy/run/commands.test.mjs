import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const tokenCase = {
  name: 'reads an access token from gcloud',
  commands: {
    gcloud: [
      { args: ['auth', 'print-access-token'], stdout: "ya29.it's-recorded\n" },
      { args: ['auth', 'login'], stderr: 'ERROR: no browser\n', code: 1 },
    ],
    uname: [{ args: ['-s'], stdout: 'Recorded\n' }],
  },
  expect: [
    { type: 'exit', code: 0 },
    { type: 'output', pattern: "^ya29\\.it's-recorded\\n$" },
  ],
};

const programs = [
  {
    promise: 'a program that runs a recorded command reads what it printed',
    command: 'gcloud auth print-access-token',
    pass: true,
  },
  {
    promise: 'a command run with arguments the case does not record fails',
    command: 'gcloud auth print-access-token --quiet',
    pass: false,
  },
];

await describe('Answering the command-line tools a transcription runs', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-commands-test-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const { promise, command, pass } of programs)
    await it(promise, async () => {
      const result = await runCase(tokenCase, { ...options, command });

      strict.equal(result.pass, pass);
    });

  await it('a recorded command takes the place of one already installed', async () => {
    const result = await runCase(
      {
        ...tokenCase,
        expect: [{ type: 'output', pattern: '^Recorded\\n$' }],
      },
      { ...options, command: 'uname -s' }
    );

    strict.equal(result.pass, true);
  });

  await it('a recorded failure hands the program its message and exit code', async () => {
    const result = await runCase(
      {
        ...tokenCase,
        expect: [
          { type: 'exit', code: 1 },
          {
            type: 'output',
            stream: 'stderr',
            pattern: '^ERROR: no browser\\n$',
          },
        ],
      },
      { ...options, command: 'gcloud auth login' }
    );

    strict.equal(result.pass, true);
  });

  await it('a call the case lets through runs the installed tool, which still reaches the recorded calls', async () => {
    const result = await runCase(
      {
        name: 'starts a program with the same tool it runs',
        commands: {
          node: [
            { args: ['--version'], stdout: 'v0.0.0-recorded\n' },
            { passthrough: true },
          ],
        },
        expect: [
          { type: 'exit', code: 0 },
          { type: 'output', pattern: '^installed\\nv0\\.0\\.0-recorded\\n$' },
        ],
      },
      {
        ...options,
        command: `node -e "console.log('installed'); require('node:child_process').execFileSync('node', ['--version'], { stdio: 'inherit' })"`,
      }
    );

    strict.equal(result.pass, true);
  });

  await it("a recorded call names a path inside the transcription's folder", async () => {
    const workingDirectory = await realpath(folder);
    const result = await runCase(
      {
        name: 'loads an adapter beside the program',
        commands: {
          trainer: [
            {
              args: ['--adapter-path', '{cwd}/adapters'],
              stderr: 'missing {cwd}/adapters\n',
              code: 1,
            },
          ],
        },
        expect: [
          { type: 'exit', code: 1 },
          {
            type: 'output',
            stream: 'stderr',
            pattern: `^missing ${workingDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/adapters\\n$`,
          },
        ],
      },
      {
        ...options,
        cwd: workingDirectory,
        command: 'trainer --adapter-path "$(pwd -P)/adapters"',
      }
    );

    strict.equal(result.pass, true);
  });

  const siblingAdapters = [
    {
      promise:
        'a recorded call accepts an argument that differs per machine when it matches the pattern',
      command:
        'trainer --adapter-path "$(dirname "$(pwd -P)")/lesson-04/adapters"',
      pass: true,
    },
    {
      promise:
        'a recorded call refuses an argument that does not match the pattern',
      command: 'trainer --adapter-path "$(pwd -P)/lesson-04/checkpoints"',
      pass: false,
    },
  ];

  for (const { promise, command, pass } of siblingAdapters)
    await it(promise, async () => {
      const result = await runCase(
        {
          name: "loads an adapter from a sibling lesson's folder",
          commands: {
            trainer: [
              {
                args: ['--adapter-path', { $pattern: '/lesson-04/adapters$' }],
                stdout: 'loaded\n',
              },
            ],
          },
          expect: [
            { type: 'exit', code: 0 },
            { type: 'output', pattern: '^loaded\\n$' },
          ],
        },
        { ...options, command }
      );

      strict.equal(result.pass, pass);
    });

  await rm(folder, { recursive: true, force: true });
});
