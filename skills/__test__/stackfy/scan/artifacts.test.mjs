import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { artifactsOf } from '../../../stackfy/scripts/scanner/artifacts.mjs';

const mapping = {
  concepts: {},
  modules: {
    'modulo01/exemplo-00/scripts': ['seeding'],
    'modulo01/exemplo-01': ['training'],
  },
  neutral: {},
};

const folders = {
  'modulo01/exemplo-00': {
    examples: ['training/python/exemplo-00'],
  },
  'modulo01/exemplo-01': {},
  modulo02: { examples: ['agents/go/modulo02'] },
  'modulo02/core': { examples: ['agents/rust/core'] },
};

const skillFiles = {
  'cases/modulo01/exemplo-00.json': '{"module":"modulo01/exemplo-00"}',
  'cases/modulo01/exemplo-00/scripts.json':
    '{"module":"modulo01/exemplo-00/scripts"}',
  'cases/modulo01/exemplo-01.json': '{"module":"modulo01/exemplo-01"}',
  'cases/modulo02/index.json': '{"module":"modulo02"}',
  'references/training.md':
    '## Where it appears\n\n- modulo01/exemplo-00 (the training loop)\n',
  'references/prediction.md': 'The prediction lives in modulo01/exemplo-01.\n',
  'references/agents.md': '- modulo02 (the agents of core)\n',
};

const folderArtifacts = [
  {
    promise:
      'a lesson affects the artifacts about it and about the projects inside it',
    folder: 'modulo01/exemplo-00',
    container: false,
    expected: {
      mapping: ['modulo01/exemplo-00/scripts'],
      cases: ['modulo01/exemplo-00.json', 'modulo01/exemplo-00/scripts.json'],
      references: ['training.md'],
      examples: ['training/python/exemplo-00'],
    },
  },
  {
    promise: 'a reference that cites a lesson at the end of a sentence counts',
    folder: 'modulo01/exemplo-01',
    container: false,
    expected: {
      mapping: ['modulo01/exemplo-01'],
      cases: ['modulo01/exemplo-01.json'],
      references: ['prediction.md'],
      examples: [],
    },
  },
  {
    promise:
      'a lesson inside a project at the module root affects the artifacts of that project',
    folder: 'modulo02/core',
    container: false,
    expected: {
      mapping: [],
      cases: ['modulo02/index.json'],
      references: ['agents.md'],
      examples: ['agents/go/modulo02', 'agents/rust/core'],
    },
  },
  {
    promise:
      'a folder that holds surveyed lessons affects only the artifacts about itself',
    folder: 'modulo02',
    container: true,
    expected: {
      mapping: [],
      cases: ['modulo02/index.json'],
      references: ['agents.md'],
      examples: ['agents/go/modulo02'],
    },
  },
];

await describe('Artifacts a surveyed folder affects', async () => {
  const skill = await mkdtemp(join(tmpdir(), 'stackfy-artifacts-'));

  for (const [path, content] of Object.entries(skillFiles)) {
    await mkdir(join(skill, path, '..'), { recursive: true });
    await writeFile(join(skill, path), content);
  }

  const skillFolders = {
    cases: join(skill, 'cases'),
    references: join(skill, 'references'),
  };

  for (const { promise, folder, container, expected } of folderArtifacts)
    await it(promise, async () => {
      const artifacts = await artifactsOf(folder, {
        mapping,
        folders,
        container,
        skill: skillFolders,
      });

      strict.deepEqual(artifacts, expected);
    });

  await rm(skill, { recursive: true, force: true });
});
