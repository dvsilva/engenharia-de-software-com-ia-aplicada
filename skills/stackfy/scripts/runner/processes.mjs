import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

export const DEFAULT_TIMEOUT = 600000;

export const READY_TIMEOUT = 120000;

export const STOP_GRACE = 5000;

const POLL_INTERVAL = 250;

export const withTimeout = async (promise, timeout) => {
  const controller = new AbortController();

  try {
    return await Promise.race([
      promise,
      sleep(timeout, null, { signal: controller.signal }),
    ]);
  } finally {
    controller.abort();
  }
};

const stopGroup = (child, signal) => {
  try {
    process.kill(-child.pid, signal);
  } catch {}
};

export const startCommand = (
  command,
  { cwd, env, stdin, keepInput = false }
) => {
  const child = spawn(command, { cwd, env, shell: true, detached: true });
  const output = { stdout: '', stderr: '' };
  const closed = new Promise((resolveClose) => child.on('close', resolveClose));
  let exited = false;

  closed.then(() => {
    exited = true;
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk;
  });
  child.stdin.on('error', () => {});
  if (!keepInput) child.stdin.end(stdin ?? '');

  return { child, output, closed, hasExited: () => exited };
};

export const stopCommand = async ({ child, closed }) => {
  stopGroup(child, 'SIGTERM');

  const code = await withTimeout(closed, STOP_GRACE);
  if (code !== null) return code;

  stopGroup(child, 'SIGKILL');
  return closed;
};

export const runCommand = async (command, { cwd, env, stdin, timeout }) => {
  const started = startCommand(command, { cwd, env, stdin });
  const code = await withTimeout(started.closed, timeout);

  if (code !== null) return { ...started.output, code, timedOut: false };

  await stopCommand(started);
  return { ...started.output, code: null, timedOut: true };
};

export const runProcess = (command, commandArguments, { cwd, env }) =>
  new Promise((resolveRun) => {
    const child = spawn(command, commandArguments, { cwd, env });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (error) =>
      resolveRun({ code: null, output: error.message })
    );
    child.on('close', (code) => resolveRun({ code, output }));
  });

export const isListening = (port, host = '127.0.0.1') =>
  new Promise((resolveProbe) => {
    const socket = connect({ port, host });

    socket.once('connect', () => {
      socket.destroy();
      resolveProbe(true);
    });
    socket.once('error', () => resolveProbe(false));
  });

export const waitUntil = async (
  probe,
  timeout,
  stopWaiting = () => false,
  interval = POLL_INTERVAL
) => {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await probe()) return true;
    if (stopWaiting()) return false;
    await sleep(interval);
  }

  return false;
};
