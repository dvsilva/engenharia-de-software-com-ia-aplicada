import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { STOP_GRACE, waitUntil, withTimeout } from './processes.mjs';

const BROWSERS = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
]);

const PAGE_POLL_INTERVAL = 50;

const KEYS = Object.freeze({
  Enter: { windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { windowsVirtualKeyCode: 27 },
  Tab: { windowsVirtualKeyCode: 9 },
});

const isExecutable = (path) =>
  access(path, constants.X_OK).then(
    () => true,
    () => false
  );

const candidatePaths = (name) =>
  isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .map((folder) => join(folder, name));

export const findBrowser = async (preferred) => {
  const paths = (preferred ? [preferred] : BROWSERS).flatMap(candidatePaths);

  for (const path of paths) if (await isExecutable(path)) return path;

  return null;
};

const openDevTools = (child) => {
  const pending = new Map();
  const listeners = [];
  let nextId = 1;
  let buffer = '';

  const dispatch = (message) => {
    const waiting = pending.get(message.id);

    if (!waiting) {
      for (const listener of listeners) listener(message);
      return;
    }

    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  };

  child.stdio[3].on('error', () => {});
  child.stdio[4].setEncoding('utf8');
  child.stdio[4].on('data', (chunk) => {
    const messages = (buffer + chunk).split('\0');

    buffer = messages.pop();
    for (const text of messages) dispatch(JSON.parse(text));
  });
  child.on('close', () => {
    for (const { reject } of pending.values())
      reject(new Error('the browser closed'));
    pending.clear();
  });

  return {
    send: (method, parameters = {}, sessionId) =>
      new Promise((resolveSend, reject) => {
        const id = nextId++;

        pending.set(id, { resolve: resolveSend, reject });
        child.stdio[3].write(
          `${JSON.stringify({ id, method, params: parameters, sessionId })}\0`
        );
      }),
    on: (listener) => listeners.push(listener),
  };
};

const launchBrowser = async (executable) => {
  const profile = await mkdtemp(join(tmpdir(), 'stackfy-browser-'));
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
  );
  const closed = new Promise((resolveClose) => {
    child.on('close', () => resolveClose(true));
    child.on('error', () => resolveClose(true));
  });
  const devTools = openDevTools(child);

  const close = async () => {
    await withTimeout(
      devTools.send('Browser.close').catch(() => {}),
      STOP_GRACE
    );
    if ((await withTimeout(closed, STOP_GRACE)) === null) child.kill('SIGKILL');

    await closed;
    await rm(profile, { recursive: true, force: true });
  };

  return { devTools, close };
};

const nextEvent = (devTools, method, sessionId) =>
  new Promise((resolveEvent) =>
    devTools.on((message) => {
      if (message.method === method && message.sessionId === sessionId)
        resolveEvent(message.params);
    })
  );

const describeException = ({ exception, text }) =>
  exception?.description ?? text;

const evaluateIn = async (devTools, sessionId, expression) => {
  const { result, exceptionDetails } = await devTools.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  );

  if (exceptionDetails) throw new Error(describeException(exceptionDetails));

  return result.value;
};

const elementOf = (selector) =>
  `document.querySelector(${JSON.stringify(selector)})`;

const settingValue = (selector, value) => ({
  until: `${elementOf(selector)} !== null`,
  act: `(() => {
    const element = ${elementOf(selector)};
    const control = [HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement]
      .find((type) => element instanceof type);
    Object.getOwnPropertyDescriptor(control.prototype, 'value')
      .set.call(element, ${JSON.stringify(value)});
    for (const type of ['input', 'change'])
      element.dispatchEvent(new Event(type, { bubbles: true }));
  })()`,
});

const choosingFile = (selector, file) => {
  if (typeof file?.name !== 'string' || typeof file?.base64 !== 'string')
    return { invalid: 'upload takes a file with a name and base64 content' };

  return {
    until: `${elementOf(selector)} !== null`,
    act: `(() => {
      const element = ${elementOf(selector)};
      const bytes = Uint8Array.from(atob(${JSON.stringify(file.base64)}), (character) => character.charCodeAt(0));
      const chosen = new DataTransfer();
      chosen.items.add(new File([bytes], ${JSON.stringify(file.name)}, { type: ${JSON.stringify(file.type ?? '')} }));
      element.files = chosen.files;
      for (const type of ['input', 'change'])
        element.dispatchEvent(new Event(type, { bubbles: true }));
    })()`,
  };
};

const pressing = (key) => {
  if (!KEYS[key])
    return { invalid: `press is one of ${Object.keys(KEYS).join(', ')}` };

  const { windowsVirtualKeyCode, text } = KEYS[key];
  const identity = { key, code: key, windowsVirtualKeyCode };

  return {
    keys: [
      { type: text ? 'keyDown' : 'rawKeyDown', ...identity, text },
      { type: 'keyUp', ...identity },
    ],
  };
};

const PAGE_STEPS = Object.freeze({
  wait: (step) => ({ until: step.wait }),
  click: (step) => ({
    until: `${elementOf(step.click)} !== null`,
    act: `${elementOf(step.click)}.click()`,
  }),
  select: (step) => settingValue(step.select, step.value),
  fill: (step) => settingValue(step.fill, step.value),
  upload: (step) => choosingFile(step.upload, step.file),
  press: (step) => pressing(step.press),
  read: (step) => ({ read: step.read }),
});

const runSteps = async (devTools, sessionId, steps, timeout) => {
  const reads = [];
  const holds = (expression) =>
    evaluateIn(devTools, sessionId, expression).then(Boolean, () => false);

  for (const [index, step] of steps.entries()) {
    const label = `page step ${index + 1}`;
    const kind = Object.keys(PAGE_STEPS).find(
      (name) => step[name] !== undefined
    );

    if (!kind)
      return {
        reads,
        failure: `${label} is not one of ${Object.keys(PAGE_STEPS).join(', ')}`,
      };

    const { until, act, keys, read, invalid } = PAGE_STEPS[kind](step);

    if (invalid) return { reads, failure: `${label} is invalid: ${invalid}` };

    const reached =
      until === undefined ||
      (await waitUntil(
        () => holds(until),
        timeout,
        () => false,
        PAGE_POLL_INTERVAL
      ));

    if (!reached)
      return {
        reads,
        failure: `${label} waited ${timeout} ms for ${until}`,
      };

    try {
      if (act !== undefined) await evaluateIn(devTools, sessionId, act);
      for (const event of keys ?? [])
        await devTools.send('Input.dispatchKeyEvent', event, sessionId);
      if (read !== undefined)
        reads.push(await evaluateIn(devTools, sessionId, read));
    } catch (error) {
      return { reads, failure: `${label} failed: ${error.message}` };
    }
  }

  return { reads };
};

const openPage = async (devTools, url, page, timeout) => {
  const { init, timezone, media } = page;
  const { targetId } = await devTools.send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await devTools.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const errors = [];

  devTools.on((message) => {
    if (
      message.method === 'Runtime.exceptionThrown' &&
      message.sessionId === sessionId
    )
      errors.push(describeException(message.params.exceptionDetails));
  });
  await devTools.send('Page.enable', {}, sessionId);
  await devTools.send('Runtime.enable', {}, sessionId);
  if (init !== undefined)
    await devTools.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: init },
      sessionId
    );
  if (timezone !== undefined)
    await devTools.send(
      'Emulation.setTimezoneOverride',
      { timezoneId: timezone },
      sessionId
    );
  if (media !== undefined)
    await devTools.send(
      'Emulation.setEmulatedMedia',
      {
        features: Object.entries(media).map(([name, value]) => ({
          name,
          value,
        })),
      },
      sessionId
    );

  const loaded = nextEvent(devTools, 'Page.loadEventFired', sessionId);

  await devTools.send('Page.navigate', { url }, sessionId);

  return {
    sessionId,
    errors,
    loaded: (await withTimeout(loaded, timeout)) !== null,
  };
};

export const drivePage = async (port, page, { browser, timeout }) => {
  const executable = await findBrowser(browser);

  if (!executable)
    return {
      failure: browser
        ? `browser not found: ${browser}`
        : 'no Google Chrome or Chromium found, pass one with --browser',
    };

  const url = `http://127.0.0.1:${port}${page.path ?? '/'}`;
  const launched = await launchBrowser(executable);

  try {
    const opened = await openPage(launched.devTools, url, page, timeout);

    if (!opened.loaded)
      return {
        failure: `${url} did not load within ${timeout} ms`,
        errors: opened.errors,
      };

    const driven = await runSteps(
      launched.devTools,
      opened.sessionId,
      page.steps ?? [],
      timeout
    );

    return { ...driven, errors: opened.errors };
  } catch (error) {
    return { failure: `the browser failed: ${error.message}` };
  } finally {
    await launched.close();
  }
};
