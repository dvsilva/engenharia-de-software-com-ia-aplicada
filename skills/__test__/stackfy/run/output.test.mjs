import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const usage = {
  type: 'output',
  stream: 'stderr',
  pattern: '^Task "missing" was not found\\nUsage:\\n  task list\\n$',
};

const listing = { type: 'output', pattern: '^t-1\\topen\\tBuy milk\\n$' };

const outputs = [
  {
    promise: 'accepts the exact error on standard error',
    check: usage,
    run: {
      stdout: '',
      stderr: 'Task "missing" was not found\nUsage:\n  task list\n',
    },
    accepted: true,
  },
  {
    promise: 'accepts Windows line endings as the same text',
    check: usage,
    run: {
      stdout: '',
      stderr: 'Task "missing" was not found\r\nUsage:\r\n  task list\r\n',
    },
    accepted: true,
  },
  {
    promise: 'rejects the error printed to standard output instead',
    check: usage,
    run: {
      stdout: 'Task "missing" was not found\nUsage:\n  task list\n',
      stderr: '',
    },
    accepted: false,
  },
  {
    promise: 'rejects an error without the usage that follows it',
    check: usage,
    run: { stdout: '', stderr: 'Task "missing" was not found\n' },
    accepted: false,
  },
  {
    promise: 'checks standard output when no stream is named',
    check: listing,
    run: { stdout: 't-1\topen\tBuy milk\n', stderr: '' },
    accepted: true,
  },
  {
    promise: 'rejects columns separated by spaces instead of tabs',
    check: listing,
    run: { stdout: 't-1 open Buy milk\n', stderr: '' },
    accepted: false,
  },
];

describe('Output check', () => {
  for (const { promise, check, run, accepted } of outputs)
    it(promise, () => {
      strict.equal(evaluate([check], run).length === 0, accepted);
    });
});
