import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const exchanges = [
  { json: { model: 'gpt-oss:20b', response: 'I’m sorry', done: true } },
  {
    chunks: [
      '{"response":"I’m","done":false}\n',
      '{"response":"","done":true}\n',
    ],
  },
];

const printed = {
  type: 'json',
  values: [
    { $replay: 0, pick: ['response', 'thinking'] },
    { $replayChunks: 1 },
  ],
};

const outputs = [
  {
    promise:
      'accepts the picked fields pretty-printed and every streamed chunk',
    stdout: [
      '{',
      '  "response": "I’m sorry",',
      '  "thinking": null',
      '}',
      '{"response":"I’m","done":false}',
      '{"response":"","done":true}',
    ].join('\n'),
    accepted: true,
  },
  {
    promise: 'accepts other key orders and plain text around the JSON',
    stdout: [
      'pulling manifest',
      '[[0.33 1. 0.]]',
      '{"thinking":null,"response":"I’m sorry"}',
      '{"done":false,"response":"I’m"}',
      '{"done":true,"response":""}',
    ].join('\n'),
    accepted: true,
  },
  {
    promise: 'rejects a missing field that should print as null',
    stdout: [
      '{"response":"I’m sorry"}',
      '{"response":"I’m","done":false}',
      '{"response":"","done":true}',
    ].join('\n'),
    accepted: false,
  },
  {
    promise: 'rejects the stream printed before the single response',
    stdout: [
      '{"response":"I’m","done":false}',
      '{"response":"","done":true}',
      '{"response":"I’m sorry","thinking":null}',
    ].join('\n'),
    accepted: false,
  },
];

describe('JSON check', () => {
  for (const { promise, stdout, accepted } of outputs)
    it(promise, () => {
      strict.equal(
        evaluate([printed], { stdout }, exchanges).length === 0,
        accepted
      );
    });
});
