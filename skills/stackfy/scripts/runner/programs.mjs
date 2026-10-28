import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { drivePage } from './browser.mjs';
import { isRecord, parseJson } from './json.mjs';
import { fillReferences } from './placeholders.mjs';
import {
  READY_TIMEOUT,
  STOP_GRACE,
  runCommand,
  startCommand,
  stopCommand,
  waitUntil,
  withTimeout,
} from './processes.mjs';
import { isReady, sendRequests } from './requests.mjs';

const PAGE_TIMEOUT = 30000;

const ANSWER_POLL_INTERVAL = 20;

const readyTimeout = (timeout, declared) =>
  Math.min(timeout, declared ?? READY_TIMEOUT);

const notReadyReason = (serve, listening) =>
  listening
    ? `standard output never matched /${serve.after}/`
    : `nothing answered on port ${serve.port}`;

const serveCommand = async (command, serve, { cwd, env, timeout, browser }) => {
  const started = startCommand(command, {
    cwd,
    env: { ...env, PORT: String(serve.port) },
  });
  const wait = readyTimeout(timeout, serve.timeout);
  const listening = await waitUntil(
    () => isReady(serve.port, serve.ready),
    wait,
    started.hasExited
  );
  const ready =
    listening &&
    (serve.after === undefined ||
      (await waitUntil(
        () => new RegExp(serve.after).test(started.output.stdout),
        wait,
        started.hasExited
      )));
  const responses = ready
    ? await sendRequests(serve.port, serve.requests ?? [], serve.settle)
    : [];
  const page =
    ready && serve.page
      ? await drivePage(serve.port, serve.page, {
          browser,
          timeout: Math.min(timeout, serve.page.timeout ?? PAGE_TIMEOUT),
        })
      : {};
  const code = started.hasExited()
    ? await started.closed
    : await stopCommand(started);

  return {
    ...started.output,
    code,
    timedOut: false,
    responses,
    page: page.reads ?? [],
    pageErrors: page.errors ?? [],
    ...(page.failure ? { pageFailure: page.failure } : {}),
    ...(ready ? {} : { notReady: notReadyReason(serve, listening) }),
  };
};

const answerLine = (stdout, id) =>
  stdout.split(/\r?\n/).find((line) => {
    const message = parseJson(line)?.value;

    return (
      isRecord(message) &&
      message.method === undefined &&
      isDeepStrictEqual(message.id, id)
    );
  });

const converse = async (started, messages, timeout) => {
  const responses = [];

  for (const [index, message] of messages.entries()) {
    const sent = fillReferences(message, responses);

    started.child.stdin.write(`${JSON.stringify(sent)}\n`);
    if (sent.id === undefined) continue;

    await waitUntil(
      () => answerLine(started.output.stdout, sent.id) !== undefined,
      timeout,
      started.hasExited,
      ANSWER_POLL_INTERVAL
    );

    const text = answerLine(started.output.stdout, sent.id);
    if (text === undefined)
      return {
        responses,
        failure: `message ${index + 1} (${sent.method}) got no answer within ${timeout} ms`,
      };

    responses.push({ status: null, text });
  }

  return { responses };
};

const converseCommand = async (command, mcp, { cwd, env, timeout }) => {
  const started = startCommand(command, { cwd, env, keepInput: true });
  const { responses, failure } = await converse(
    started,
    mcp.messages ?? [],
    readyTimeout(timeout, mcp.timeout)
  );

  started.child.stdin.end();

  const code =
    (await withTimeout(started.closed, STOP_GRACE)) ??
    (await stopCommand(started));

  return {
    ...started.output,
    code,
    timedOut: false,
    responses,
    ...(failure ? { notAnswered: failure } : {}),
  };
};

const socketCommand = async (
  command,
  socket,
  { cwd, env, timeout, replay }
) => {
  const started = startCommand(command, { cwd, env });
  const wait = readyTimeout(timeout, socket.timeout);
  const connected = await waitUntil(
    () => replay.sockets.length > 0,
    wait,
    started.hasExited,
    ANSWER_POLL_INTERVAL
  );

  for (const message of connected ? (socket.messages ?? []) : []) {
    replay.sockets
      .at(-1)
      .send(typeof message === 'string' ? message : JSON.stringify(message));
    await sleep(socket.settle ?? 0);
  }

  const code = started.hasExited()
    ? await started.closed
    : await stopCommand(started);

  return {
    ...started.output,
    code,
    timedOut: false,
    responses: replay.sockets
      .flatMap(({ received }) => received)
      .map((text) => ({ status: null, text })),
    ...(connected
      ? {}
      : { notReady: `nothing connected to the socket within ${wait} ms` }),
  };
};

const promptsShown = (stdout, prompt) => stdout.split(prompt).length - 1;

const typeAtPrompts = async (started, { prompt, lines }, wait) => {
  for (const [index, line] of lines.entries()) {
    const prompted = await waitUntil(
      () => promptsShown(started.output.stdout, prompt) > index,
      wait,
      started.hasExited,
      ANSWER_POLL_INTERVAL
    );

    if (!prompted)
      return `standard output never showed the prompt for line ${index + 1} within ${wait} ms`;

    started.child.stdin.write(`${line}\n`);
  }
};

const promptCommand = async (command, stdin, { cwd, env, timeout }) => {
  const started = startCommand(command, { cwd, env, keepInput: true });
  const wait = readyTimeout(timeout, stdin.timeout);
  const failure = await typeAtPrompts(started, stdin, wait);

  started.child.stdin.end();

  const code =
    (await withTimeout(started.closed, wait)) ?? (await stopCommand(started));

  return {
    ...started.output,
    code,
    timedOut: false,
    ...(failure ? { notAnswered: failure } : {}),
  };
};

export const driveCommand = (command, definition, options) => {
  if (definition.serve) return serveCommand(command, definition.serve, options);
  if (definition.mcp) return converseCommand(command, definition.mcp, options);
  if (definition.socket)
    return socketCommand(command, definition.socket, options);
  if (isRecord(definition.stdin))
    return promptCommand(command, definition.stdin, options);

  return runCommand(command, { ...options, stdin: definition.stdin });
};
