import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const SHELL_SAFE = /^[\w./:=@%+,-]+$/;

export const quoteArgument = (value) => {
  const text = String(value);

  return SHELL_SAFE.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
};

const argumentCondition = (argument, index) => {
  const value = `"\${${index + 1}}"`;

  return argument?.$pattern === undefined
    ? `[ ${value} = ${quoteArgument(argument)} ]`
    : `printf '%s\\n' ${value} | grep -Eq -- ${quoteArgument(argument.$pattern)}`;
};

const callCondition = ({ args: recorded }) =>
  recorded === undefined
    ? 'true'
    : [
        `[ "$#" -eq ${recorded.length} ]`,
        ...recorded.map(argumentCondition),
      ].join(' && ');

const answerCall = ({ stdout = '', stderr = '', code = 0 }) => [
  `printf '%s' ${quoteArgument(stdout)}`,
  `printf '%s' ${quoteArgument(stderr)} >&2`,
  `exit ${code}`,
];

const runInstalled = (name, folder) => [
  `installed=$(PATH=\${PATH#${quoteArgument(`${folder}${delimiter}`)}}; command -v ${quoteArgument(name)})`,
  `[ -n "$installed" ] && exec "$installed" "$@"`,
  `printf 'stackfy: %s is not installed\\n' ${quoteArgument(name)} >&2`,
  'exit 127',
];

const standInScript = (name, calls, folder) =>
  [
    '#!/bin/sh',
    ...calls.flatMap((call) => [
      `if ${callCondition(call)}; then`,
      ...(call.passthrough ? runInstalled(name, folder) : answerCall(call)).map(
        (line) => `  ${line}`
      ),
      'fi',
    ]),
    `printf 'stackfy: no recorded call for %s %s\\n' ${quoteArgument(name)} "$*" >&2`,
    'exit 127',
    '',
  ].join('\n');

export const placeStandIns = async (commands) => {
  const folder = await mkdtemp(join(tmpdir(), 'stackfy-commands-'));

  for (const [name, calls] of Object.entries(commands)) {
    const path = join(folder, name);

    await writeFile(path, standInScript(name, calls, folder));
    await chmod(path, 0o755);
  }

  return {
    folder,
    remove: () => rm(folder, { recursive: true, force: true }),
  };
};

export const withStandIns = (env, standIns) =>
  standIns
    ? { ...env, PATH: [standIns.folder, env.PATH].join(delimiter) }
    : env;
