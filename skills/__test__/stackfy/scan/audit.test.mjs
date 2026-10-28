import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { audit } from '../../../stackfy/scripts/scanner/audit.mjs';

const mapping = {
  concepts: { 'tensor-training': { node: ['tensor-lib'] } },
  modules: {},
  neutral: {},
};

const files = {
  'modulo01/exemplo-00-z/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo01/exemplo-01/package.json':
    '{"dependencies":{"tensor-lib":"1","express":"4"}}',
  'modulo01/exemplo-02/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo02/server/package.json': '{"dependencies":{"express":"4"}}',
  'modulo02/notes/README.md': '# notes\n',
  'modulo03/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo04/notebook/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo05/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'skills/stackfy/examples/x/package.json':
    '{"dependencies":{"transcription-lib":"1"}}',
  'lives/demo/package.json': '{"dependencies":{"live-lib":"1"}}',
  'cases/modulo01/exemplo-00-z.json': '{"cases":[]}',
  'cases/modulo03/index.json': JSON.stringify({
    cases: [
      {
        replay: [
          { method: 'POST', path: '/v1/chat', synthesized: true },
          { method: 'POST', path: '/v1/chat' },
        ],
      },
      { replay: [{ method: 'GET', path: '/v1/models', synthesized: true }] },
      { expect: [] },
    ],
  }),
  'cases/modulo04/notebook.json': JSON.stringify({
    blocked: {
      status: 'partial',
      reason: 'the notebook trains on a CUDA GPU',
      completion: 'requires a CUDA GPU',
    },
    cases: [],
  }),
  'cases/modulo05/index.json': JSON.stringify({
    module: 'modulo05',
    extends: '../modulo03/index.json',
    cases: [
      {
        name: 'a case of its own',
        replay: [{ method: 'POST', path: '/v1/chat', synthesized: true }],
      },
    ],
  }),
};

await describe('Coverage audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackfy-audit-'));

  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }

  const report = await audit(root, { mapping, cases: join(root, 'cases') });

  it('audits only the course modules that have a stack', () => {
    strict.equal(report.modules, 7);
  });

  it('reports the course modules left to cover with their unknown dependencies', () => {
    strict.deepEqual(report.uncovered, [
      {
        module: 'modulo01/exemplo-01',
        stack: 'node',
        coverage: 'partial',
        unknown: ['express'],
      },
      {
        module: 'modulo02/server',
        stack: 'node',
        coverage: 'not-covered',
        unknown: ['express'],
      },
    ]);
  });

  it('groups each unmapped dependency with the modules that use it', () => {
    strict.deepEqual(report.unmapped, [
      {
        stack: 'node',
        dependency: 'express',
        modules: ['modulo01/exemplo-01', 'modulo02/server'],
      },
    ]);
  });

  it('reports the covered modules without cases, finding the cases of a whole course module in its own folder', () => {
    strict.deepEqual(report.uncased, ['modulo01/exemplo-02']);
  });

  it('lists apart the modules an external factor blocks, with why and what would complete them', () => {
    strict.deepEqual(report.blocked, [
      {
        module: 'modulo04/notebook',
        status: 'partial',
        reason: 'the notebook trains on a CUDA GPU',
        completion: 'requires a CUDA GPU',
      },
    ]);
  });

  it('counts the synthesized exchanges of each module, those reused from another cases file included', () => {
    strict.deepEqual(report.synthesized, [
      { module: 'modulo03', exchanges: 2 },
      { module: 'modulo05', exchanges: 3 },
    ]);
  });

  it('leaves the survey unknown when the course is not in Git', () => {
    strict.equal(report.survey, null);
  });

  await rm(root, { recursive: true, force: true });
});
