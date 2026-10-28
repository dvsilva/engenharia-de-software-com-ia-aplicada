import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, strict } from 'poku';

const scripts = fileURLToPath(
  new URL('../../stackfy/scripts/', import.meta.url)
);
const scan = join(scripts, 'scan.mjs');
const run = join(scripts, 'run.mjs');

const exitCodeOf = (args) =>
  spawnSync(process.execPath, args, { encoding: 'utf8' }).status;

await describe('Exit codes the skill relies on', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-cli-'));
  const cases = join(folder, 'cases.json');
  const originals = {
    passing: join(folder, 'passing-originals.json'),
    failing: join(folder, 'failing-originals.json'),
  };
  const exitsCleanly = [
    { name: 'exits cleanly', expect: [{ type: 'exit', code: 0 }] },
  ];

  await writeFile(cases, JSON.stringify({ cases: exitsCleanly }));
  await writeFile(
    originals.passing,
    JSON.stringify({
      module: '.',
      originals: ['node -e ""'],
      cases: exitsCleanly,
    })
  );
  await writeFile(
    originals.failing,
    JSON.stringify({
      module: '.',
      originals: ['node -e ""', 'node -e "process.exit(3)"'],
      cases: exitsCleanly,
    })
  );

  const courses = {
    clean: join(folder, 'clean'),
    uncovered: join(folder, 'uncovered'),
  };

  await mkdir(join(courses.clean, 'modulo01/notes'), { recursive: true });
  await mkdir(join(courses.uncovered, 'modulo01/server'), { recursive: true });
  await writeFile(
    join(courses.uncovered, 'modulo01/server/package.json'),
    '{"dependencies":{"a-library-no-course-maps":"1"}}'
  );

  const contract = [
    ['scan: a missing folder', [scan, '--scan', join(folder, 'missing')], 2],
    [
      'scan: an audit with nothing left to cover',
      [scan, '--audit', '--root', courses.clean],
      0,
    ],
    [
      'scan: an audit that finds a module to cover',
      [scan, '--audit', '--root', courses.uncovered],
      1,
    ],
    [
      'scan: a toolchain support has not listed',
      [scan, '--toolchain', 'cobol'],
      2,
    ],
    [
      'scan: two modes at once',
      [scan, '--toolchain', 'go', '--transcriptions'],
      64,
    ],
    [
      'scan: the changes of a course outside Git',
      [scan, '--changes', 'modulo01/notes', '--root', courses.clean],
      2,
    ],
    [
      'scan: stamping a course outside Git',
      [scan, '--stamp', 'modulo01/notes', '--root', courses.clean],
      2,
    ],
    [
      'scan: one tested transcription linked to two folders',
      [
        scan,
        '--stamp',
        'modulo01/notes',
        '--stamp',
        'modulo01/server',
        '--example',
        'training/python/notes',
      ],
      64,
    ],
    ['run: no case or command', [run], 64],
    [
      'run: a command and the original at once',
      [run, '--case', cases, '--cmd', 'true', '--original'],
      64,
    ],
    [
      'run: the original of a cases file that records none',
      [run, '--case', cases, '--original'],
      2,
    ],
    [
      'run: one recorded original failing',
      [run, '--case', originals.failing, '--original', '--root', folder],
      1,
    ],
    [
      'run: every recorded original passing',
      [run, '--case', originals.passing, '--original', '--root', folder],
      0,
    ],
    [
      'run: a missing cases file',
      [run, '--case', join(folder, 'missing.json'), '--cmd', 'true'],
      2,
    ],
    [
      'run: a failing case',
      [run, '--case', cases, '--cmd', 'node -e "process.exit(3)"'],
      1,
    ],
    [
      'run: every case passing',
      [run, '--case', cases, '--cmd', 'node -e ""'],
      0,
    ],
  ];

  for (const [situation, args, code] of contract)
    it(`${situation} exits with ${code}`, () => {
      strict.equal(exitCodeOf(args), code);
    });

  await rm(folder, { recursive: true, force: true });
});
