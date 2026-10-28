import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { findBrowser } from '../../../stackfy/scripts/runner/browser.mjs';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';
import { evaluate } from '../../../stackfy/scripts/runner/checks.mjs';

const PORT = 47480;

const describeWithBrowser = (await findBrowser()) ? describe : describe.skip;

const choosing = {
  name: 'adds the chosen user to the list',
  serve: {
    port: PORT,
    page: {
      steps: [
        { select: '#user', value: '2' },
        { click: '#add' },
        { wait: "document.querySelectorAll('#chosen li').length === 1" },
        {
          read: "[...document.querySelectorAll('#chosen li')].map((item) => item.innerText)",
        },
      ],
    },
  },
  expect: [{ type: 'page', values: [['Bruno']] }],
};

const page = (shown) => `<!doctype html>
<select id="user">
  <option value="">--</option>
  <option value="1">Ana</option>
  <option value="2">Bruno</option>
</select>
<ul id="chosen"></ul>
<script>
  const select = document.querySelector('#user');
  let chosen = '';

  select.addEventListener('change', () => {
    chosen = select.selectedOptions[0].textContent;
  });

  setTimeout(() => {
    const button = document.createElement('button');

    button.id = 'add';
    button.textContent = 'Add';
    button.addEventListener('click', () => {
      const item = document.createElement('li');

      item.textContent = ${shown};
      document.querySelector('#chosen').append(item);
    });
    document.body.append(button);
  }, 300);
</script>
`;

const handingOver = `<!doctype html>
<script>
  globalThis.__APP_INIT__?.('Duck');

  if (!sessionStorage.getItem('reloaded')) {
    sessionStorage.setItem('reloaded', 'yes');
    location.reload();
  }
</script>
`;

const tracking = `<!doctype html>
<input id="amount" type="number" />
<output id="shown"></output>
<script>
  const input = document.querySelector('#amount');
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let tracked = input.value;

  Object.defineProperty(input, 'value', {
    get: () => native.get.call(input),
    set: (value) => {
      tracked = String(value);
      native.set.call(input, value);
    },
  });
  input.addEventListener('input', () => {
    if (input.value === tracked) return;

    tracked = input.value;
    document.querySelector('#shown').textContent = input.value;
  });
</script>
`;

const attaching = `<!doctype html>
<input id="attachment" type="file" hidden />
<output id="attached"></output>
<script>
  const input = document.querySelector('#attachment');

  input.addEventListener('change', async () => {
    const [file] = input.files;

    document.querySelector('#attached').textContent =
      \`\${file.name} \${file.type} \${await file.text()}\`;
  });
</script>
`;

const dialog = `<!doctype html>
<dialog id="modal"><button>Close</button></dialog>
<script>
  globalThis.pressed = [];
  document.addEventListener('keydown', (event) => pressed.push(event.key));
  document.querySelector('#modal').showModal();
</script>
`;

const surroundings = `<!doctype html>
<script>
  globalThis.seen = [
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    matchMedia('(prefers-color-scheme: dark)').matches,
  ];
</script>
`;

const configured = `<!doctype html>
<input id="api" />
<button id="ask">Ask</button>
<output id="status"></output>
<script>
  document.querySelector('#ask').addEventListener('click', async () => {
    const response = await fetch(\`\${document.querySelector('#api').value}/status\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'checkout' }),
    });

    document.querySelector('#status').textContent = (await response.json()).status;
  });
</script>
`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type',
};

const server = `
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const html = await readFile(process.argv[2], 'utf8');

createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
}).listen(Number(process.env.PORT));
`;

const pages = [
  {
    promise: 'a page that shows what the user chose passes',
    shown: 'chosen',
    pass: true,
  },
  {
    promise: 'a page that shows something else fails',
    shown: 'chosen.toUpperCase()',
    pass: false,
  },
];

const readings = [
  {
    promise: 'accepts the expected reads in order among others',
    page: [['Ana'], 'ignored', ['Bruno']],
    accepted: true,
  },
  {
    promise: 'rejects the expected reads out of order',
    page: [['Bruno'], ['Ana']],
    accepted: false,
  },
  {
    promise: 'rejects a page that was never read',
    page: undefined,
    accepted: false,
  },
];

await describeWithBrowser(
  'Checking a transcription that serves a page',
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'stackfy-page-'));
    const options = { cwd: folder, host: '127.0.0.1', timeout: 60000 };

    await writeFile(join(folder, 'server.mjs'), server);

    for (const [index, { promise, shown, pass }] of pages.entries()) {
      await writeFile(join(folder, `${index}.html`), page(shown));

      await it(promise, async () => {
        const result = await runCase(choosing, {
          ...options,
          command: `node server.mjs ${index}.html`,
        });

        strict.equal(result.pass, pass);
      });
    }

    await it('a step whose element never appears fails instead of hanging', async () => {
      const missing = {
        ...choosing,
        serve: {
          port: PORT,
          page: { timeout: 1000, steps: [{ click: '#missing' }] },
        },
      };
      const result = await runCase(missing, {
        ...options,
        command: 'node server.mjs 0.html',
      });

      strict.equal(result.pass, false);
    });

    await it("a script the case declares runs before the page's own on every load", async () => {
      const hooking = {
        name: 'reads what the page hands to its startup hook',
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            init: "globalThis.__APP_INIT__ = (name) => sessionStorage.setItem('handed', (sessionStorage.getItem('handed') ?? '') + name);",
            steps: [
              { wait: "sessionStorage.getItem('handed') === 'DuckDuck'" },
              { read: "sessionStorage.getItem('handed')" },
            ],
          },
        },
        expect: [{ type: 'page', values: ['DuckDuck'] }],
      };

      await writeFile(join(folder, 'hooked.html'), handingOver);

      const result = await runCase(hooking, {
        ...options,
        command: 'node server.mjs hooked.html',
      });

      strict.equal(result.pass, true);
    });

    await it('a filled value reaches a page that ignores the values its own script sets, as React does', async () => {
      const filling = {
        name: 'shows the amount typed in',
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            steps: [
              { fill: '#amount', value: '5000.01' },
              { wait: "document.querySelector('#shown').textContent !== ''" },
              { read: "document.querySelector('#shown').textContent" },
            ],
          },
        },
        expect: [{ type: 'page', values: ['5000.01'] }],
      };

      await writeFile(join(folder, 'tracking.html'), tracking);

      const result = await runCase(filling, {
        ...options,
        command: 'node server.mjs tracking.html',
      });

      strict.equal(result.pass, true);
    });

    await it('an uploaded file reaches a hidden file input with its name, type, and bytes', async () => {
      const uploading = {
        name: 'shows the attached note',
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            steps: [
              {
                upload: '#attachment',
                file: {
                  name: 'nota.txt',
                  type: 'text/plain',
                  base64: 'T2zDoQ==',
                },
              },
              {
                wait: "document.querySelector('#attached').textContent !== ''",
              },
              { read: "document.querySelector('#attached').textContent" },
            ],
          },
        },
        expect: [{ type: 'page', values: ['nota.txt text/plain Olá'] }],
      };

      await writeFile(join(folder, 'attaching.html'), attaching);

      const result = await runCase(uploading, {
        ...options,
        command: 'node server.mjs attaching.html',
      });

      strict.equal(result.pass, true);
    });

    await it("a pressed key reaches the document's listeners and closes a native modal dialog", async () => {
      const pressing = {
        name: 'closes the dialog with Escape',
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            steps: [
              { wait: "document.querySelector('#modal').open" },
              { press: 'Escape' },
              { wait: "!document.querySelector('#modal').open" },
              { read: 'pressed' },
            ],
          },
        },
        expect: [{ type: 'page', values: [['Escape']] }],
      };

      await writeFile(join(folder, 'dialog.html'), dialog);

      const result = await runCase(pressing, {
        ...options,
        command: 'node server.mjs dialog.html',
      });

      strict.equal(result.pass, true);
    });

    await it('a case fixes the time zone and the color scheme the page sees from its first script', async () => {
      const emulating = {
        name: 'sees Chatham at night',
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            timezone: 'Pacific/Chatham',
            media: { 'prefers-color-scheme': 'dark' },
            steps: [{ read: 'seen' }],
          },
        },
        expect: [{ type: 'page', values: [['Pacific/Chatham', true]] }],
      };

      await writeFile(join(folder, 'surroundings.html'), surroundings);

      const result = await runCase(emulating, {
        ...options,
        command: 'node server.mjs surroundings.html',
      });

      strict.equal(result.pass, true);
    });

    await it('a step that types {replay} points a page whose API address the user sets to the replay', async () => {
      const asking = {
        name: 'shows the status the API answers',
        replay: [
          {
            method: 'OPTIONS',
            path: '/status',
            status: 204,
            headers: CORS,
            incidental: true,
          },
          {
            method: 'POST',
            path: '/status',
            headers: { 'content-type': 'application/json', ...CORS },
            json: { status: 'operational' },
          },
        ],
        serve: {
          port: PORT,
          page: {
            timeout: 5000,
            steps: [
              { fill: '#api', value: '{replay}' },
              { click: '#ask' },
              { wait: "document.querySelector('#status').textContent !== ''" },
              { read: "document.querySelector('#status').textContent" },
            ],
          },
        },
        expect: [
          { type: 'page', values: ['operational'] },
          {
            type: 'requests',
            requests: [
              {
                method: 'POST',
                path: '/status',
                body: { service: 'checkout' },
              },
            ],
          },
        ],
      };

      await writeFile(join(folder, 'configured.html'), configured);

      const result = await runCase(asking, {
        ...options,
        command: 'node server.mjs configured.html',
      });

      strict.equal(result.pass, true);
    });

    await rm(folder, { recursive: true, force: true });
  }
);

describe('Page check', () => {
  const check = { type: 'page', values: [['Ana'], ['Bruno']] };

  for (const { promise, page: read, accepted } of readings)
    it(promise, () => {
      strict.equal(evaluate([check], { page: read }).length === 0, accepted);
    });
});
