#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { fail, readFlags, readInteger, start } from './cli.mjs';
import { parseJson } from './runner/json.mjs';
import { DEFAULT_TIMEOUT, runCommand } from './runner/processes.mjs';
import { endpointEnv } from './runner/replay.mjs';

const SECRET = /auth|key|token|secret|cookie|session|signature|password/i;

const HOP_BY_HOP = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const FLAGS = Object.freeze({
  upstream: { type: 'string' },
  out: { type: 'string' },
  cmd: { type: 'string' },
  cwd: { type: 'string' },
  host: { type: 'string', default: '127.0.0.1' },
  port: { type: 'string' },
  model: { type: 'string' },
  timeout: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
});

const HELP_TEXT = `Usage:
  node record.mjs --upstream <url> --out <file.json> [--cmd "<command>"] [--cwd <dir>] [--host <host>] [--port <n>] [--model <name>] [--timeout <ms>]

Records every exchange between a program and a real LLM server, streamed chunks
included, in the shape the cases replay. Authentication headers and secret query
values never reach the record.

Flags:
  --upstream <url>  The real server, such as http://localhost:11434.
  --out <file>      Where the recording is written.
  --cmd <command>   Command to record, run through the shell. Without it, the
                    recorder runs until interrupted.
  --cwd <dir>       Directory to run the command in. Defaults to process.cwd().
  --host <host>     Interface to listen on. Defaults to 127.0.0.1.
                    Use 0.0.0.0 when the program runs inside a container.
  --port <n>        Port to listen on. Defaults to any free port.
  --model <name>    Stand-in model forwarded upstream in place of the one the
                    program asks for, or of the list of models it offers a
                    gateway such as OpenRouter. Pairs such as
                    gemma4:e2b=gemma4:12b-mlx,gemma4:latest=gemma4:12b-mlx
                    replace only the models they name, so a model the server
                    has, such as an embedding model, stays itself. The record
                    keeps the program's request.
  --timeout <ms>    Time limit for the command. Defaults to ${DEFAULT_TIMEOUT}.
  -h, --help        Show this help.

The command receives OLLAMA_HOST, OPENAI_BASE_URL, STACKFY_REPLAY_URL, and
STACKFY_REPLAY_PORT pointing to the recorder, the same variables the runner
sets for the replay.

Exit codes:
  0  recording written
  2  upstream invalid or recording not written
  64 invalid CLI arguments
`;

const withoutHeaders = (headers, isExcluded) =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) => !isExcluded(name.toLowerCase()))
  );

const isHopByHop = (name) => HOP_BY_HOP.has(name);

const isSecretOrHopByHop = (name) => SECRET.test(name) || isHopByHop(name);

const isRelayedAway = (name) => isHopByHop(name) || name === 'set-cookie';

const redactQuery = (search) => {
  const query = new URLSearchParams(search);

  for (const name of [...query.keys()])
    if (SECRET.test(name)) query.set(name, 'REDACTED');

  return query.toString();
};

const decodeRequestBody = (body) => {
  if (body.length === 0) return null;

  const text = body.toString('utf8');
  return parseJson(text)?.value ?? text;
};

const asksForModel = (body) =>
  typeof body?.model === 'string' || Array.isArray(body?.models);

const standInFor = (model, requested) => {
  if (!model.includes('=')) return model;

  const pairs = new Map(model.split(',').map((pair) => pair.split('=')));
  return pairs.get(requested);
};

const forwardedBody = (body, model) => {
  if (!model) return body;

  const parsed = parseJson(body.toString('utf8'));
  if (!parsed || !asksForModel(parsed.value)) return body;

  const standIn = standInFor(model, parsed.value.model);
  if (!standIn) return body;

  return Buffer.from(JSON.stringify({ ...parsed.value, model: standIn }));
};

const splitStream = (text, separator) =>
  text
    .split(separator)
    .filter((part) => part.trim() !== '')
    .map((part) => `${part}${separator}`);

const describeResponse = (contentType, body) => {
  const type = contentType ?? '';
  const text = body.toString('utf8');

  if (type.includes('ndjson')) return { chunks: splitStream(text, '\n') };
  if (type.includes('event-stream'))
    return { chunks: splitStream(text, '\n\n') };
  if (type.includes('json')) {
    const parsed = parseJson(text);
    return parsed ? { json: parsed.value } : { text };
  }
  if (type.startsWith('text/') || body.length === 0) return { text };

  return { base64: body.toString('base64') };
};

const sendUpstream = (upstream, { method, path, search, headers, body }) =>
  new Promise((resolveResponse, reject) => {
    const target = new URL(
      `${upstream.pathname.replace(/\/$/, '')}${path}${search}`,
      upstream
    );
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const outgoing = send(target, {
      method,
      headers: {
        ...withoutHeaders(headers, isHopByHop),
        ...(body.length > 0 ? { 'content-length': body.length } : {}),
      },
    });

    outgoing.on('response', resolveResponse);
    outgoing.on('error', reject);
    outgoing.end(body);
  });

const relay = async (upstreamResponse, response) => {
  const chunks = [];

  response.writeHead(
    upstreamResponse.statusCode,
    withoutHeaders(upstreamResponse.headers, isRelayedAway)
  );

  for await (const chunk of upstreamResponse) {
    chunks.push(chunk);
    response.write(chunk);
  }

  response.end();
  return Buffer.concat(chunks);
};

export const startRecorder = ({ upstream, host, port = 0, model }) =>
  new Promise((resolveRecorder, reject) => {
    const target = new URL(upstream);
    const exchanges = [];

    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://recorder');
      const body = await buffer(request);
      const query = redactQuery(url.search);
      const exchange = {
        method: request.method,
        path: url.pathname,
        ...(query ? { query } : {}),
        request: {
          headers: withoutHeaders(request.headers, isSecretOrHopByHop),
          body: decodeRequestBody(body),
        },
      };

      exchanges.push(exchange);

      try {
        const upstreamResponse = await sendUpstream(target, {
          method: request.method,
          path: url.pathname,
          search: url.search,
          headers: request.headers,
          body: forwardedBody(body, model),
        });
        const received = await relay(upstreamResponse, response);
        const contentType = upstreamResponse.headers['content-type'];

        Object.assign(exchange, {
          status: upstreamResponse.statusCode,
          ...(contentType ? { headers: { 'content-type': contentType } } : {}),
          ...describeResponse(contentType, received),
        });
      } catch (error) {
        Object.assign(exchange, { error: error.message });
        if (!response.headersSent) response.writeHead(502);
        response.end();
      }
    });

    server.on('error', reject);
    server.listen(port, host, () =>
      resolveRecorder({
        port: server.address().port,
        exchanges,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      })
    );
  });

const recordUntilInterrupted = (address) =>
  new Promise((resolveSignal) => {
    process.stdout.write(`recording at ${address}\n`);
    process.once('SIGINT', () => resolveSignal(null));
    process.once('SIGTERM', () => resolveSignal(null));
  });

const main = async () => {
  const flags = readFlags(FLAGS);

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (!flags.upstream || !flags.out)
    fail('--upstream and --out are required.', 64);

  const port = readInteger(flags, 'port', 0);
  const timeout = readInteger(flags, 'timeout', 0) ?? DEFAULT_TIMEOUT;

  if (!URL.canParse(flags.upstream))
    fail(`upstream is not a URL: ${flags.upstream}`);

  const recorder = await startRecorder({
    upstream: flags.upstream,
    host: flags.host,
    port,
    model: flags.model,
  });
  const env = endpointEnv(flags.host, recorder.port);
  const run = flags.cmd
    ? await runCommand(flags.cmd, {
        cwd: resolve(flags.cwd ?? process.cwd()),
        env: { ...process.env, ...env },
        timeout,
      })
    : await recordUntilInterrupted(env.STACKFY_REPLAY_URL);

  await recorder.close();
  await writeFile(
    resolve(flags.out),
    JSON.stringify(
      {
        upstream: flags.upstream,
        ...(flags.model ? { model: flags.model } : {}),
        exchanges: recorder.exchanges,
        ...(run ? { run } : {}),
      },
      null,
      2
    ) + '\n'
  ).catch((error) => fail(`recording not written: ${error.message}`));

  process.stdout.write(
    `recorded ${recorder.exchanges.length} exchanges to ${resolve(flags.out)}${run ? ` (exit code ${run.code})` : ''}\n`
  );
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  start(main);
