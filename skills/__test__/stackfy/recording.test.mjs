import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { startRecorder } from '../../stackfy/scripts/record.mjs';
import { runCase } from '../../stackfy/scripts/runner/cases.mjs';

const completion = {
  choices: [{ message: { role: 'assistant', content: 'hello' } }],
};

const streamed = [
  '{"response":"hel","done":false}\n',
  '{"response":"lo","done":false}\n',
  '{"response":"","done":true}\n',
];

const startUpstream = () =>
  new Promise((resolveUpstream) => {
    const received = [];
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;

      received.push({
        authorization: request.headers.authorization,
        url: request.url,
        body: JSON.parse(body),
      });

      if (request.url.startsWith('/api/generate')) {
        response.writeHead(200, { 'content-type': 'application/x-ndjson' });
        for (const chunk of streamed) response.write(chunk);
        response.end();
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(completion));
    });

    server.listen(0, '127.0.0.1', () =>
      resolveUpstream({
        url: `http://127.0.0.1:${server.address().port}`,
        received,
        close: () => new Promise((done) => server.close(done)),
      })
    );
  });

const program = `
const chat = await fetch(\`\${process.env.OPENAI_BASE_URL}/chat/completions?key=sk-query-secret\`, {
  method: 'POST',
  headers: { authorization: 'Bearer sk-header-secret' },
  body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
});
console.log(JSON.stringify(await chat.json()));

const stream = await fetch(\`\${process.env.OLLAMA_HOST}/api/generate\`, {
  method: 'POST',
  body: JSON.stringify({ model: 'llama3', prompt: 'hi', stream: true }),
});
process.stdout.write(await stream.text());
`;

await describe('Recording a program in front of the real server', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-record-'));
  const upstream = await startUpstream();
  const recorder = await startRecorder({
    upstream: upstream.url,
    host: '127.0.0.1',
    model: 'stand-in',
  });

  await writeFile(join(folder, 'program.mjs'), program);

  const recorded = await runCase(
    { name: 'records', expect: [] },
    {
      cwd: folder,
      host: '127.0.0.1',
      timeout: 30000,
      command: 'node program.mjs',
      env: {
        OPENAI_BASE_URL: `http://127.0.0.1:${recorder.port}/v1`,
        OLLAMA_HOST: `http://127.0.0.1:${recorder.port}`,
      },
    }
  );

  await recorder.close();
  await upstream.close();

  it('keeps every request and response in order, streamed chunks included', () => {
    strict.equal(recorded.pass, true);
    strict.deepEqual(
      recorder.exchanges.map(({ method, path, request, json, chunks }) => ({
        method,
        path,
        model: request.body.model,
        response: json ?? chunks,
      })),
      [
        {
          method: 'POST',
          path: '/v1/chat/completions',
          model: 'openai/gpt-4o-mini',
          response: completion,
        },
        {
          method: 'POST',
          path: '/api/generate',
          model: 'llama3',
          response: streamed,
        },
      ]
    );
  });

  it('never writes authentication headers or secret query values to the record', () => {
    const record = JSON.stringify(recorder.exchanges);

    strict.equal(record.includes('sk-header-secret'), false);
    strict.equal(record.includes('sk-query-secret'), false);
  });

  it('still authenticates upstream and asks it for the stand-in model', () => {
    strict.deepEqual(
      upstream.received.map(({ authorization, url, body }) => [
        authorization,
        url,
        body.model,
      ]),
      [
        [
          'Bearer sk-header-secret',
          '/v1/chat/completions?key=sk-query-secret',
          'stand-in',
        ],
        [undefined, '/api/generate', 'stand-in'],
      ]
    );
  });

  await it('replays what it recorded to the same program', async () => {
    const replayed = await runCase(
      {
        name: 'replays',
        replay: recorder.exchanges.map(
          ({ method, path, headers, json, chunks }) => ({
            method,
            path,
            headers,
            json,
            chunks,
          })
        ),
        expect: [
          { type: 'exit', code: 0 },
          { type: 'json', values: [{ $replay: 0 }, { $replayChunks: 1 }] },
        ],
      },
      {
        cwd: folder,
        host: '127.0.0.1',
        timeout: 30000,
        command: 'node program.mjs',
      }
    );

    strict.equal(replayed.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});

await describe('Recording a program that offers a gateway a list of models', async () => {
  const upstream = await startUpstream();
  const recorder = await startRecorder({
    upstream: upstream.url,
    host: '127.0.0.1',
    model: 'stand-in',
  });
  const request = {
    models: [
      'arcee-ai/trinity-large-preview:free',
      'nvidia/nemotron-3-nano-30b-a3b:free',
    ],
    messages: [{ role: 'user', content: 'hi' }],
    provider: { sort: { by: 'throughput', partition: 'none' } },
  };

  await fetch(`http://127.0.0.1:${recorder.port}/v1/chat/completions`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  await recorder.close();
  await upstream.close();

  it('asks upstream for the stand-in model and records the list the program offered', () => {
    strict.deepEqual(
      upstream.received.map(({ body }) => body),
      [{ ...request, model: 'stand-in' }]
    );
    strict.deepEqual(
      recorder.exchanges.map(({ request: recorded }) => recorded.body),
      [request]
    );
  });
});

await describe('Recording a program whose embedding model the server has', async () => {
  const upstream = await startUpstream();
  const recorder = await startRecorder({
    upstream: upstream.url,
    host: '127.0.0.1',
    model: 'gemma4:e2b=stand-in,gemma4:latest=stand-in',
  });
  const requests = [
    ['/api/embeddings', { model: 'nomic-embed-text', prompt: 'idade mínima' }],
    [
      '/api/chat',
      { model: 'gemma4:e2b', messages: [{ role: 'user', content: 'hi' }] },
    ],
    [
      '/api/chat',
      { model: 'gemma4:latest', messages: [{ role: 'user', content: 'hi' }] },
    ],
  ];

  for (const [path, body] of requests)
    await fetch(`http://127.0.0.1:${recorder.port}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  await recorder.close();
  await upstream.close();

  it('asks upstream for the stand-in only in place of the models it names', () => {
    strict.deepEqual(
      upstream.received.map(({ body }) => body.model),
      ['nomic-embed-text', 'stand-in', 'stand-in']
    );
    strict.deepEqual(
      recorder.exchanges.map(({ request }) => request.body.model),
      ['nomic-embed-text', 'gemma4:e2b', 'gemma4:latest']
    );
  });
});
