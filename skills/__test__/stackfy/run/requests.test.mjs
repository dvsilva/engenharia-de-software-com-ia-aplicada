import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const calls = {
  type: 'requests',
  requests: [
    { method: 'GET', path: '/api/tags' },
    {
      method: 'POST',
      path: '/api/pull',
      body: { anyOf: [{ model: 'gpt-oss:20b' }, { name: 'gpt-oss:20b' }] },
    },
    {
      method: 'POST',
      path: '/api/generate',
      body: { model: 'gpt-oss:20b', prompt: 'hi', stream: false },
    },
  ],
};

const list = { method: 'GET', path: '/api/tags', body: null };
const pull = {
  method: 'POST',
  path: '/api/pull',
  body: { model: 'gpt-oss:20b' },
};
const generate = {
  method: 'POST',
  path: '/api/generate',
  body: { model: 'gpt-oss:20b', prompt: 'hi', stream: false },
};

const transcriptions = [
  {
    promise: 'accepts the same calls with extra fields a client library adds',
    requests: [
      list,
      { ...pull, body: { model: 'gpt-oss:20b', stream: true } },
      { ...generate, body: { ...generate.body, options: {} } },
    ],
    accepted: true,
  },
  {
    promise: 'accepts the older name field for a pull',
    requests: [list, { ...pull, body: { name: 'gpt-oss:20b' } }, generate],
    accepted: true,
  },
  {
    promise: 'rejects a generation without the explicit stream flag',
    requests: [
      list,
      pull,
      { ...generate, body: { model: 'gpt-oss:20b', prompt: 'hi' } },
    ],
    accepted: false,
  },
  {
    promise: 'rejects a call to another endpoint',
    requests: [list, pull, { ...generate, path: '/api/chat' }],
    accepted: false,
  },
  {
    promise: 'rejects a missing call',
    requests: [list, generate],
    accepted: false,
  },
];

const agentTurn = {
  type: 'requests',
  requests: [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      body: {
        model: 'openai/gpt-4o-mini',
        tools: { $like: [{ function: { name: 'list_alerts' } }] },
        messages: {
          $like: [
            { role: 'user', content: 'Which alerts are firing?' },
            {
              role: 'assistant',
              tool_calls: [{ id: 'call_1', function: { name: 'list_alerts' } }],
            },
            { role: 'tool', tool_call_id: 'call_1', content: 'Found 1 alert' },
          ],
        },
      },
    },
  ],
};

const conversation = [
  { role: 'user', content: 'Which alerts are firing?' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'list_alerts', arguments: '{"status": "firing"}' },
      },
    ],
  },
  {
    role: 'tool',
    name: 'list_alerts',
    tool_call_id: 'call_1',
    content: 'Found 1 alert',
  },
];

const listAlerts = {
  type: 'function',
  function: {
    name: 'list_alerts',
    parameters: { type: 'object', properties: {} },
  },
};

const turn = (body) => [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    body: {
      model: 'openai/gpt-4o-mini',
      temperature: 0,
      tools: [listAlerts],
      messages: conversation,
      ...body,
    },
  },
];

const agentTranscriptions = [
  {
    promise:
      'accepts a conversation whose messages carry fields a client library adds',
    requests: turn({}),
    accepted: true,
  },
  {
    promise: 'rejects a conversation that drops the tool result',
    requests: turn({ messages: conversation.slice(0, 2) }),
    accepted: false,
  },
  {
    promise: 'rejects another prompt inside the conversation',
    requests: turn({
      messages: [
        { role: 'user', content: 'Which alerts were resolved?' },
        ...conversation.slice(1),
      ],
    }),
    accepted: false,
  },
  {
    promise: 'rejects a tool result tied to another call',
    requests: turn({
      messages: [
        ...conversation.slice(0, 2),
        { ...conversation[2], tool_call_id: 'call_2' },
      ],
    }),
    accepted: false,
  },
  {
    promise: 'rejects a turn that offers another tool',
    requests: turn({
      tools: [{ ...listAlerts, function: { name: 'open_incident' } }],
    }),
    accepted: false,
  },
];

const csvToJson = {
  type: 'function',
  function: { name: 'csv_to_json', description: 'Convert CSV to JSON' },
};

const gatheredTools = {
  type: 'requests',
  requests: [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      body: {
        tools: {
          $includes: [csvToJson, { function: { name: 'write_file' } }],
        },
      },
    },
  ],
};

const offering = (tools) => [
  { method: 'POST', path: '/v1/chat/completions', body: { tools } },
];

const toolNamed = (name) => ({ type: 'function', function: { name } });

const gatheredTranscriptions = [
  {
    promise:
      'accepts a turn that offers the named tools among others, in any order',
    requests: offering([
      toolNamed('write_file'),
      toolNamed('insert-many'),
      csvToJson,
    ]),
    accepted: true,
  },
  {
    promise: 'rejects a turn that lacks a named tool',
    requests: offering([csvToJson, toolNamed('insert-many')]),
    accepted: false,
  },
  {
    promise: 'rejects a named tool described differently',
    requests: offering([
      {
        ...csvToJson,
        function: { ...csvToJson.function, description: 'Parse CSV' },
      },
      toolNamed('write_file'),
    ]),
    accepted: false,
  },
];

const question = { role: 'user', content: '{"question":"Cancel my visit"}' };

const datedPrompt = {
  type: 'requests',
  requests: [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      body: {
        messages: {
          $like: [
            {
              role: 'system',
              content: {
                $pattern:
                  '^\\{"role":"Intent Classifier","current_date":"\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"\\}$',
              },
            },
            question,
          ],
        },
      },
    },
  ],
};

const prompting = (system) => [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    body: { messages: [{ role: 'system', content: system }, question] },
  },
];

const datedTranscriptions = [
  {
    promise: 'accepts a prompt whose date differs from the recorded one',
    requests: prompting(
      '{"role":"Intent Classifier","current_date":"2027-03-14T08:05:09.120Z"}'
    ),
    accepted: true,
  },
  {
    promise: 'rejects a date written in another format',
    requests: prompting(
      '{"role":"Intent Classifier","current_date":"2027-03-14T08:05:09.120+00:00"}'
    ),
    accepted: false,
  },
  {
    promise: 'rejects a prompt that differs outside the date',
    requests: prompting(
      '{"role": "Intent Classifier", "current_date": "2027-03-14T08:05:09.120Z"}'
    ),
    accepted: false,
  },
];

const exactMessages = {
  type: 'requests',
  requests: [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      body: {
        messages: [{ role: 'user', content: 'Which alerts are firing?' }],
      },
    },
  ],
};

const exactTranscriptions = [
  {
    promise: 'accepts the same messages in a field the check compares exactly',
    requests: turn({ messages: conversation.slice(0, 1) }),
    accepted: true,
  },
  {
    promise:
      'rejects fields a client library adds where the check compares exactly instead of by likeness',
    requests: turn({ messages: [{ ...conversation[0], name: 'student' }] }),
    accepted: false,
  },
];

const embeddingCall = {
  type: 'requests',
  requests: [
    {
      method: 'POST',
      path: { $pattern: '^/api/embed(?:dings)?$' },
      body: {
        anyOf: [
          { model: 'nomic-embed-text', prompt: 'idade mínima' },
          { model: 'nomic-embed-text', input: 'idade mínima' },
        ],
      },
    },
  ],
};

const embedding = (path, body) => [
  { method: 'POST', path, body: { model: 'nomic-embed-text', ...body } },
];

const embeddingTranscriptions = [
  {
    promise: 'accepts the legacy embeddings endpoint with a prompt',
    requests: embedding('/api/embeddings', { prompt: 'idade mínima' }),
    accepted: true,
  },
  {
    promise: 'accepts the current embed endpoint with an input',
    requests: embedding('/api/embed', { input: 'idade mínima' }),
    accepted: true,
  },
  {
    promise: 'rejects an endpoint outside the pattern',
    requests: embedding('/v1/embeddings', { input: 'idade mínima' }),
    accepted: false,
  },
  {
    promise: 'rejects another text on an accepted endpoint',
    requests: embedding('/api/embed', { input: 'idade máxima' }),
    accepted: false,
  },
];

const checks = [
  [calls, transcriptions],
  [agentTurn, agentTranscriptions],
  [gatheredTools, gatheredTranscriptions],
  [datedPrompt, datedTranscriptions],
  [embeddingCall, embeddingTranscriptions],
  [exactMessages, exactTranscriptions],
];

describe('Requests check', () => {
  for (const [check, rows] of checks)
    for (const { promise, requests, accepted } of rows)
      it(promise, () => {
        strict.equal(evaluate([check], { requests }).length === 0, accepted);
      });
});
