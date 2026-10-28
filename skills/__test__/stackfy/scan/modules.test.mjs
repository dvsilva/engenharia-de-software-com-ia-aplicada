import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { scanFolders } from '../../../stackfy/scripts/scanner/modules.mjs';

const mapping = {
  concepts: {
    'tensor-training': { node: ['tensor-lib'], python: ['numpy'] },
    'llm-calls': { shell: ['llm-cli'] },
  },
  modules: { 'modulo02/curl-only': ['llm-calls'] },
  neutral: { shell: ['curl', 'jq'] },
};

const files = {
  'modulo01/exemplo-10-ollama/request.sh':
    'llm-cli list\ncurl -s http://localhost:11434/api/tags | jq\n',
  'modulo01/exemplo-00-z/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo01/exemplo-00-z/node_modules/x/package.json':
    '{"dependencies":{"ignored":"1"}}',
  'modulo01/exemplo-00-z.python/requirements.txt': 'tensorflow\n',
  'modulo01/exemplo-01/package.json':
    '{"devDependencies":{"browser-sync":"3"}}',
  'modulo01/exemplo-03/package.json': '{ not json',
  'modulo01/2025.09.30/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo01/notes/README.md': '# notes\n',
  'modulo02/labs/train.py':
    'import os\nimport numpy as np\nfrom helpers import load\nfrom tools.k8s import run\n',
  'modulo02/labs/helpers.py': 'import json\n',
  'modulo02/labs/tools/k8s.py': 'import kubernetes\n',
  'modulo02/labs/report.js': "import axios from 'axios';\n",
  'modulo02/app/package.json': '{"dependencies":{"tensor-lib":"1"}}',
  'modulo02/app/src/index.js': "import express from 'express';\n",
  'modulo02/curl-only/request.sh':
    'curl -s https://openrouter.ai/api/v1/chat/completions\n',
  'modulo03/requirements.txt': 'numpy\nkubernetes\n',
  'modulo03/labs/lab1.py':
    'from core.agents import architect\nfrom tools.k8s import run\n',
  'modulo03/core/agents.py': 'import numpy\n',
  'modulo03/tools/k8s.py': 'import kubernetes\n',
  'modulo04/llm-wrapper/package.json': '{"dependencies":{"llm-cli":"1"}}',
};

const createCourse = async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackfy-modules-'));

  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }

  return root;
};

await describe('Module scan', async () => {
  const root = await createCourse();

  await it('lists modules in course order, without vendored folders or transcriptions', async () => {
    const modules = await scanFolders(join(root, 'modulo01'), root, mapping);

    strict.deepEqual(
      modules.map(({ module, coverage }) => [module, coverage]),
      [
        ['modulo01/2025.09.30', 'covered'],
        ['modulo01/exemplo-00-z', 'covered'],
        ['modulo01/exemplo-01', 'not-covered'],
        ['modulo01/exemplo-03', 'not-covered'],
        ['modulo01/exemplo-10-ollama', 'covered'],
      ]
    );
  });

  await it('describes the stack, dependencies, and concepts of a module', async () => {
    const [module] = await scanFolders(
      join(root, 'modulo01/exemplo-10-ollama'),
      root,
      mapping
    );

    strict.deepEqual(module, {
      module: 'modulo01/exemplo-10-ollama',
      stack: 'shell',
      dependencies: ['curl', 'jq', 'llm-cli'],
      concepts: ['llm-calls'],
      unknown: [],
      coverage: 'covered',
    });
  });

  await it('reports a folder without any stack as not covered', async () => {
    const [module] = await scanFolders(
      join(root, 'modulo01/notes'),
      root,
      mapping
    );

    strict.equal(module.stack, null);
    strict.equal(module.coverage, 'not-covered');
  });

  await it('reports loose source files as one module per language, named by their imports', async () => {
    const modules = await scanFolders(
      join(root, 'modulo02/labs'),
      root,
      mapping
    );

    strict.deepEqual(modules, [
      {
        module: 'modulo02/labs',
        stack: 'node',
        dependencies: ['axios'],
        concepts: [],
        unknown: ['axios'],
        coverage: 'not-covered',
      },
      {
        module: 'modulo02/labs',
        stack: 'python',
        dependencies: ['kubernetes', 'numpy'],
        concepts: ['tensor-training'],
        unknown: ['kubernetes'],
        coverage: 'partial',
      },
    ]);
  });

  await it('keeps source files inside a project with the dependencies it declares', async () => {
    const modules = await scanFolders(
      join(root, 'modulo02/app'),
      root,
      mapping
    );

    strict.deepEqual(
      modules.map(({ module, dependencies }) => [module, dependencies]),
      [['modulo02/app', ['tensor-lib']]]
    );
  });

  await it('reports a folder of a project as the project, with the dependencies it declares', async () => {
    const modules = await scanFolders(
      join(root, 'modulo03/labs'),
      root,
      mapping
    );

    strict.deepEqual(
      modules.map(({ module, dependencies }) => [module, dependencies]),
      [['modulo03', ['kubernetes', 'numpy']]]
    );
  });

  await it('covers a module whose concept only reading its code reveals', async () => {
    const [module] = await scanFolders(
      join(root, 'modulo02/curl-only'),
      root,
      mapping
    );

    strict.deepEqual(
      { concepts: module.concepts, coverage: module.coverage },
      { concepts: ['llm-calls'], coverage: 'covered' }
    );
  });

  await it('a concept signal only counts in its own stack', async () => {
    const [module] = await scanFolders(
      join(root, 'modulo04/llm-wrapper'),
      root,
      mapping
    );

    strict.deepEqual(
      {
        concepts: module.concepts,
        unknown: module.unknown,
        coverage: module.coverage,
      },
      { concepts: [], unknown: ['llm-cli'], coverage: 'not-covered' }
    );
  });

  await rm(root, { recursive: true, force: true });
});
