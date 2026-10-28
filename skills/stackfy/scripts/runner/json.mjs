const CLOSERS = new Map([
  ['{', '}'],
  ['[', ']'],
]);

const QUOTED_STRING = /"(?:[^"\\]|\\.)*"|'((?:[^'\\]|\\.)*)'/g;

const DOUBLE_QUOTED_ESCAPES = Object.freeze({ '"': '\\"', "\\'": "'" });

export const parseJson = (text) => {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
};

export const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isFilledText = (value) =>
  typeof value === 'string' && value.trim() !== '';

export const mapStrings = (value, transform) => {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value))
    return value.map((item) => mapStrings(item, transform));
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapStrings(item, transform),
      ])
    );

  return value;
};

const closingIndex = (text, start) => {
  const expected = [];
  let inString = false;

  for (let index = start; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (character === '\\') index++;
      inString = character !== '"';
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (CLOSERS.has(character)) {
      expected.push(CLOSERS.get(character));
      continue;
    }

    if (character !== '}' && character !== ']') continue;
    if (expected.pop() !== character) return -1;
    if (expected.length === 0) return index;
  }

  return -1;
};

export const extractJsonValues = (text) => {
  const values = [];

  for (let index = 0; index < text.length; index++) {
    if (!CLOSERS.has(text[index])) continue;

    const end = closingIndex(text, index);
    if (end < 0) continue;

    const parsed = parseJson(text.slice(index, end + 1));
    if (!parsed) continue;

    values.push(parsed.value);
    index = end;
  }

  return values;
};

const doubleQuote = (inner) =>
  `"${inner.replace(/\\.|"/g, (piece) => DOUBLE_QUOTED_ESCAPES[piece] ?? piece)}"`;

const withDoubleQuotes = (text) =>
  text.replace(QUOTED_STRING, (string, singleQuoted) =>
    singleQuoted === undefined ? string : doubleQuote(singleQuoted)
  );

export const parseLenientJson = (text) =>
  parseJson(text) ?? parseJson(withDoubleQuotes(text));
