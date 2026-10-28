import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const PORT = 47391;

const chat = {
  name: 'answers a chat over HTTP with the recorded completion',
  replay: [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      json: { choices: [{ message: { role: 'assistant', content: 'hello' } }] },
    },
  ],
  serve: {
    port: PORT,
    requests: [
      { method: 'GET', path: '/health' },
      { method: 'POST', path: '/chat', json: { question: 'hi' } },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [{ status: 200 }, { status: 200, match: { answer: 'hello' } }],
    },
    {
      type: 'requests',
      requests: [
        {
          method: 'POST',
          path: '/v1/chat/completions',
          body: { messages: [{ role: 'user', content: 'hi' }] },
        },
      ],
    },
  ],
};

const server = (answer) => `
import { createServer } from 'node:http';

const complete = async (question) => {
  const response = await fetch(\`\${process.env.OPENAI_BASE_URL}/chat/completions\`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  const { choices } = await response.json();
  return choices[0].message.content;
};

createServer(async (request, response) => {
  if (request.url === '/health') return response.end('ok');

  let body = '';
  for await (const chunk of request) body += chunk;

  const { question } = JSON.parse(body);
  const answer = ${answer};

  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ answer }));
}).listen(Number(process.env.PORT));
`;

const servers = [
  {
    promise: 'a server that answers with what the LLM returned passes',
    answer: 'await complete(question)',
    pass: true,
  },
  {
    promise: 'a server that answers something else fails',
    answer: '(await complete(question)).toUpperCase()',
    pass: false,
  },
];

await describe('Checking a transcription that serves HTTP', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-serve-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, answer, pass }] of servers.entries()) {
    await writeFile(join(folder, `${index}.mjs`), server(answer));

    await it(promise, async () => {
      const result = await runCase(chat, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await it('a server that never listens fails instead of hanging', async () => {
    const result = await runCase(
      { ...chat, serve: { ...chat.serve, timeout: 1000 } },
      { ...options, command: 'node -e "setInterval(() => {}, 1000)"' }
    );

    strict.equal(result.pass, false);
  });

  await rm(folder, { recursive: true, force: true });
});

const lookup = {
  name: 'finds an item by the id it generated',
  serve: {
    port: PORT + 1,
    requests: [
      { method: 'POST', path: '/items', json: { name: 'milk' } },
      { method: 'GET', path: '/items/{responses.0.id}' },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [
        { status: 201 },
        { status: 200, match: { id: '{responses.0.id}', name: 'milk' } },
      ],
    },
  ],
};

const itemServer = (id, answer) => `
import { createServer } from 'node:http';

const items = new Map();

createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;

  if (request.method === 'POST') {
    const item = { id: ${id}, ...JSON.parse(body) };
    items.set(String(item.id), item);
    response.writeHead(201);
    return response.end(JSON.stringify(item));
  }

  const item = items.get(request.url.split('/').pop());
  if (!item) {
    response.writeHead(404);
    return response.end('{}');
  }

  response.end(JSON.stringify(${answer}));
}).listen(Number(process.env.PORT));
`;

const lookups = [
  {
    promise: 'a server that finds the item by its generated id passes',
    id: 'crypto.randomUUID()',
    answer: 'item',
    pass: true,
  },
  {
    promise: 'a server that answers with another id fails',
    id: 'crypto.randomUUID()',
    answer: "{ ...item, id: 'other' }",
    pass: false,
  },
  {
    promise: 'a numeric id stays a number in the expectation',
    id: 'Date.now()',
    answer: 'item',
    pass: true,
  },
  {
    promise: 'a numeric id answered as text fails',
    id: 'Date.now()',
    answer: '{ ...item, id: String(item.id) }',
    pass: false,
  },
];

await describe('Referring to earlier responses in a served case', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-references-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, id, answer, pass }] of lookups.entries()) {
    await writeFile(join(folder, `${index}.mjs`), itemServer(id, answer));

    await it(promise, async () => {
      const result = await runCase(lookup, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});

const noted = {
  method: 'POST',
  path: '/v1/chat/completions',
  json: { choices: [{ message: { role: 'assistant', content: 'noted' } }] },
};

const learnedTurn = (question) => ({
  method: 'POST',
  path: '/v1/chat/completions',
  body: { messages: [{ role: 'user', content: question }] },
});

const learning = {
  name: 'learns from every turn after answering it',
  replay: [noted, noted],
  serve: {
    port: PORT + 2,
    settle: 1500,
    requests: [
      { method: 'POST', path: '/chat', json: { question: 'slow' } },
      { method: 'POST', path: '/chat', json: { question: 'fast' } },
    ],
  },
  expect: [
    {
      type: 'requests',
      requests: [learnedTurn('slow'), learnedTurn('fast')],
    },
  ],
};

const learningServer = `
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const learn = async (question) => {
  await sleep(question === 'slow' ? 600 : 100);
  await fetch(\`\${process.env.OPENAI_BASE_URL}/chat/completions\`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
};

createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;

  const { question } = JSON.parse(body);

  response.end('{}');
  learn(question);
}).listen(Number(process.env.PORT));
`;

await describe('Giving a served case time to settle', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-settle-'));

  await writeFile(join(folder, 'server.mjs'), learningServer);

  await it('LLM calls a server makes after each answer are checked in the order of the turns', async () => {
    const result = await runCase(learning, {
      cwd: folder,
      host: '127.0.0.1',
      timeout: 30000,
      command: 'node server.mjs',
    });

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});

const startup = {
  name: 'asks its own question at startup, then answers the outside one',
  replay: [noted, noted],
  serve: {
    port: PORT + 3,
    after: '^startup answered\\n',
    requests: [
      { method: 'POST', path: '/chat', json: { question: 'outside' } },
    ],
  },
  expect: [
    {
      type: 'requests',
      requests: [learnedTurn('startup'), learnedTurn('outside')],
    },
  ],
};

const startupServer = `
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const complete = (question) =>
  fetch(\`\${process.env.OPENAI_BASE_URL}/chat/completions\`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });

createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;

  await complete(JSON.parse(body).question);
  response.end('{}');
}).listen(Number(process.env.PORT));

await sleep(600);
await complete('startup');
console.log('startup answered');
`;

await describe('Waiting for what a server does on its own at startup', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-after-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  await writeFile(join(folder, 'server.mjs'), startupServer);

  await it('requests wait for the output the startup work prints, so LLM calls keep their order', async () => {
    const result = await runCase(startup, {
      ...options,
      command: 'node server.mjs',
    });

    strict.equal(result.pass, true);
  });

  await it('a server that never prints the awaited output fails instead of hanging', async () => {
    const result = await runCase(
      {
        ...startup,
        serve: { ...startup.serve, after: '^never\\n', timeout: 1500 },
      },
      { ...options, command: 'node server.mjs' }
    );

    strict.equal(result.pass, false);
  });

  await rm(folder, { recursive: true, force: true });
});

const headed = {
  name: 'answers a cross-origin request with its id in a header',
  serve: {
    port: PORT + 7,
    requests: [
      {
        method: 'GET',
        path: '/stats',
        headers: { origin: 'http://localhost:5173' },
      },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [
        {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '^http://localhost:5173$',
            'X-Request-Id': '^{responses.0.requestId}$',
            'Access-Control-Allow-Credentials': '^$',
          },
        },
      ],
    },
  ],
};

const headerServer = (headers) => `
import { createServer } from 'node:http';

createServer((request, response) => {
  const origin = request.headers.origin;

  response.writeHead(200, { 'content-type': 'application/json', ...${headers} });
  response.end(JSON.stringify({ requestId: 'req-1' }));
}).listen(Number(process.env.PORT));
`;

const headerServers = [
  {
    promise: 'a server that reflects the origin and repeats the id passes',
    headers:
      "{ 'access-control-allow-origin': origin, 'x-request-id': 'req-1' }",
    pass: true,
  },
  {
    promise: 'a server that leaves out an expected header fails',
    headers: "{ 'x-request-id': 'req-1' }",
    pass: false,
  },
  {
    promise: 'a header that disagrees with the body fails',
    headers:
      "{ 'access-control-allow-origin': origin, 'x-request-id': 'req-2' }",
    pass: false,
  },
  {
    promise: 'a header the case expects absent fails when present',
    headers:
      "{ 'access-control-allow-origin': origin, 'x-request-id': 'req-1', 'access-control-allow-credentials': 'true' }",
    pass: false,
  },
];

await describe('Checking the headers of a served response', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-headers-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, headers, pass }] of headerServers.entries()) {
    await writeFile(join(folder, `${index}.mjs`), headerServer(headers));

    await it(promise, async () => {
      const result = await runCase(headed, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});

const notes = {
  name: 'notes.pdf',
  type: 'application/pdf',
  base64: 'JVBERi0xLjQKJSVFT0YK',
};

const uploadedNotes = ['file', 'notes.pdf', 'application/pdf', notes.base64];

const uploads = [
  {
    promise: 'fields before a file arrive in the order the case gives them',
    form: { question: 'What is this?', file: notes },
    parts: [['question', 'What is this?'], uploadedNotes],
  },
  {
    promise: 'fields after a file arrive in the order the case gives them',
    form: { file: notes, question: 'What is this?' },
    parts: [uploadedNotes, ['question', 'What is this?']],
  },
];

const formServer = `
import { createServer } from 'node:http';

const describe = async ([name, value]) =>
  typeof value === 'string'
    ? [name, value]
    : [name, value.name, value.type, Buffer.from(await value.arrayBuffer()).toString('base64')];

createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  const form = await new Response(Buffer.concat(chunks), {
    headers: { 'content-type': request.headers['content-type'] },
  }).formData();
  const parts = await Promise.all([...form].map(describe));

  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ parts }));
}).listen(Number(process.env.PORT));
`;

await describe('Uploading files to a served case as a multipart form', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-form-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  await writeFile(join(folder, 'server.mjs'), formServer);

  for (const { promise, form, parts } of uploads)
    await it(promise, async () => {
      const result = await runCase(
        {
          name: 'uploads a document with a question',
          serve: {
            port: PORT + 5,
            requests: [{ method: 'POST', path: '/chat', form }],
          },
          expect: [
            {
              type: 'responses',
              responses: [{ status: 200, match: { parts } }],
            },
          ],
        },
        { ...options, command: 'node server.mjs' }
      );

      strict.equal(result.pass, true);
    });

  await rm(folder, { recursive: true, force: true });
});

const counted = {
  name: 'spends a limit by repeating a request, then reads the next answer',
  serve: {
    port: PORT + 11,
    requests: [
      { method: 'GET', path: '/count', repeat: 3 },
      { method: 'GET', path: '/count' },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [
        { status: 200, match: { count: 3 } },
        { status: 200, match: { count: 4 } },
      ],
    },
  ],
};

const countingServer = `
import { createServer } from 'node:http';

let count = 0;

createServer((request, response) => {
  count += 1;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ count }));
}).listen(Number(process.env.PORT));
`;

await describe('Repeating a request in a served case', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-repeat-'));

  await writeFile(join(folder, 'server.mjs'), countingServer);

  await it('a repeated request reaches the server that many times and keeps only its last answer', async () => {
    const result = await runCase(counted, {
      cwd: folder,
      host: '127.0.0.1',
      timeout: 30000,
      command: 'node server.mjs',
    });

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});
