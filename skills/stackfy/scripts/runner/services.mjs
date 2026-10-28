import { basename, resolve } from 'node:path';
import { isListening, runProcess, waitUntil } from './processes.mjs';

const composeProject = (module) =>
  `stackfy-${basename(module)}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

const servicesCommands = ({ module, services }, root) => {
  const folder = resolve(root, module);

  if (services.compose === undefined)
    return {
      folder,
      up: ['sh', ['-c', services.up]],
      down: ['sh', ['-c', services.down]],
    };

  const compose = [
    'compose',
    '-f',
    resolve(folder, services.compose),
    '-p',
    composeProject(module),
  ];

  return {
    folder,
    up: [
      'docker',
      [...compose, 'up', '-d', '--wait', ...(services.only ?? [])],
    ],
    down: ['docker', [...compose, 'down', '-v']],
  };
};

export const startServices = async (definition, { root, env, timeout }) => {
  const { folder, up, down } = servicesCommands(definition, root);
  const options = { cwd: folder, env };
  const stop = () => runProcess(...down, options);
  const started = await runProcess(...up, options);

  if (started.code !== 0) {
    await stop();
    throw new Error(`services did not start: ${started.output.trim()}`);
  }

  for (const { port, host } of definition.services.ready ?? []) {
    const ready = await waitUntil(() => isListening(port, host), timeout);
    if (ready) continue;

    await stop();
    throw new Error(`services did not open port ${port}`);
  }

  return { stop };
};
