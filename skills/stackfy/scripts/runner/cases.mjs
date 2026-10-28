import { evaluate } from './checks.mjs';
import { downloadSeeds, readWrittenFiles, seedFiles } from './files.mjs';
import { fillAddresses, fillWorkingDirectory } from './placeholders.mjs';
import { driveCommand } from './programs.mjs';
import { endpointEnv, startReplay } from './replay.mjs';
import { sendRequests } from './requests.mjs';
import { startServices } from './services.mjs';
import { placeStandIns, quoteArgument, withStandIns } from './stand-ins.mjs';

const commandFor = (template, { program, args: programArguments = [] }) => {
  if (program !== undefined && !template.includes('{program}'))
    return { error: `the command does not choose the program ${program}` };

  const chosen = template.replaceAll('{program}', program ?? '');
  const quoted = programArguments.map(quoteArgument).join(' ');

  if (template.includes('{args}'))
    return { command: chosen.replaceAll('{args}', quoted) };

  return { command: [chosen, quoted].filter(Boolean).join(' ') };
};

const withReplayAddress = (value, address) =>
  address === undefined ? value : fillAddresses(value, address);

const withReplayInPage = (definition, address) =>
  definition.serve?.page === undefined
    ? definition
    : {
        ...definition,
        serve: {
          ...definition.serve,
          page: withReplayAddress(definition.serve.page, address),
        },
      };

const withoutUnsetVariables = (env) =>
  Object.fromEntries(Object.entries(env).filter(([, value]) => value !== null));

const interruptions = (result, timeout) => [
  ...(result.timedOut ? [`timed out after ${timeout} ms`] : []),
  ...(result.notReady ? [result.notReady] : []),
  ...(result.notAnswered ? [result.notAnswered] : []),
  ...(result.pageFailure ? [result.pageFailure] : []),
];

const failedResult = (definition, failures) => ({
  name: definition.name,
  pass: false,
  failures,
});

export const runCase = async (definition, options) => {
  const { command, error } = commandFor(options.command, definition);
  if (error) return failedResult(definition, [error]);

  const seeds = await downloadSeeds(definition.files ?? {});
  if (seeds.error) return failedResult(definition, [seeds.error]);

  const exchanges = fillWorkingDirectory(definition.replay ?? [], options.cwd);
  const replay =
    exchanges.length > 0 || definition.socket
      ? await startReplay(exchanges, options.host, definition.replayPort)
      : null;
  const timeout = definition.timeout ?? options.timeout;
  const endpoint = replay ? endpointEnv(options.host, replay.port) : {};
  const address = endpoint.STACKFY_REPLAY_URL;
  const standIns = definition.commands
    ? await placeStandIns(
        fillWorkingDirectory(definition.commands, options.cwd)
      )
    : null;
  const env = withStandIns(
    withoutUnsetVariables({
      ...process.env,
      ...withReplayAddress({ ...options.env, ...definition.env }, address),
      ...endpoint,
    }),
    standIns
  );
  const since = Date.now();
  const restoreSeeds = await seedFiles(seeds.files, options.cwd, since);
  const result = await driveCommand(
    command,
    withReplayInPage(definition, address),
    {
      cwd: options.cwd,
      env,
      timeout,
      browser: options.browser,
      replay,
    }
  );

  await replay?.close();
  await standIns?.remove();

  const inspected = await sendRequests(undefined, definition.inspect ?? []);
  const files = await readWrittenFiles(definition.expect, options.cwd, since);

  await restoreSeeds();

  const interrupted = interruptions(result, timeout);
  const failures =
    interrupted.length > 0
      ? interrupted
      : evaluate(
          definition.expect,
          {
            ...result,
            responses: [...(result.responses ?? []), ...inspected],
            requests: replay?.requests ?? [],
            files,
          },
          exchanges
        );

  return {
    name: definition.name,
    pass: failures.length === 0,
    failures,
    ...(failures.length > 0
      ? { stdout: result.stdout, stderr: result.stderr }
      : {}),
    ...(failures.length > 0 && definition.serve?.page
      ? { page: result.page, pageErrors: result.pageErrors }
      : {}),
  };
};

export const runCases = async (definition, options) => {
  const services = definition.services
    ? await startServices(definition, {
        root: options.root,
        env: { ...process.env, ...definition.env },
        timeout: options.timeout,
      })
    : null;
  const results = [];

  try {
    for (const testCase of definition.cases)
      results.push(
        await runCase(testCase, { ...options, env: definition.env })
      );
  } finally {
    await services?.stop();
  }

  return results;
};
