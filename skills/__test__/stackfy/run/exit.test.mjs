import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const success = { type: 'exit', code: 0 };

const failure = { type: 'exit', failure: true };

const exits = [
  {
    promise: 'accepts the exact exit code',
    check: success,
    code: 0,
    accepted: true,
  },
  {
    promise: 'rejects any other exit code',
    check: success,
    code: 1,
    accepted: false,
  },
  {
    promise: 'accepts a failure with the usual exit code',
    check: failure,
    code: 1,
    accepted: true,
  },
  {
    promise:
      "accepts a failure with a test runner's own exit code, such as Cargo's",
    check: failure,
    code: 101,
    accepted: true,
  },
  {
    promise: 'rejects a success where a failure was expected',
    check: failure,
    code: 0,
    accepted: false,
  },
];

describe('Exit check', () => {
  for (const { promise, check, code, accepted } of exits)
    it(promise, () => {
      strict.equal(evaluate([check], { code }).length === 0, accepted);
    });
});
