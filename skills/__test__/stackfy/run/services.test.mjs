import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCases } from '../../../stackfy/scripts/runner/cases.mjs';

const readLog = async (path) =>
  (await readFile(path, 'utf8')).trim().split('\n');

await describe('Infrastructure a module needs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackfy-services-'));
  const module = 'modulo01/exemplo-12-neo4j';
  const log = join(root, 'services.log');
  const bin = join(root, 'bin');
  const options = {
    root,
    cwd: root,
    host: '127.0.0.1',
    timeout: 30000,
    command: `echo case >> ${log}`,
  };

  await mkdir(join(root, module), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, 'docker'),
    `#!/bin/sh\necho "docker $*" >> ${log}\n`
  );
  await chmod(join(bin, 'docker'), 0o755);

  await it('comes up before the cases and goes down after them, even when a case fails', async () => {
    await rm(log, { force: true });

    const results = await runCases(
      {
        module,
        services: { up: `echo up >> ${log}`, down: `echo down >> ${log}` },
        cases: [
          { name: 'fails', expect: [{ type: 'exit', code: 1 }] },
          { name: 'passes', expect: [{ type: 'exit', code: 0 }] },
        ],
      },
      options
    );

    strict.deepEqual(
      results.map(({ pass }) => pass),
      [false, true]
    );
    strict.deepEqual(await readLog(log), ['up', 'case', 'case', 'down']);
  });

  await it('starts only the named services of the compose file beside the module and removes them after', async () => {
    const path = process.env.PATH;

    await rm(log, { force: true });
    process.env.PATH = `${bin}:${path}`;

    await runCases(
      {
        module,
        services: { compose: 'docker-compose.yml', only: ['neo4j'] },
        cases: [{ name: 'passes', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    ).finally(() => {
      process.env.PATH = path;
    });

    const compose = `compose -f ${join(root, module, 'docker-compose.yml')} -p stackfy-exemplo-12-neo4j`;

    strict.deepEqual(await readLog(log), [
      `docker ${compose} up -d --wait neo4j`,
      'case',
      `docker ${compose} down -v`,
    ]);
  });

  await it('services that do not start stop the run before any case', async () => {
    await rm(log, { force: true });

    const run = runCases(
      {
        module,
        services: { up: 'exit 1', down: `echo down >> ${log}` },
        cases: [{ name: 'never runs', expect: [{ type: 'exit', code: 0 }] }],
      },
      options
    );

    await strict.rejects(run);
    strict.deepEqual(await readLog(log), ['down']);
  });

  await rm(root, { recursive: true, force: true });
});
