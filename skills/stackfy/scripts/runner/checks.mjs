import { isDeepStrictEqual } from 'node:util';
import { extractJsonValues, isRecord, parseJson } from './json.mjs';
import { fillReferences } from './placeholders.mjs';

const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?!\w)/g;

const isClose = (left, right, tolerance) => Math.abs(left - right) <= tolerance;

const extractNumbers = (text) =>
  [...text.matchAll(NUMBER)].map((match) => Number(match[0]));

const isCloseTo = (actual, expected, tolerance) =>
  typeof expected === 'number'
    ? isClose(actual, expected, tolerance)
    : isClose(actual, expected.value, expected.tolerance ?? tolerance);

const indexOfRun = (numbers, group, tolerance, from) => {
  for (let start = from; start + group.length <= numbers.length; start++) {
    const matches = group.every((expected, offset) =>
      isCloseTo(numbers[start + offset], expected, tolerance)
    );
    if (matches) return start;
  }

  return -1;
};

const findMissingGroup = (numbers, groups, tolerance = 0) => {
  let from = 0;

  for (const [index, group] of groups.entries()) {
    const start = indexOfRun(numbers, group, tolerance, from);
    if (start < 0) return index;
    from = start + group.length;
  }

  return -1;
};

const findMissingValue = (values, expected) => {
  let from = 0;

  for (const [index, value] of expected.entries()) {
    const found = values.findIndex(
      (candidate, position) =>
        position >= from && isDeepStrictEqual(candidate, value)
    );
    if (found < 0) return index;
    from = found + 1;
  }

  return -1;
};

const operatorOf = (expected) =>
  isRecord(expected)
    ? Object.keys(MATCHERS).find((name) => Object.hasOwn(expected, name))
    : undefined;

const isLike = (actual, expected) => {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => isLike(actual[index], item))
    );
  if (operatorOf(expected)) return matchesValue(actual, expected);
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.entries(expected).every(([key, item]) => isLike(actual[key], item))
    );

  return isDeepStrictEqual(actual, expected);
};

const includesLike = (actual, items) =>
  Array.isArray(actual) &&
  items.every((item) => actual.some((candidate) => isLike(candidate, item)));

const pairsLike = (candidates, items) => {
  if (items.length === 0) return true;

  const [item, ...rest] = items;

  return candidates.some(
    (candidate, index) =>
      isLike(candidate, item) && pairsLike(candidates.toSpliced(index, 1), rest)
  );
};

const unorderedLike = (actual, items) =>
  Array.isArray(actual) &&
  actual.length === items.length &&
  pairsLike(actual, items);

const matchesPattern = (actual, pattern) =>
  typeof actual === 'string' && new RegExp(pattern).test(actual);

const holdsJson = (actual, expected) => {
  const parsed = typeof actual === 'string' ? parseJson(actual) : null;

  return parsed !== null && matchesValue(parsed.value, expected);
};

const MATCHERS = Object.freeze({
  $like: isLike,
  $includes: includesLike,
  $unordered: unorderedLike,
  $pattern: matchesPattern,
  $json: holdsJson,
});

const matchesValue = (actual, expected) => {
  const operator = operatorOf(expected);

  return operator
    ? MATCHERS[operator](actual, expected[operator])
    : isDeepStrictEqual(actual, expected);
};

export const matchesBody = (body, expected) => {
  if (expected === undefined) return true;
  if (Array.isArray(expected.anyOf))
    return expected.anyOf.some((option) => matchesBody(body, option));
  if (body === null || typeof body !== 'object') return false;

  return Object.entries(expected).every(([key, value]) =>
    matchesValue(body[key], value)
  );
};

export const matchesHeaders = (headers, expected = {}) =>
  Object.entries(expected).every(([name, pattern]) =>
    new RegExp(pattern).test(headers[name.toLowerCase()] ?? '')
  );

const checkLines = (check, stdout) => {
  const pattern = new RegExp(check.pattern);
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const matches = lines.map((line) => line.match(pattern));
  const unexpected = lines.find((_, index) => !matches[index]);

  if (unexpected !== undefined) return [`unexpected line: ${unexpected}`];
  if (check.count !== undefined && lines.length !== check.count)
    return [`${lines.length} lines, expected ${check.count}`];

  const capture = (group) => matches.map((match) => match[group]);
  const failures = [];

  if (check.distinct) {
    const values = capture(check.distinct.group);
    const once = check.distinct.values.every(
      (value) => values.filter((candidate) => candidate === value).length === 1
    );
    if (!once || values.length !== check.distinct.values.length)
      failures.push(
        `expected each of ${check.distinct.values.join(', ')} exactly once`
      );
  }

  if (check.sum) {
    const total = capture(check.sum.group)
      .map(Number)
      .reduce((sum, value) => sum + value, 0);
    if (!isClose(total, check.sum.value, check.sum.tolerance ?? 0))
      failures.push(`values add up to ${total}, expected ${check.sum.value}`);
  }

  if (check.order) {
    const values = capture(check.order.group).map(Number);
    const sorted = [...values].sort((left, right) =>
      check.order.direction === 'desc' ? right - left : left - right
    );
    if (!isDeepStrictEqual(values, sorted))
      failures.push(`values are not in ${check.order.direction} order`);
  }

  if (check.last) {
    const last = capture(check.last.group).at(-1);
    if (last !== check.last.value)
      failures.push(`last value is ${last}, expected ${check.last.value}`);
  }

  return failures;
};

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object[key] ?? null]));

const expandReplayValues = (values, exchanges) =>
  values.flatMap((value) => {
    if (value?.$replay !== undefined) {
      const { json } = exchanges[value.$replay];
      return [value.pick ? pick(json, value.pick) : json];
    }
    if (value?.$replayChunks !== undefined)
      return exchanges[value.$replayChunks].chunks.map((chunk) =>
        JSON.parse(chunk)
      );

    return [value];
  });

const findMissingJsonValue = (text, values, exchanges) =>
  findMissingValue(
    extractJsonValues(text),
    expandReplayValues(values, exchanges)
  );

export const checkResponse = (expected, actual, index, exchanges) => {
  const label = `response ${index + 1}`;
  if (!actual) return [`${label} missing`];

  const failures = [];

  if (expected.status !== undefined && actual.status !== expected.status)
    failures.push(
      `${label} status ${actual.status}, expected ${expected.status}`
    );

  if (
    expected.match !== undefined &&
    !matchesBody(parseJson(actual.text)?.value ?? null, expected.match)
  )
    failures.push(
      `${label} ${actual.text} does not match ${JSON.stringify(expected.match)}`
    );

  if (
    expected.values !== undefined &&
    findMissingJsonValue(actual.text, expected.values, exchanges) >= 0
  )
    failures.push(`${label} lacks an expected JSON value`);

  if (
    expected.pattern !== undefined &&
    !new RegExp(expected.pattern).test(actual.text)
  )
    failures.push(`${label} does not match /${expected.pattern}/`);

  if (
    expected.headers !== undefined &&
    !matchesHeaders(actual.headers ?? {}, expected.headers)
  )
    failures.push(
      `${label} headers ${JSON.stringify(actual.headers ?? {})} do not match ${JSON.stringify(expected.headers)}`
    );

  return failures;
};

export const describeFile = ({ path, name }) =>
  name === undefined ? path : `the file in ${path} named /${name}/`;

const checkFile = (check, written = [], exchanges) => {
  const label = describeFile(check);
  const [content] = written;

  if (written.length === 0) return [`${label} was not written during the run`];
  if (written.length > 1)
    return [`${label} was written ${written.length} times, expected once`];
  if (check.pattern !== undefined && !new RegExp(check.pattern).test(content))
    return [`${label} does not match /${check.pattern}/`];
  if (
    check.values !== undefined &&
    findMissingJsonValue(content, check.values, exchanges) >= 0
  )
    return [`${label} lacks an expected JSON value`];

  return [];
};

const checkRequests = (expected, captured) => {
  if (captured.length !== expected.length)
    return [
      `${captured.length} LLM requests (${captured.map(({ method, path }) => `${method} ${path}`).join(', ') || 'none'}), expected ${expected.length}`,
    ];

  return expected.flatMap((request, index) => {
    const actual = captured[index];

    if (
      actual.method !== request.method ||
      !matchesValue(actual.path, request.path)
    )
      return [
        `request ${index + 1} was ${actual.method} ${actual.path}, expected ${request.method} ${typeof request.path === 'string' ? request.path : JSON.stringify(request.path)}`,
      ];

    return ['query', 'body'].flatMap((part) =>
      matchesBody(actual[part], request[part])
        ? []
        : [
            `request ${index + 1} ${part} ${JSON.stringify(actual[part])} does not match ${JSON.stringify(request[part])}`,
          ]
    );
  });
};

const CHECKS = Object.freeze({
  exit: (check, run) => {
    if (check.failure)
      return Number.isInteger(run.code) && run.code !== 0
        ? []
        : [`exit code ${run.code}, expected a failure`];

    return run.code === check.code
      ? []
      : [`exit code ${run.code}, expected ${check.code}`];
  },
  numbers: (check, run) => {
    const missing = findMissingGroup(
      extractNumbers(run.stdout),
      check.groups,
      check.tolerance
    );

    return missing < 0 ? [] : [`number group ${missing + 1} not found`];
  },
  lines: (check, run) => checkLines(check, run.stdout),
  json: (check, run, exchanges) => {
    const missing = findMissingJsonValue(run.stdout, check.values, exchanges);

    return missing < 0 ? [] : [`JSON value ${missing + 1} not found in order`];
  },
  requests: (check, run) => checkRequests(check.requests, run.requests),
  responses: (check, run, exchanges) =>
    check.responses.flatMap((expected, index) =>
      checkResponse(
        fillReferences(expected, run.responses ?? []),
        run.responses?.[index],
        index,
        exchanges
      )
    ),
  output: (check, run) => {
    const stream = check.stream ?? 'stdout';
    const text = (run[stream] ?? '').replaceAll('\r\n', '\n');

    return new RegExp(check.pattern).test(text)
      ? []
      : [`${stream} does not match /${check.pattern}/`];
  },
  file: (check, run, exchanges) =>
    checkFile(check, run.files?.[describeFile(check)], exchanges),
  page: (check, run) => {
    const missing = findMissingValue(run.page ?? [], check.values);

    return missing < 0
      ? []
      : [
          `page value ${missing + 1} ${JSON.stringify(check.values[missing])} not read in order`,
        ];
  },
});

export const evaluate = (checks, run, exchanges = []) =>
  checks.flatMap((check) =>
    CHECKS[check.type]
      ? CHECKS[check.type](check, run, exchanges)
      : [`unknown check type: ${check.type}`]
  );
