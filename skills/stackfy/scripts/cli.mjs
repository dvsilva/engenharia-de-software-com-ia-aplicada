import { parseArgs } from 'node:util';

export const fail = (message, exitCode = 2) => {
  process.stderr.write(`stackfy: ${message}\n`);
  process.exit(exitCode);
};

export const readFlags = (options) => {
  try {
    return parseArgs({ options, strict: true }).values;
  } catch (error) {
    return fail(error.message, 64);
  }
};

export const readInteger = (flags, name, minimum) => {
  if (flags[name] === undefined) return undefined;

  const value = Number(flags[name]);
  if (!Number.isInteger(value) || value < minimum)
    fail(`--${name} must be an integer of at least ${minimum}.`, 64);

  return value;
};

export const start = (main) =>
  main().catch((error) => fail(`unexpected error: ${error.message}`, 1));
