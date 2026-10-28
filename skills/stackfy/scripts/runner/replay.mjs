import { createServer } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { setTimeout as sleep } from 'node:timers/promises';
import { matchesBody, matchesHeaders } from './checks.mjs';
import { parseLenientJson } from './json.mjs';
import { fillAddresses } from './placeholders.mjs';
import { acceptSocket } from './websocket.mjs';

const pickExchange = (exchanges, used, { method, path, headers, body }) =>
  exchanges.findIndex(
    (exchange, index) =>
      !used.has(index) &&
      exchange.method === method &&
      exchange.path === path &&
      matchesHeaders(headers, exchange.matchHeaders) &&
      matchesBody(body, exchange.match)
  );

const decodeBody = (text, contentType = '') => {
  if (!text) return null;
  if (contentType.startsWith('application/x-www-form-urlencoded'))
    return Object.fromEntries(new URLSearchParams(text));

  return parseLenientJson(text)?.value ?? text;
};

const replayAddress = (host, port) =>
  `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;

const bodyOf = (exchange, address) => {
  if (exchange.text !== undefined) return fillAddresses(exchange.text, address);
  if (exchange.base64 !== undefined)
    return Buffer.from(exchange.base64, 'base64');
  if (exchange.json !== undefined)
    return fillAddresses(JSON.stringify(exchange.json), address);

  return '';
};

export const startReplay = (exchanges, host, port = 0) =>
  new Promise((resolveReplay, reject) => {
    const used = new Set();
    const requests = [];
    const sockets = [];

    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://replay');
      const path = url.pathname;
      const query = Object.fromEntries(url.searchParams);
      const text = await readText(request);
      const body = decodeBody(text, request.headers['content-type']);
      const index = pickExchange(exchanges, used, {
        method: request.method,
        path,
        headers: request.headers,
        body,
      });
      const exchange = exchanges[index];

      if (!exchange?.incidental)
        requests.push({ method: request.method, path, query, body });

      if (!exchange) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: `no recorded exchange for ${request.method} ${path}`,
          })
        );
        return;
      }

      const address = replayAddress(host, server.address().port);

      if (!exchange.incidental) used.add(index);
      if (exchange.delay) await sleep(exchange.delay);

      response.writeHead(
        exchange.status ?? 200,
        exchange.headers ?? { 'content-type': 'application/json' }
      );

      if (exchange.chunks) {
        for (const chunk of exchange.chunks) response.write(chunk);
        response.end();
        return;
      }

      response.end(bodyOf(exchange, address));
    });

    server.on('upgrade', (request, socket) => {
      const opened = acceptSocket(request, socket);
      if (opened) sockets.push(opened);
    });
    server.on('error', reject);
    server.listen(port, host, () =>
      resolveReplay({
        port: server.address().port,
        requests,
        sockets,
        close: () =>
          new Promise((done) => {
            for (const opened of sockets) opened.close();
            server.closeAllConnections();
            server.close(done);
          }),
      })
    );
  });

export const endpointEnv = (host, port) => {
  const url = replayAddress(host, port);

  return {
    STACKFY_REPLAY_URL: url,
    STACKFY_REPLAY_PORT: String(port),
    OLLAMA_HOST: url,
    OPENAI_BASE_URL: `${url}/v1`,
  };
};
