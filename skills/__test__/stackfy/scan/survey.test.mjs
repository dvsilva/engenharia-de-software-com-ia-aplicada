import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it, strict } from 'poku';
import { audit } from '../../../stackfy/scripts/scanner/audit.mjs';
import {
  changesWithin,
  compareSurvey,
  forgetFolders,
  readHead,
  stampFolders,
  surveyOf,
} from '../../../stackfy/scripts/scanner/survey.mjs';

const execute = promisify(execFile);

const GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'stackfy',
  GIT_AUTHOR_EMAIL: 'stackfy@example.com',
  GIT_COMMITTER_NAME: 'stackfy',
  GIT_COMMITTER_EMAIL: 'stackfy@example.com',
};

const course = {
  'modulo01/README.md': '# Module 1\n',
  'modulo01/exemplo-00/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo01/exemplo-00/src/index.js': "console.log('train');\n",
  'modulo01/exemplo-00/scripts/seed.sh': 'echo seed\n',
  'modulo01/exemplo-01/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo02/parte-1/README.md': '# Part 1\n',
  'modulo02/parte-1/aula-01/main.py': 'print("lesson")\n',
  'modulo02/parte-1/aula-02/slides.md': '# Slides\n',
  'lives/demo/README.md': '# Live\n',
};

const surveyedFolders = [
  'modulo01',
  'modulo01/exemplo-00',
  'modulo01/exemplo-01',
  'modulo02',
  'modulo02/parte-1',
  'modulo02/parte-1/aula-01',
  'modulo02/parte-1/aula-02',
];

const emptyMapping = { concepts: {}, modules: {}, neutral: {} };

const nothingToSurvey = { changed: [], new: [], moved: [], removed: [] };

const git = (root, ...args) =>
  execute('git', args, { cwd: root, env: GIT_ENVIRONMENT });

const writeFiles = async (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
};

const commitAll = async (root, message) => {
  await git(root, 'add', '-A');
  await git(root, 'commit', '-q', '--no-verify', '-m', message);
};

const createCourse = async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackfy-survey-'));

  await writeFiles(root, course);
  await git(root, 'init', '-q');
  await commitAll(root, 'course');

  return root;
};

const stamp = async (root, folders, ids, options) =>
  stampFolders(root, ids, folders, await readHead(root), options);

const createSurveyedCourse = async () => {
  const root = await createCourse();

  return { root, folders: await stamp(root, {}, surveyedFolders) };
};

const surveyAfter = async (change) => {
  const { root, folders } = await createSurveyedCourse();
  const cases = join(root, 'no-cases');

  await mkdir(cases);
  await change(root);
  await commitAll(root, 'change');

  const report = await audit(root, {
    mapping: emptyMapping,
    cases,
    lock: folders,
  });

  await rm(root, { recursive: true, force: true });

  return report.survey;
};

const courseChanges = [
  {
    promise:
      'a course that matches the lock leaves nothing to survey, whatever changes outside the course modules',
    change: (root) => writeFiles(root, { 'lives/demo/notes.md': '# Notes\n' }),
    survey: nothingToSurvey,
  },
  {
    promise: 'changed code marks only the lesson that holds it',
    change: (root) =>
      writeFiles(root, {
        'modulo01/exemplo-00/src/index.js': "console.log('predict');\n",
      }),
    survey: { ...nothingToSurvey, changed: ['modulo01/exemplo-00'] },
  },
  {
    promise:
      'a project nested in a lesson marks the lesson, the unit the lock records',
    change: (root) =>
      writeFiles(root, {
        'modulo01/exemplo-00/scripts/seed.sh': 'echo reseed\n',
      }),
    survey: { ...nothingToSurvey, changed: ['modulo01/exemplo-00'] },
  },
  {
    promise: "a module root's own file marks the root and none of its lessons",
    change: (root) =>
      writeFiles(root, { 'modulo01/README.md': '# Module 1, revised\n' }),
    survey: { ...nothingToSurvey, changed: ['modulo01'] },
  },
  {
    promise: 'a lesson with nothing but slides arrives as new',
    change: (root) =>
      writeFiles(root, { 'modulo01/exemplo-02/slides.md': '# Slides\n' }),
    survey: { ...nothingToSurvey, new: ['modulo01/exemplo-02'] },
  },
  {
    promise: 'a whole module arrives as one new folder',
    change: (root) =>
      writeFiles(root, {
        'modulo13/aula-01/package.json': '{"dependencies":{"tensor-lib":"1"}}',
        'modulo13/aula-02/README.md': '# Lesson 2\n',
      }),
    survey: { ...nothingToSurvey, new: ['modulo13'] },
  },
  {
    promise:
      'a file added beside surveyed lessons changes the folder that groups them',
    change: (root) =>
      writeFiles(root, { 'modulo02/parte-1/schedule.md': '# Schedule\n' }),
    survey: { ...nothingToSurvey, changed: ['modulo02/parte-1'] },
  },
  {
    promise: 'a lesson renamed without other changes moved',
    change: (root) =>
      rename(
        join(root, 'modulo01/exemplo-01'),
        join(root, 'modulo01/exemplo-01-tensorflow')
      ),
    survey: {
      ...nothingToSurvey,
      moved: [
        { from: 'modulo01/exemplo-01', to: 'modulo01/exemplo-01-tensorflow' },
      ],
    },
  },
  {
    promise: 'a deleted lesson was removed',
    change: (root) =>
      rm(join(root, 'modulo02/parte-1/aula-02'), { recursive: true }),
    survey: { ...nothingToSurvey, removed: ['modulo02/parte-1/aula-02'] },
  },
];

await describe('Survey lock', async () => {
  for (const { promise, change, survey } of courseChanges)
    await it(promise, async () => {
      strict.deepEqual(await surveyAfter(change), survey);
    });

  await it('a module reads as changed, current, or new from the surveyed folders that hold it, and as unknown outside Git', async () => {
    const { root, folders } = await createSurveyedCourse();

    await writeFiles(root, {
      'modulo01/exemplo-00/src/index.js': "console.log('predict');\n",
      'modulo13/aula-01/package.json': '{"dependencies":{"tensor-lib":"1"}}',
    });
    await commitAll(root, 'change');

    const comparison = compareSurvey(folders, await readHead(root));
    const states = Object.fromEntries(
      [
        'modulo01/exemplo-00',
        'modulo01/exemplo-00/scripts',
        'modulo01/exemplo-01',
        'modulo13/aula-01',
      ].map((id) => [id, surveyOf(id, folders, comparison)])
    );
    const outsideGit = surveyOf('modulo01/exemplo-01', folders, null);

    await rm(root, { recursive: true, force: true });

    strict.deepEqual(states, {
      'modulo01/exemplo-00': 'changed',
      'modulo01/exemplo-00/scripts': 'changed',
      'modulo01/exemplo-01': 'current',
      'modulo13/aula-01': 'new',
    });
    strict.equal(outsideGit, 'unknown');
  });

  await it('lists the files each surveyed folder changed since its stamp, a module root by its own files only', async () => {
    const { root, folders } = await createSurveyedCourse();

    await writeFiles(root, {
      'modulo01/README.md': '# Module 1, revised\n',
      'modulo01/exemplo-00/src/index.js': "console.log('predict');\n",
    });
    await rm(join(root, 'modulo01/exemplo-00/scripts'), { recursive: true });
    await commitAll(root, 'change');

    const comparison = compareSurvey(folders, await readHead(root));
    const changes = await changesWithin(root, 'modulo01', folders, comparison);

    await rm(root, { recursive: true, force: true });

    strict.deepEqual(changes, {
      changed: [
        {
          folder: 'modulo01',
          commit: folders.modulo01.commit,
          files: [{ status: 'M', path: 'modulo01/README.md' }],
        },
        {
          folder: 'modulo01/exemplo-00',
          commit: folders['modulo01/exemplo-00'].commit,
          files: [
            { status: 'D', path: 'modulo01/exemplo-00/scripts/seed.sh' },
            { status: 'M', path: 'modulo01/exemplo-00/src/index.js' },
          ],
        },
      ],
      new: [],
      moved: [],
      removed: [],
    });
  });

  await it('a stamp records the last commit that touched the folder, not the latest one', async () => {
    const root = await createCourse();

    await writeFiles(root, { 'modulo01/exemplo-00/notes.md': '# Notes\n' });
    await commitAll(root, 'lesson');

    const { stdout } = await git(root, 'rev-parse', 'HEAD');

    await writeFiles(root, { 'modulo01/exemplo-01/notes.md': '# Notes\n' });
    await commitAll(root, 'another lesson');

    const folders = await stamp(root, {}, ['modulo01/exemplo-00']);

    await rm(root, { recursive: true, force: true });

    strict.equal(folders['modulo01/exemplo-00'].commit, stdout.trim());
  });

  await it('stamping a lesson inside a surveyed folder keeps that folder current', async () => {
    const root = await createCourse();
    const wholeModules = await stamp(root, {}, ['modulo01', 'modulo02']);
    const withLesson = await stamp(root, wholeModules, [
      'modulo02/parte-1/aula-01',
    ]);
    const comparison = compareSurvey(withLesson, await readHead(root));

    await rm(root, { recursive: true, force: true });

    strict.deepEqual(comparison, {
      ...nothingToSurvey,
      new: ['modulo02/parte-1', 'modulo02/parte-1/aula-02'],
    });
  });

  await it('forgetting the last lesson inside a surveyed folder keeps that folder current', async () => {
    const root = await createCourse();
    const head = await readHead(root);
    const folders = await stamp(root, {}, [
      'modulo01',
      'modulo02',
      'modulo02/parte-1',
    ]);
    const comparison = compareSurvey(
      forgetFolders(['modulo02/parte-1'], folders, head),
      head
    );

    await rm(root, { recursive: true, force: true });

    strict.deepEqual(comparison, nothingToSurvey);
  });

  await it('stamping a moved lesson from its old place keeps its tested transcriptions and leaves nothing to survey', async () => {
    const root = await createCourse();
    const folders = await stamp(root, {}, surveyedFolders);
    const linked = await stamp(root, folders, ['modulo01/exemplo-01'], {
      examples: ['neural-network-training/python/exemplo-01'],
    });

    await rename(
      join(root, 'modulo01/exemplo-01'),
      join(root, 'modulo01/exemplo-01-tensorflow')
    );
    await commitAll(root, 'rename');

    const moved = await stamp(
      root,
      linked,
      ['modulo01/exemplo-01-tensorflow'],
      {
        from: 'modulo01/exemplo-01',
      }
    );
    const comparison = compareSurvey(moved, await readHead(root));

    await rm(root, { recursive: true, force: true });

    strict.deepEqual(moved['modulo01/exemplo-01-tensorflow'].examples, [
      'neural-network-training/python/exemplo-01',
    ]);
    strict.equal('modulo01/exemplo-01' in moved, false);
    strict.deepEqual(comparison, nothingToSurvey);
  });
});
