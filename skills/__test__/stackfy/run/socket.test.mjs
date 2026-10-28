import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const LONG_TEXT = 'x'.repeat(70000);

const conversation = (text) => ({
  name: 'answers a message that arrives over a socket',
  env: { SLACK_API_URL: '{replay}/api/' },
  socket: {
    timeout: 3000,
    settle: 300,
    messages: [
      { type: 'hello' },
      {
        envelope_id: 'envelope-1',
        type: 'events_api',
        payload: { event: { type: 'message', channel: 'C1', text } },
      },
    ],
  },
  replay: [
    {
      method: 'POST',
      path: '/api/apps.connections.open',
      incidental: true,
      json: { ok: true, url: '{replaySocket}/link/?ticket=1' },
    },
    { method: 'POST', path: '/api/chat.postMessage', json: { ok: true } },
  ],
  expect: [
    {
      type: 'responses',
      responses: [{ match: { envelope_id: 'envelope-1' } }],
    },
    {
      type: 'requests',
      requests: [
        {
          method: 'POST',
          path: '/api/chat.postMessage',
          body: { channel: 'C1', text: `received ${text.length}` },
        },
      ],
    },
  ],
});

const bot = ({ acknowledge, encoding }) => `
const api = process.env.SLACK_API_URL;
const encodings = {
  form: (fields) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }),
  json: (fields) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) }),
};
const call = (method, fields) => fetch(api + method, { method: 'POST', ...encodings.${encoding}(fields) });
const { url } = await (await call('apps.connections.open', {})).json();
const socket = new WebSocket(url);

socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data);

  if (message.type !== 'events_api') return;
  if (${acknowledge}) socket.send(JSON.stringify({ envelope_id: message.envelope_id }));
  await call('chat.postMessage', { channel: message.payload.event.channel, text: 'received ' + message.payload.event.text.length });
});
`;

const bots = [
  {
    promise:
      'a bot that acknowledges the event and answers through the recorded API passes',
    source: bot({ acknowledge: true, encoding: 'form' }),
    definition: conversation('card: investigate the alerts'),
    pass: true,
  },
  {
    promise: 'the same answer sent as JSON instead of a form passes too',
    source: bot({ acknowledge: true, encoding: 'json' }),
    definition: conversation('card: investigate the alerts'),
    pass: true,
  },
  {
    promise: 'an event longer than 64 KiB reaches the bot whole',
    source: bot({ acknowledge: true, encoding: 'form' }),
    definition: conversation(LONG_TEXT),
    pass: true,
  },
  {
    promise: 'a bot that never acknowledges the event fails',
    source: bot({ acknowledge: false, encoding: 'form' }),
    definition: conversation('card: investigate the alerts'),
    pass: false,
  },
  {
    promise: 'a bot that never connects fails instead of hanging',
    source: 'setInterval(() => {}, 1000);',
    definition: conversation('card: investigate the alerts'),
    pass: false,
  },
];

await describe('Checking a transcription that is a bot on a socket the replay serves', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-socket-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, source, definition, pass }] of bots.entries()) {
    await writeFile(join(folder, `${index}.mjs`), source);

    await it(promise, async () => {
      const result = await runCase(definition, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});
