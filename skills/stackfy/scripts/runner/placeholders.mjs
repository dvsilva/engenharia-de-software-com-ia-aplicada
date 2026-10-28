import { sep } from 'node:path';
import { mapStrings, parseJson } from './json.mjs';

const RESPONSE_REFERENCE = /\{responses\.(\d+)\.([^{}]+)\}/g;

const WHOLE_REFERENCE = /^\{responses\.(\d+)\.([^{}]+)\}$/;

const HEADER_REFERENCE = /\{headers\.(\d+)\.([^{}]+)\}/g;

const referencedValue = (responses, index, path) =>
  path
    .split('.')
    .reduce(
      (value, key) => value?.[key],
      parseJson(responses[index]?.text ?? '')?.value
    );

const referencedHeader = (responses, index, name) =>
  responses[index]?.headers?.[name.toLowerCase()] ?? '';

const fillReferencesIn = (text, responses) => {
  const whole = text.match(WHOLE_REFERENCE);
  if (whole) return referencedValue(responses, Number(whole[1]), whole[2]);

  return text
    .replace(RESPONSE_REFERENCE, (_, index, path) =>
      String(referencedValue(responses, Number(index), path) ?? '')
    )
    .replace(HEADER_REFERENCE, (_, index, name) =>
      referencedHeader(responses, Number(index), name)
    );
};

export const fillReferences = (value, responses) =>
  mapStrings(value, (text) => fillReferencesIn(text, responses));

export const fillWorkingDirectory = (value, cwd) => {
  const folder = cwd.split(sep).join('/');

  return mapStrings(value, (text) => text.replaceAll('{cwd}', folder));
};

export const fillAddresses = (value, address) => {
  const socketAddress = address.replace(/^http/, 'ws');

  return mapStrings(value, (text) =>
    text
      .replaceAll('{replaySocket}', socketAddress)
      .replaceAll('{replay}', address)
  );
};
