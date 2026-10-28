import { describe, it, strict } from 'poku';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const tensors = {
  type: 'numbers',
  groups: [
    [0.33, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
  ],
  tolerance: 0.000001,
};

const printouts = [
  {
    runtime: 'TensorFlow.js',
    stdout: [
      'Tensor',
      '    [[0.33, 1, 0, 0, 1, 0, 0],',
      '     [0   , 0, 1, 0, 0, 1, 0],',
      '     [1   , 0, 0, 1, 0, 0, 1]]',
      'Tensor',
      '    [[1, 0, 0],',
      '     [0, 1, 0],',
      '     [0, 0, 1]]',
    ].join('\n'),
  },
  {
    runtime: 'TensorFlow for Python',
    stdout: [
      'tf.Tensor(',
      '[[0.33 1.   0.   0.   1.   0.   0.  ]',
      ' [0.   0.   1.   0.   0.   1.   0.  ]',
      ' [1.   0.   0.   1.   0.   0.   1.  ]], shape=(3, 7), dtype=float32)',
      'tf.Tensor(',
      '[[1. 0. 0.]',
      ' [0. 1. 0.]',
      ' [0. 0. 1.]], shape=(3, 3), dtype=float32)',
    ].join('\n'),
  },
  {
    runtime: 'candle for Rust',
    stdout: [
      '[[0.3300, 1.0000, 0.0000, 0.0000, 1.0000, 0.0000, 0.0000],',
      ' [0.0000, 0.0000, 1.0000, 0.0000, 0.0000, 1.0000, 0.0000],',
      ' [1.0000, 0.0000, 0.0000, 1.0000, 0.0000, 0.0000, 1.0000]]',
      'Tensor[[3, 7], f32]',
      '[[1., 0., 0.],',
      ' [0., 1., 0.],',
      ' [0., 0., 1.]]',
      'Tensor[[3, 3], f32]',
    ].join('\n'),
  },
];

const rejectedPrintouts = [
  {
    promise: 'rejects the tensors printed in the opposite order',
    stdout:
      '[[1, 0, 0], [0, 1, 0], [0, 0, 1]]\n[[0.33, 1, 0, 0, 1, 0, 0], [0, 0, 1, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1]]',
  },
  {
    promise: 'rejects a value beyond the tolerance',
    stdout:
      '[[0.34, 1, 0, 0, 1, 0, 0], [0, 0, 1, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1]]\n[[1, 0, 0], [0, 1, 0], [0, 0, 1]]',
  },
];

const simulation = {
  type: 'numbers',
  groups: [
    [{ value: 5078, tolerance: 100 }, { value: 7906, tolerance: 240 }, 100],
  ],
};

const summaries = [
  {
    promise: 'accepts values within the tolerance each one names',
    stdout: 'Mean: 5160.12 | P95: 7700.50\nPositive: 100.0%',
    failures: 0,
  },
  {
    promise:
      'rejects a value beyond its own tolerance, though within a wider one',
    stdout: 'Mean: 5200.00 | P95: 7906.00\nPositive: 100.0%',
    failures: 1,
  },
  {
    promise: 'holds plain values to the tolerance of the check',
    stdout: 'Mean: 5078.00 | P95: 7906.00\nPositive: 99.9%',
    failures: 1,
  },
];

describe('Numbers check', () => {
  for (const { runtime, stdout } of printouts)
    it(`accepts the tensors as ${runtime} prints them`, () => {
      strict.deepEqual(evaluate([tensors], { stdout }), []);
    });

  for (const { promise, stdout } of rejectedPrintouts)
    it(promise, () => {
      strict.equal(evaluate([tensors], { stdout }).length, 1);
    });

  for (const { promise, stdout, failures } of summaries)
    it(promise, () => {
      strict.equal(evaluate([simulation], { stdout }).length, failures);
    });
});
