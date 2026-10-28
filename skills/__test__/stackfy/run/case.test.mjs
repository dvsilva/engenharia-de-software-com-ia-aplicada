import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const argumentCommands = [
  {
    promise:
      'runs the program and arguments a case names, quoted for the shell',
    command: 'node {program}.mjs',
  },
  {
    promise:
      'a command that chooses the program inline receives the arguments where it names them',
    command:
      'case {program} in echo-args) node echo-args.mjs {args} ;; *) exit 1 ;; esac',
  },
];

await describe('Starting the program a case names', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-case-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  await it('a variable a case sets to null leaves the program without it, even when the cases file sets it', async () => {
    await writeFile(
      join(folder, 'reading-key.mjs'),
      'console.log(JSON.stringify([process.env.GROQ_API_KEY ?? null]));'
    );

    const result = await runCase(
      {
        name: 'a key only a .env file holds',
        env: { GROQ_API_KEY: null },
        expect: [{ type: 'json', values: [[null]] }],
      },
      {
        ...options,
        env: { GROQ_API_KEY: 'replay' },
        command: 'node reading-key.mjs',
      }
    );

    strict.equal(result.pass, true);
  });

  await writeFile(
    join(folder, 'echo-args.mjs'),
    'console.log(JSON.stringify(process.argv.slice(2)));'
  );

  for (const { promise, command } of argumentCommands)
    await it(promise, async () => {
      const result = await runCase(
        {
          name: 'one of several programs',
          program: 'echo-args',
          args: ['--rank', 8, "it's a prompt"],
          expect: [
            { type: 'json', values: [['--rank', '8', "it's a prompt"]] },
          ],
        },
        { ...options, command }
      );

      strict.equal(result.pass, true);
    });

  await it('a case that names a program fails when the command cannot choose it', async () => {
    const result = await runCase(
      { name: 'one of several programs', program: 'echo-args', expect: [] },
      { ...options, command: 'node echo-args.mjs' }
    );

    strict.equal(result.pass, false);
  });

  await it('a case with a check the runner does not know fails', async () => {
    const result = await runCase(
      { name: 'unknown', expect: [{ type: 'snapshot' }] },
      { ...options, command: 'node -e ""' }
    );

    strict.equal(result.pass, false);
  });

  await rm(folder, { recursive: true, force: true });
});
