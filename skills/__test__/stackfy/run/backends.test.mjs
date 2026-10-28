import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const PORT = 48071;

const BACKEND_PORT = PORT + 1;

const STORE_PORT = PORT + 3;

const FIXED_PORT = PORT + 10;

const reported = {
  name: 'reports its work to a backend that shows it a moment later',
  serve: {
    port: PORT,
    requests: [
      { method: 'GET', path: '/work' },
      {
        method: 'GET',
        port: BACKEND_PORT,
        path: '/events',
        until: { match: { events: ['work done'] }, timeout: 4000 },
      },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [
        { status: 200 },
        { status: 200, match: { events: ['work done'] } },
      ],
    },
  ],
};

const reportingServer = (report) => `
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const report = async () => {
  await sleep(1500);
  await fetch(process.env.BACKEND_URL, {
    method: 'POST',
    body: JSON.stringify({ event: ${report} }),
  });
};

createServer((request, response) => {
  response.end('{}');
  report();
}).listen(Number(process.env.PORT));
`;

const reporters = [
  {
    promise:
      'a request to another service is repeated until that service shows what the program sent it',
    report: "'work done'",
    pass: true,
  },
  {
    promise:
      'a service that never shows the expected answer fails once the wait runs out',
    report: "'work skipped'",
    pass: false,
  },
];

const startBackend = (port) =>
  new Promise((resolveBackend) => {
    const events = [];
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;

      if (request.method === 'POST') events.push(JSON.parse(body).event);

      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ events }));
    });

    server.listen(port, '127.0.0.1', () =>
      resolveBackend({
        clear: () => events.splice(0),
        close: () => new Promise((done) => server.close(done)),
      })
    );
  });

await describe('Querying a backend beside a served program', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-backends-'));
  const backend = await startBackend(BACKEND_PORT);
  const options = {
    cwd: folder,
    host: '127.0.0.1',
    timeout: 30000,
    env: { BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}/events` },
  };

  for (const [index, { promise, report, pass }] of reporters.entries()) {
    await writeFile(join(folder, `${index}.mjs`), reportingServer(report));

    await it(promise, async () => {
      backend.clear();

      const result = await runCase(reported, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await backend.close();
  await rm(folder, { recursive: true, force: true });
});

const session = {
  name: 'opens a session and answers within it',
  serve: {
    port: PORT + 2,
    requests: [
      { method: 'POST', path: '/sessions' },
      {
        method: 'GET',
        path: '/whoami',
        headers: { 'mcp-session-id': '{headers.0.Mcp-Session-Id}' },
      },
    ],
  },
  expect: [
    {
      type: 'responses',
      responses: [
        { status: 200 },
        { status: 200, match: { session: { $pattern: '^s-' } } },
      ],
    },
  ],
};

const sessionServer = (header) => `
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const sessions = new Set();

createServer((request, response) => {
  if (request.method === 'POST') {
    const id = \`s-\${randomUUID()}\`;
    sessions.add(id);
    response.writeHead(200, { '${header}': id });
    return response.end('{}');
  }

  const id = request.headers['mcp-session-id'];
  if (!sessions.has(id)) {
    response.writeHead(400);
    return response.end('Invalid session ID');
  }

  response.end(JSON.stringify({ session: id }));
}).listen(Number(process.env.PORT));
`;

const sessionServers = [
  {
    promise:
      'a later request carries the header an earlier answer set, such as an MCP session id',
    header: 'mcp-session-id',
    pass: true,
  },
  {
    promise:
      'a server that sets the session under another header fails the request that needs it',
    header: 'x-session-id',
    pass: false,
  },
];

await describe('Carrying a header from an earlier answer', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-session-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, header, pass }] of sessionServers.entries()) {
    await writeFile(join(folder, `${index}.mjs`), sessionServer(header));

    await it(promise, async () => {
      const result = await runCase(session, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});

const stored = {
  name: 'stores its work in a backend and exits',
  inspect: [{ method: 'GET', port: STORE_PORT, path: '/events' }],
  expect: [
    { type: 'exit', code: 0 },
    {
      type: 'responses',
      responses: [{ status: 200, match: { events: ['chunks stored'] } }],
    },
  ],
};

const storingProgram = (event) => `
import { setTimeout as sleep } from 'node:timers/promises';

await sleep(1000);
await fetch(process.env.BACKEND_URL, {
  method: 'POST',
  body: JSON.stringify({ event: ${event} }),
});
`;

const storers = [
  {
    promise:
      'the backend is queried once the program exits, so it shows everything the program stored',
    event: "'chunks stored'",
    pass: true,
  },
  {
    promise: 'a program that stores something else fails the query',
    event: "'chunks skipped'",
    pass: false,
  },
];

await describe('Inspecting a backend after a program exits', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-inspect-'));
  const backend = await startBackend(STORE_PORT);
  const options = {
    cwd: folder,
    host: '127.0.0.1',
    timeout: 30000,
    env: { BACKEND_URL: `http://127.0.0.1:${STORE_PORT}/events` },
  };

  for (const [index, { promise, event, pass }] of storers.entries()) {
    await writeFile(join(folder, `${index}.mjs`), storingProgram(event));

    await it(promise, async () => {
      backend.clear();

      const result = await runCase(stored, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await backend.close();
  await rm(folder, { recursive: true, force: true });
});

const fixedAddress = {
  name: 'lists the customers of an API it always calls at the same address',
  replayPort: FIXED_PORT,
  replay: [{ method: 'GET', path: '/v1/customers', json: [{ name: 'Ana' }] }],
  expect: [{ type: 'json', values: [[{ name: 'Ana' }]] }],
};

const fixedAddressClient = `
const response = await fetch('http://127.0.0.1:${FIXED_PORT}/v1/customers');

console.log(JSON.stringify(await response.json()));
`;

await describe('Answering a program that calls a fixed address', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-fixed-'));

  await writeFile(join(folder, 'client.mjs'), fixedAddressClient);

  await it('the replay listens on the port the case names, so a hardcoded address gets the recorded answer', async () => {
    const result = await runCase(fixedAddress, {
      cwd: folder,
      host: '127.0.0.1',
      timeout: 30000,
      command: 'node client.mjs',
    });

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});

await describe('Pointing a transcription to other recorded services', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-replay-url-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };
  const status = {
    name: 'reads a status page through the replay',
    env: { STATUS_URL: '{replay}/status.json' },
    replay: [
      { method: 'GET', path: '/status.json', json: { indicator: 'none' } },
    ],
    expect: [{ type: 'output', pattern: '^none\\n$' }],
  };

  await writeFile(
    join(folder, 'status.mjs'),
    'const { indicator } = await (await fetch(process.env.STATUS_URL)).json();\nconsole.log(indicator);'
  );

  await it('a variable with {replay} reaches the program as the replay address', async () => {
    const result = await runCase(status, {
      ...options,
      command: 'node status.mjs',
    });

    strict.equal(result.pass, true);
  });

  await rm(folder, { recursive: true, force: true });
});
