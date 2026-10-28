import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const generation = {
  name: 'generates once',
  replay: [
    {
      method: 'POST',
      path: '/api/generate',
      match: { stream: false },
      json: { model: 'gpt-oss:20b', response: 'hello', done: true },
    },
    {
      method: 'POST',
      path: '/api/generate',
      match: { stream: true },
      chunks: ['{"response":"hello","done":true}\n'],
    },
    {
      method: 'HEAD',
      path: '/',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      incidental: true,
    },
  ],
  expect: [
    { type: 'exit', code: 0 },
    {
      type: 'requests',
      requests: [
        {
          method: 'POST',
          path: '/api/generate',
          body: { model: 'gpt-oss:20b', prompt: 'hi', stream: false },
        },
      ],
    },
    { type: 'json', values: [{ $replay: 0, pick: ['response'] }] },
  ],
};

const transcriptions = [
  {
    promise: 'a transcription that sends what the original sent passes',
    body: { model: 'gpt-oss:20b', prompt: 'hi', stream: false },
    pass: true,
  },
  {
    promise:
      'a transcription without the explicit stream flag gets no recorded response',
    body: { model: 'gpt-oss:20b', prompt: 'hi' },
    pass: false,
  },
  {
    promise: 'a transcription that asks for another model fails',
    body: { model: 'llama3', prompt: 'hi', stream: false },
    pass: false,
  },
];

const source = (body) => `
const response = await fetch(\`\${process.env.OLLAMA_HOST}/api/generate\`, {
  method: 'POST',
  body: JSON.stringify(${JSON.stringify(body)}),
});
const data = await response.json();
console.log(JSON.stringify({ response: data.response ?? null }));
`;

const checkingServer = (body) => `
const heartbeat = () => fetch(process.env.OLLAMA_HOST, { method: 'HEAD' });
const checks = [await heartbeat(), await heartbeat()];

if (checks.some((check) => !check.ok)) process.exit(1);
${source(body)}`;

await describe('Replaying recorded answers to a transcription', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-replay-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, body, pass }] of transcriptions.entries()) {
    await writeFile(join(folder, `${index}.mjs`), source(body));

    await it(promise, async () => {
      const result = await runCase(generation, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await it('a client that checks the server before its calls still matches the original requests', async () => {
    await writeFile(
      join(folder, 'checking-server.mjs'),
      checkingServer({ model: 'gpt-oss:20b', prompt: 'hi', stream: false })
    );

    const result = await runCase(generation, {
      ...options,
      command: 'node checking-server.mjs',
    });

    strict.equal(result.pass, true);
  });

  await it('holds a recorded answer for its delay, so what a client shows while it waits can be read', async () => {
    await writeFile(
      join(folder, 'waiting.mjs'),
      `
const answered = fetch(\`\${process.env.STACKFY_REPLAY_URL}/api/speakers\`).then((response) => response.json());
const shown = await Promise.race([answered, new Promise((resolve) => setTimeout(resolve, 200, 'loading'))]);

console.log(JSON.stringify([shown, await answered]));
`
    );

    const result = await runCase(
      {
        name: 'loading, then the speakers',
        replay: [
          { method: 'GET', path: '/api/speakers', delay: 1000, json: [] },
        ],
        expect: [{ type: 'json', values: [['loading', []]] }],
      },
      { ...options, command: 'node waiting.mjs' }
    );

    strict.equal(result.pass, true);
  });

  await it('an answer held past the end of its case leaves the runner working', async () => {
    await writeFile(
      join(folder, 'leaving.mjs'),
      `
fetch(\`\${process.env.STACKFY_REPLAY_URL}/api/speakers\`).catch(() => {});
setTimeout(() => process.exit(0), 100);
`
    );

    const result = await runCase(
      {
        name: 'leaves before the speakers arrive',
        replay: [
          { method: 'GET', path: '/api/speakers', delay: 500, json: [] },
        ],
        expect: [{ type: 'exit', code: 0 }],
      },
      { ...options, command: 'node leaving.mjs' }
    );

    await sleep(1000);

    strict.equal(result.pass, true);
  });

  await it('answers requests to the same path by the headers each recorded answer names', async () => {
    await writeFile(
      join(folder, 'two-formats.mjs'),
      `
const read = (accept) =>
  fetch(\`\${process.env.GITHUB_API_URL}/repos/acme/app/pulls/7\`, {
    headers: { accept },
  }).then((response) => response.text());

console.log(await read('application/vnd.github+json'));
console.log(await read('application/vnd.github.v3.diff'));
`
    );

    const result = await runCase(
      {
        name: 'a pull request and its diff',
        env: { GITHUB_API_URL: '{replay}' },
        replay: [
          {
            method: 'GET',
            path: '/repos/acme/app/pulls/7',
            matchHeaders: { accept: 'diff' },
            headers: { 'content-type': 'text/plain' },
            text: 'diff --git a/app.js b/app.js',
            incidental: true,
          },
          {
            method: 'GET',
            path: '/repos/acme/app/pulls/7',
            json: { number: 7 },
            incidental: true,
          },
        ],
        expect: [
          {
            type: 'output',
            pattern: '^\\{"number":7\\}\\ndiff --git a/app\\.js b/app\\.js\\n$',
          },
        ],
      },
      { ...options, command: 'node two-formats.mjs' }
    );

    strict.equal(result.pass, true);
  });

  await it('a recorded answer with {cwd} hands the program a path inside the folder it runs in', async () => {
    await writeFile(join(folder, 'trivy-report.txt'), 'CVE-2024-3094\n');
    await writeFile(
      join(folder, 'reading-path.mjs'),
      `
import { readFile } from 'node:fs/promises';

const { file } = await fetch(\`\${process.env.STACKFY_REPLAY_URL}/v1/tool-call\`).then((response) => response.json());

process.stdout.write(await readFile(file, 'utf8'));
`
    );

    const result = await runCase(
      {
        name: 'a path the model repeats from the prompt',
        replay: [
          {
            method: 'GET',
            path: '/v1/tool-call',
            json: { file: '{cwd}/trivy-report.txt' },
          },
        ],
        expect: [{ type: 'output', pattern: '^CVE-2024-3094\\n$' }],
      },
      { ...options, command: 'node reading-path.mjs' }
    );

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});

const search = {
  name: 'looks a keyword up on a search service',
  env: { SEARCH_URL: '{replay}' },
  replay: [{ method: 'GET', path: '/search', json: { results: [] } }],
  expect: [
    {
      type: 'requests',
      requests: [
        {
          method: 'GET',
          path: '/search',
          query: { engine: 'google_trends', q: 'Web AI', date: 'now 7-d' },
        },
      ],
    },
  ],
};

const searchers = [
  {
    promise:
      'a transcription that sends the same query with extra parameters passes',
    query: 'engine=google_trends&q=Web+AI&date=now+7-d&output=json',
    pass: true,
  },
  {
    promise: 'a transcription that looks up another keyword fails',
    query: 'engine=google_trends&q=AI+Browser&date=now+7-d',
    pass: false,
  },
  {
    promise: 'a transcription that leaves out a parameter fails',
    query: 'engine=google_trends&q=Web+AI',
    pass: false,
  },
];

await describe('Checking the query a transcription sends', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-query-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, query, pass }] of searchers.entries()) {
    await writeFile(
      join(folder, `${index}.mjs`),
      `await fetch(\`\${process.env.SEARCH_URL}/search?${query}\`);`
    );

    await it(promise, async () => {
      const result = await runCase(search, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});

const lenientGatewayRequest = {
  name: 'asks a gateway that reads lenient JSON',
  replay: [{ method: 'POST', path: '/v1/chat/completions', json: {} }],
  expect: [
    {
      type: 'requests',
      requests: [
        {
          method: 'POST',
          path: '/v1/chat/completions',
          body: {
            model: 'google/gemma-3-27b-it:free',
            messages: [{ role: 'user', content: `it's a "token"` }],
          },
        },
      ],
    },
  ],
};

const lenientBodies = [
  {
    promise:
      'reads a value in single quotes as a lenient server such as OpenRouter does',
    body: String.raw`{"model": 'google/gemma-3-27b-it:free', "messages": [{"role": "user", "content": "it's a \"token\""}]}`,
    pass: true,
  },
  {
    promise:
      'keeps the double quotes and escaped apostrophes inside a value in single quotes',
    body: String.raw`{"model": 'google/gemma-3-27b-it:free', "messages": [{"role": 'user', "content": 'it\'s a "token"'}]}`,
    pass: true,
  },
  {
    promise:
      'still rejects a body in single quotes that asks for another model',
    body: String.raw`{"model": 'google/gemma-3-27b-it', "messages": [{"role": "user", "content": "it's a \"token\""}]}`,
    pass: false,
  },
];

await describe('Reading a request body whose strings are in single quotes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-lenient-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, body, pass }] of lenientBodies.entries()) {
    await writeFile(
      join(folder, `${index}.mjs`),
      `await fetch(\`\${process.env.OPENAI_BASE_URL}/chat/completions\`, { method: 'POST', body: ${JSON.stringify(body)} });`
    );

    await it(promise, async () => {
      const result = await runCase(lenientGatewayRequest, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});
