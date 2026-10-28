import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const plans = {
  type: 'lines',
  pattern: '^(premium|medium|basic) \\((\\d+(?:\\.\\d+)?)%\\)$',
  count: 3,
  distinct: { group: 1, values: ['premium', 'medium', 'basic'] },
  sum: { group: 2, value: 100, tolerance: 0.1 },
  order: { group: 2, direction: 'desc' },
  last: { group: 1, value: 'basic' },
};

const outputs = [
  {
    promise: 'accepts the plans from most to least likely',
    stdout: 'medium (45.80%)\npremium (42.91%)\nbasic (11.30%)\n',
    accepted: true,
  },
  {
    promise: 'accepts rounding drift up to 0.1 in the total',
    stdout: 'premium (50.00%)\nmedium (39.99%)\nbasic (10.03%)\n',
    accepted: true,
  },
  {
    promise: 'rejects a progress bar printed before the plans',
    stdout:
      '1/1 [====] 0s\npremium (50.00%)\nmedium (40.00%)\nbasic (10.00%)\n',
    accepted: false,
  },
  {
    promise: 'rejects plans out of order',
    stdout: 'premium (30.00%)\nmedium (50.00%)\nbasic (20.00%)\n',
    accepted: false,
  },
  {
    promise: 'rejects percentages that do not add up to 100',
    stdout: 'premium (50.00%)\nmedium (30.00%)\nbasic (10.00%)\n',
    accepted: false,
  },
  {
    promise: 'rejects basic anywhere but last',
    stdout: 'premium (50.00%)\nbasic (30.00%)\nmedium (20.00%)\n',
    accepted: false,
  },
  {
    promise: 'rejects a repeated plan',
    stdout: 'premium (50.00%)\npremium (40.00%)\nbasic (10.00%)\n',
    accepted: false,
  },
  {
    promise: 'rejects a missing plan',
    stdout: 'premium (60.00%)\nbasic (40.00%)\n',
    accepted: false,
  },
];

describe('Lines check', () => {
  for (const { promise, stdout, accepted } of outputs)
    it(promise, () => {
      strict.equal(evaluate([plans], { stdout }).length === 0, accepted);
    });
});
