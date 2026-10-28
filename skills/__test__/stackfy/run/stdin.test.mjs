import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, strict } from 'poku';
import { runCase } from '../../../stackfy/scripts/runner/cases.mjs';

const conversation = {
  name: 'chats one line per prompt',
  stdin: {
    prompt: 'You: ',
    timeout: 2000,
    lines: ['first', 'second', 'exit'],
  },
  expect: [
    { type: 'exit', code: 0 },
    {
      type: 'output',
      pattern: '^You: Echo: first\\nYou: Echo: second\\nYou: $',
    },
  ],
};

const chat = (afterExit) => `
import { createInterface } from 'node:readline/promises';

const readline = createInterface({ input: process.stdin, output: process.stdout });

while (true) {
  const line = await readline.question('You: ');
  if (line === 'exit') break;
  await new Promise((resolve) => setTimeout(resolve, 50));
  console.log('Echo: ' + line);
}

readline.close();
${afterExit}
`;

const programs = [
  {
    promise:
      'every line reaches a program that only reads while it shows its prompt',
    source: chat(''),
    pass: true,
  },
  {
    promise: 'a program that never shows its prompt fails instead of hanging',
    source: 'process.stdin.resume();',
    pass: false,
  },
  {
    promise:
      'a program that keeps running after its last line is stopped and fails the exit check',
    source: chat('setInterval(() => {}, 1000);'),
    pass: false,
  },
];

await describe('Checking a transcription that chats over standard input', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-stdin-'));
  const options = { cwd: folder, host: '127.0.0.1', timeout: 30000 };

  for (const [index, { promise, source, pass }] of programs.entries()) {
    await writeFile(join(folder, `${index}.mjs`), source);

    await it(promise, async () => {
      const result = await runCase(conversation, {
        ...options,
        command: `node ${index}.mjs`,
      });

      strict.equal(result.pass, pass);
    });
  }

  await rm(folder, { recursive: true, force: true });
});
