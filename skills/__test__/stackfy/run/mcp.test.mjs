import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const toolListing = {
  type: 'responses',
  responses: [
    {
      match: {
        id: 2,
        result: {
          $like: {
            tools: {
              $unordered: [
                { name: 'encrypt_message', inputSchema: { type: 'object' } },
                { name: 'decrypt_message' },
              ],
            },
          },
        },
      },
    },
  ],
};

const listing = (...tools) => [
  {
    status: null,
    text: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools } }),
  },
];

const encryptTool = {
  name: 'encrypt_message',
  inputSchema: { type: 'object', required: ['message'] },
};

const decryptTool = { name: 'decrypt_message', inputSchema: {} };

const listings = [
  {
    promise: 'accepts the listed tools in the order the SDK chooses',
    responses: listing(decryptTool, encryptTool),
    accepted: true,
  },
  {
    promise: 'rejects a listing with a tool more',
    responses: listing(encryptTool, decryptTool, { name: 'sign_message' }),
    accepted: false,
  },
  {
    promise: 'rejects a listing that repeats one tool in place of another',
    responses: listing(encryptTool, encryptTool),
    accepted: false,
  },
  {
    promise: 'rejects a listed tool that differs from its expectation',
    responses: listing(decryptTool, { ...encryptTool, inputSchema: {} }),
    accepted: false,
  },
];

const createdText = {
  type: 'responses',
  responses: [
    {
      match: {
        id: 3,
        result: {
          $like: {
            content: [
              {
                type: 'text',
                text: { $json: { message: 'user Ana created!', id: 'a1' } },
              },
            ],
          },
        },
      },
    },
  ],
};

const toolResult = (text) => [
  {
    status: null,
    text: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      result: { content: [{ type: 'text', text }] },
    }),
  },
];

const texts = [
  {
    promise: 'accepts the same value with other spacing and key order',
    responses: toolResult(
      JSON.stringify({ id: 'a1', message: 'user Ana created!' }, null, 2)
    ),
    accepted: true,
  },
  {
    promise: 'rejects a value that differs',
    responses: toolResult(
      JSON.stringify({ message: 'user Ana created!', id: 'b2' })
    ),
    accepted: false,
  },
  {
    promise: 'rejects a value with a field more',
    responses: toolResult(
      JSON.stringify({ message: 'user Ana created!', id: 'a1', ok: true })
    ),
    accepted: false,
  },
  {
    promise: 'rejects a text that is not JSON',
    responses: toolResult('user Ana created!'),
    accepted: false,
  },
];

const session = {
  name: 'lists and calls a tool over standard input and output',
  mcp: {
    timeout: 2000,
    messages: [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { text: '{responses.0.result.serverInfo.name}' },
        },
      },
    ],
  },
  expect: [
    { type: 'exit', code: 0 },
    {
      type: 'responses',
      responses: [
        { match: { id: 1, result: { serverInfo: { name: 'notes' } } } },
        {
          match: {
            id: 2,
            result: { $like: { content: [{ text: 'echo:notes' }] } },
          },
        },
      ],
    },
  ],
};

const server = ({ name, prefix, onEnd }) => `
import { createInterface } from 'node:readline';

const answer = (id, result) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');

const lines = createInterface({ input: process.stdin });

lines.on('line', (line) => {
  const { id, method, params } = JSON.parse(line);

  if (id === undefined) return;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message' }) + '\\n');
  console.error('handled', method);

  if (method === 'initialize') return answer(id, { serverInfo: { name: '${name}' } });
  setTimeout(() => answer(id, { content: [{ type: 'text', text: '${prefix}' + params.arguments.text }] }), 50);
});
lines.on('close', () => { ${onEnd} });
`;

const servers = [
  {
    promise: 'a server that answers every request as recorded passes',
    source: server({ name: 'notes', prefix: 'echo:', onEnd: '' }),
    pass: true,
  },
  {
    promise: 'a server that answers a request with something else fails',
    source: server({ name: 'notes', prefix: 'said:', onEnd: '' }),
    pass: false,
  },
  {
    promise: 'later messages carry values from earlier answers',
    source: server({ name: 'other', prefix: 'echo:', onEnd: '' }),
    definition: {
      ...session,
      expect: [
        {
          type: 'responses',
          responses: [
            {},
            {
              match: {
                result: { $like: { content: [{ text: 'echo:other' }] } },
              },
            },
          ],
        },
      ],
    },
    pass: true,
  },
  {
    promise: 'a server that never answers fails instead of hanging',
    source: 'process.stdin.resume();',
    pass: false,
  },
  {
    promise:
      'a server that keeps running after its input closes is stopped and fails the exit check',
    source: server({
      name: 'notes',
      prefix: 'echo:',
      onEnd: 'setInterval(() => {}, 1000);',
    }),
    pass: false,
  },
];

await describe('Checking a transcription that is an MCP server over standard input and output', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-mcp-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [
    index,
    { promise, source, definition, pass },
  ] of servers.entries()) {
    await writeFile(join(folder, `${index}.mjs`), source);

    await it(promise, async () => {
      const result = await runCase(definition ?? session, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});

describe('Comparing a listing in any order', () => {
  for (const { promise, responses, accepted } of listings)
    it(promise, () => {
      strict.equal(
        evaluate([toolListing], { responses }).length === 0,
        accepted
      );
    });
});

describe('Comparing a tool text that holds JSON by its value', () => {
  for (const { promise, responses, accepted } of texts)
    it(promise, () => {
      strict.equal(
        evaluate([createdText], { responses }).length === 0,
        accepted
      );
    });
});
