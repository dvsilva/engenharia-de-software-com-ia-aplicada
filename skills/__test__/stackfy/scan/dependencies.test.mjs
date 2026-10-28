import { describe, it, strict } from 'poku';
import {
  detectStack,
  parseCargo,
  parseGoMod,
  parseJavaScriptImports,
  parseNodeDependencies,
  parseNotebookImports,
  parsePyproject,
  parsePythonImports,
  parseRequirements,
  parseShellCommands,
} from '../../../stackfy/scripts/scanner/dependencies.mjs';

const declarations = [
  {
    promise: 'package.json counts runtime and development dependencies',
    parse: parseNodeDependencies,
    text: JSON.stringify({
      dependencies: { '@tensorflow/tfjs-node': '4.22' },
      devDependencies: { poku: '^4.3.1' },
    }),
    expected: ['@tensorflow/tfjs-node', 'poku'],
  },
  {
    promise:
      'requirements.txt names ignore versions, extras, case, comments, and options',
    parse: parseRequirements,
    text: [
      '# models',
      'tensorflow==2.21.0',
      'Requests>=2.0  # http',
      'scikit_learn[extra]~=1.5',
      '-r other.txt',
    ].join('\n'),
    expected: ['tensorflow', 'requests', 'scikit-learn'],
  },
  {
    promise: 'pyproject.toml lists the project dependencies',
    parse: parsePyproject,
    text: '[project]\ndependencies = [\n  "ollama>=0.4",\n  \'openai\',\n]\n',
    expected: ['ollama', 'openai'],
  },
  {
    promise: 'go.mod lists grouped and single requirements, without comments',
    parse: parseGoMod,
    text: [
      'module x',
      'require (',
      '\tgithub.com/ollama/ollama v0.5.0',
      '\t// comment',
      '\tgolang.org/x/net v0.30.0 // indirect',
      ')',
      'require github.com/go-resty/resty/v2 v2.16.5',
    ].join('\n'),
    expected: [
      'github.com/ollama/ollama',
      'golang.org/x/net',
      'github.com/go-resty/resty/v2',
    ],
  },
  {
    promise: 'Cargo.toml lists every dependency section and table',
    parse: parseCargo,
    text: [
      '[package]',
      'name = "x"',
      '[dependencies]',
      'candle-core = "0.10"',
      'serde = { version = "1" }',
      '[dev-dependencies]',
      'pretty_assertions = "1"',
      '[dependencies.reqwest]',
      'version = "0.12"',
    ].join('\n'),
    expected: ['candle-core', 'serde', 'pretty_assertions', 'reqwest'],
  },
  {
    promise:
      'shell scripts count the command of every pipeline segment, skipping comments and continued arguments',
    parse: parseShellCommands,
    text: [
      'ollama list',
      '# curl ignored',
      'curl --silent -X POST http://localhost:11434/api/generate \\',
      '-d \'{"model": "gpt-oss:20b"}\' \\',
      '| jq',
      'FOO=bar sudo docker ps && echo done',
    ].join('\n'),
    expected: ['ollama', 'curl', 'jq', 'docker', 'echo'],
  },
  {
    promise:
      'shell scripts ignore separators inside quoted strings and heredoc bodies',
    parse: parseShellCommands,
    text: [
      'PROMPTS=(',
      '  "o checkout está lento; o que os alertas dizem?"',
      ')',
      "echo 'tokens; estimativa local'",
      'cat <<EOF > prompt.txt',
      'resuma; depois liste',
      'EOF',
      'curl -s http://localhost:3000',
    ].join('\n'),
    expected: ['echo', 'cat', 'curl'],
  },
  {
    promise:
      'Python imports name the top-level package of every import, relative ones excluded',
    parse: parsePythonImports,
    text: [
      'import os, sys as system',
      'import numpy as np',
      'from langchain_groq.chat import ChatGroq',
      'from . import helpers',
      'from .agents import build',
      '    import torch',
    ].join('\n'),
    expected: ['os', 'sys', 'numpy', 'langchain_groq', 'torch'],
  },
  {
    promise: 'notebooks count the imports of their code cells only',
    parse: parseNotebookImports,
    text: JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: ['import ignored'] },
        { cell_type: 'code', source: ['import pandas as pd\n', 'x = 1'] },
        { cell_type: 'code', source: 'from google import genai' },
      ],
    }),
    expected: ['pandas', 'google'],
  },
  {
    promise:
      'JavaScript imports name packages, without relative paths, URLs, or Node.js built-ins',
    parse: parseJavaScriptImports,
    text: [
      "import express from 'express';",
      "import { ChatOpenAI } from '@langchain/openai/chat_models';",
      "import './setup.js';",
      "import fs from 'node:fs';",
      "import path from 'path';",
      "const axios = require('axios');",
      "const { Client } = await import('pg');",
      "import confetti from 'https://cdn.skypack.dev/canvas-confetti';",
      "export * from '../shared/types';",
    ].join('\n'),
    expected: ['express', '@langchain/openai', 'axios', 'pg'],
  },
];

describe('Dependencies each stack declares', () => {
  for (const { promise, parse, text, expected } of declarations)
    it(promise, () => {
      strict.deepEqual(parse(text), expected);
    });

  it('a dependency file decides the stack over helper shell scripts', () => {
    strict.equal(detectStack(['setup.sh', 'package.json']), 'node');
  });

  it('a folder without dependency files has no stack', () => {
    strict.equal(detectStack(['README.md']), null);
  });
});
