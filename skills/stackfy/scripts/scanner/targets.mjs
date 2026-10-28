import { spawnSync } from 'node:child_process';

const TARGET_ALIASES = Object.freeze({
  'c#': 'csharp',
  'c++': 'cpp',
  'f#': 'fsharp',
  golang: 'go',
  js: 'javascript',
  node: 'javascript',
  'node.js': 'javascript',
  nodejs: 'javascript',
  py: 'python',
  ts: 'typescript',
});

const TOOLCHAINS = Object.freeze({
  python: {
    probes: [
      ['python3', ['--version']],
      ['python', ['--version']],
    ],
    install: 'https://www.python.org/downloads/',
  },
  go: { probes: [['go', ['version']]], install: 'https://go.dev/doc/install' },
  rust: { probes: [['cargo', ['--version']]], install: 'https://rustup.rs' },
  csharp: {
    probes: [['dotnet', ['--version']]],
    install: 'https://dotnet.microsoft.com/download',
  },
  java: { probes: [['javac', ['-version']]], install: 'https://adoptium.net' },
  cpp: {
    probes: [
      ['c++', ['--version']],
      ['g++', ['--version']],
      ['clang++', ['--version']],
    ],
    install: 'https://isocpp.org/get-started',
  },
  javascript: {
    probes: [['node', ['--version']]],
    install: 'https://nodejs.org',
  },
  typescript: {
    probes: [['node', ['--version']]],
    install: 'https://nodejs.org',
  },
});

const FRAMEWORKS = Object.freeze({
  typescript: [
    'angular',
    'astro',
    'express',
    'fastify',
    'hono',
    'nest',
    'next',
    'nuxt',
    'preact',
    'react',
    'remix',
    'solid',
    'svelte',
    'sveltekit',
    'vue',
  ],
  python: ['django', 'fastapi', 'flask', 'streamlit'],
  go: ['echo', 'fiber', 'gin'],
  rust: ['actix-web', 'axum', 'leptos', 'rocket'],
  csharp: ['asp-net', 'asp-net-core', 'blazor'],
  java: ['quarkus', 'spring', 'spring-boot'],
});

const VERSION_SUFFIX = /-\d+(?:-\d+)*$/;

const JAVASCRIPT_SUFFIX = /-?js$/;

export const slugTarget = (name) => {
  const lower = String(name).trim().toLowerCase();

  return (
    TARGET_ALIASES[lower] ??
    lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  );
};

const languageOf = (slug) => {
  const name = slug.replace(VERSION_SUFFIX, '');
  if (TOOLCHAINS[name]) return name;

  const framework = name.replace(JAVASCRIPT_SUFFIX, '');

  return Object.keys(FRAMEWORKS).find((language) =>
    FRAMEWORKS[language].includes(framework)
  );
};

export const checkToolchain = (target, run = spawnSync) => {
  const slug = slugTarget(target);
  const language = languageOf(slug);
  if (!language) return { target: slug, known: false, installed: false };

  const toolchain = TOOLCHAINS[language];

  for (const [command, probeArguments] of toolchain.probes) {
    const result = run(command, probeArguments, {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (result.error || result.status !== 0) continue;

    return {
      target: slug,
      language,
      known: true,
      installed: true,
      command: [command, ...probeArguments].join(' '),
      version: `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0],
    };
  }

  return {
    target: slug,
    language,
    known: true,
    installed: false,
    install: toolchain.install,
  };
};
