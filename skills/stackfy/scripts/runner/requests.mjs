import { setTimeout as sleep } from 'node:timers/promises';
import { checkResponse } from './checks.mjs';
import { fillReferences } from './placeholders.mjs';
import { READY_TIMEOUT, isListening } from './processes.mjs';

const UNTIL_INTERVAL = 1000;

export const isReady = async (port, path) => {
  if (!path) return isListening(port);

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return response.status < 500;
  } catch {
    return false;
  }
};

const formOf = (fields) => {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      form.append(name, value);
      continue;
    }

    const bytes = Buffer.from(value.base64, 'base64');

    form.append(
      name,
      new Blob([bytes], { type: value.type ?? '' }),
      value.name
    );
  }

  return form;
};

const requestBody = ({ json, form, body }) => {
  if (json !== undefined) return JSON.stringify(json);
  if (form !== undefined) return formOf(form);

  return body;
};

const sendRequest = async (
  port,
  { method = 'GET', path, headers, ...sent }
) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(sent.json !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...headers,
    },
    body: requestBody(sent),
  });

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    text: await response.text(),
  };
};

const sendOnce = (port, request) =>
  sendRequest(port, request).catch((error) => ({
    status: null,
    text: `request failed: ${error.message}`,
  }));

const sendUntil = async (port, request, deadline) => {
  const response = await sendOnce(port, request);
  const { until } = request;

  if (until === undefined || Date.now() >= deadline) return response;
  if (checkResponse(until, response, 0, []).length === 0) return response;

  await sleep(UNTIL_INTERVAL);
  return sendUntil(port, request, deadline);
};

const sendRepeated = async (port, request, deadline) => {
  const response = await sendUntil(port, request, deadline);
  const { repeat = 1 } = request;

  if (repeat <= 1) return response;
  return sendRepeated(port, { ...request, repeat: repeat - 1 }, deadline);
};

export const sendRequests = async (port, requests, settle = 0) => {
  const responses = [];

  for (const request of requests) {
    const filled = fillReferences(request, responses);
    const deadline = Date.now() + (filled.until?.timeout ?? READY_TIMEOUT);

    responses.push(await sendRepeated(filled.port ?? port, filled, deadline));
    await sleep(settle);
  }

  return responses;
};
