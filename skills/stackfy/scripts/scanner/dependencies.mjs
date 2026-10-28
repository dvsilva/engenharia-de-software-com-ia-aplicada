import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { basename, join } from 'node:path';

const SHELL_PREFIXES = new Set(['sudo', 'exec', 'time', 'command', 'nohup']);

const PYTHON_STANDARD_LIBRARY = new Set(
  `
  abc annotationlib antigravity argparse array ast asynchat asyncio asyncore
  atexit base64 bdb binascii bisect builtins bz2 calendar cgi cgitb cmath cmd
  code codecs codeop collections colorsys compileall compression concurrent
  configparser contextlib contextvars copy copyreg cProfile crypt csv ctypes
  curses dataclasses datetime dbm decimal difflib dis distutils doctest email
  encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch
  fractions ftplib functools gc genericpath getopt getpass gettext glob
  graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr imp
  importlib inspect io ipaddress itertools json keyword lib2to3 linecache
  locale logging lzma mailbox mailcap marshal math mimetypes mmap modulefinder
  msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers opcode
  operator optparse os ossaudiodev pathlib pdb pickle pickletools pipes
  pkgutil platform plistlib poplib posix posixpath pprint profile profiling
  pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri
  random re readline reprlib resource rlcompleter runpy sched secrets select
  selectors shelve shlex shutil signal site smtpd smtplib sndhdr socket
  socketserver spwd sqlite3 ssl stat statistics string stringprep struct
  subprocess sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib
  tempfile termios textwrap this threading time timeit tkinter token tokenize
  tomllib trace traceback tracemalloc tty turtle turtledemo types typing
  unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser
  winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib
  zoneinfo
  `
    .trim()
    .split(/\s+/)
);

const PYTHON_IMPORT =
  /^[ \t]*(?:from[ \t]+([A-Za-z_]\w*)[\w.]*[ \t]+import\b|import[ \t]+([A-Za-z_][\w.]*(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[A-Za-z_][\w.]*(?:[ \t]+as[ \t]+\w+)?)*))/gm;

const JAVASCRIPT_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;

const HEREDOC = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(?=\n|$)/g;

const QUOTED = /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/g;

export const unique = (values) => [...new Set(values)].sort();

export const parseNodeDependencies = (text) => {
  const manifest = JSON.parse(text);
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });
};

const normalizePythonName = (requirement) =>
  requirement
    .trim()
    .split(/[\s<>=!~;[@]/)[0]
    .toLowerCase()
    .replace(/[-_.]+/g, '-');

export const parseRequirements = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line && !line.startsWith('-'))
    .map(normalizePythonName);

export const parsePyproject = (text) => {
  const block = text.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (!block) return [];

  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) =>
    normalizePythonName(match[1])
  );
};

export const parseGoMod = (text) => {
  const block = text.match(/^require\s*\(([\s\S]*?)\)/m);
  const grouped = block
    ? block[1]
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((name) => name && !name.startsWith('//'))
    : [];
  const single = [...text.matchAll(/^require\s+([^\s(]+)\s+\S+/gm)].map(
    (match) => match[1]
  );

  return [...grouped, ...single];
};

export const parseCargo = (text) => {
  const names = [];
  let inSection = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.startsWith('[')) {
      const table = line.match(/^\[(?:dev-|build-)?dependencies\.([^\]]+)\]$/);
      if (table) names.push(table[1].trim());
      inSection = /^\[(?:dev-|build-)?dependencies\]$/.test(line);
      continue;
    }

    const key = inSection && line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (key) names.push(key[1]);
  }

  return names;
};

const commandOf = (segment) => {
  for (const token of segment.trim().split(/\s+/)) {
    if (!token) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    if (SHELL_PREFIXES.has(token)) continue;

    return /^[a-z][a-z0-9._-]*$/.test(token) ? token : null;
  }

  return null;
};

export const parseShellCommands = (text) =>
  text
    .replace(HEREDOC, '')
    .replace(QUOTED, '""')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.split(/\|\||&&|[|;]/))
    .map(commandOf)
    .filter(Boolean);

const topLevelName = (dotted) => dotted.trim().split(/[\s.]/)[0];

export const parsePythonImports = (text) =>
  [...text.matchAll(PYTHON_IMPORT)].flatMap(([, from, names]) =>
    from ? [from] : names.split(',').map(topLevelName)
  );

export const parseNotebookImports = (text) =>
  parsePythonImports(
    JSON.parse(text)
      .cells.filter((cell) => cell.cell_type === 'code')
      .map((cell) => [cell.source].flat().join(''))
      .join('\n')
  );

const packageOf = (specifier) => {
  if (/^[./#~]|^[a-z]+:/i.test(specifier)) return null;

  const [scope, name] = specifier.split('/');
  const packageName = scope.startsWith('@') ? `${scope}/${name}` : scope;

  return builtinModules.includes(packageName) ? null : packageName;
};

export const parseJavaScriptImports = (text) =>
  [...text.matchAll(JAVASCRIPT_IMPORT)]
    .map((match) => packageOf(match[1]))
    .filter(Boolean);

const STACKS = Object.freeze([
  {
    name: 'node',
    matches: (file) => file === 'package.json',
    parse: parseNodeDependencies,
  },
  {
    name: 'python',
    matches: (file) => file === 'requirements.txt',
    parse: parseRequirements,
  },
  {
    name: 'python',
    matches: (file) => file === 'pyproject.toml',
    parse: parsePyproject,
  },
  { name: 'go', matches: (file) => file === 'go.mod', parse: parseGoMod },
  { name: 'rust', matches: (file) => file === 'Cargo.toml', parse: parseCargo },
  {
    name: 'shell',
    matches: (file) => file.endsWith('.sh'),
    parse: parseShellCommands,
  },
]);

const SOURCE_STACKS = Object.freeze([
  {
    name: 'python',
    matches: (file) => file.endsWith('.py'),
    parse: parsePythonImports,
  },
  {
    name: 'python',
    matches: (file) => file.endsWith('.ipynb'),
    parse: parseNotebookImports,
  },
  {
    name: 'node',
    matches: (file) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !file.endsWith('.d.ts'),
    parse: parseJavaScriptImports,
  },
]);

export const detectStack = (files) =>
  STACKS.find((stack) => files.some(stack.matches))?.name ?? null;

const parseFile = async (path, parse) => {
  try {
    return parse(await readFile(path, 'utf8'));
  } catch (error) {
    process.stderr.write(`stackfy: failed to read ${path}: ${error.message}\n`);
    return [];
  }
};

export const readDependencies = async (folder, files, stackName) => {
  const dependencies = [];

  for (const stack of STACKS.filter(({ name }) => name === stackName))
    for (const file of files.filter(stack.matches))
      dependencies.push(...(await parseFile(join(folder, file), stack.parse)));

  return unique(dependencies);
};

export const sourceStacksOf = (files) =>
  unique(
    SOURCE_STACKS.filter((stack) => files.some(stack.matches)).map(
      ({ name }) => name
    )
  );

const localPythonNames = (members) =>
  new Set(
    members.flatMap(({ folder, files }) => [
      basename(folder),
      ...files
        .filter((file) => file.endsWith('.py'))
        .map((file) => file.slice(0, -3)),
    ])
  );

export const readSourceDependencies = async (members, stackName) => {
  const dependencies = [];

  for (const stack of SOURCE_STACKS.filter(({ name }) => name === stackName))
    for (const { folder, files } of members)
      for (const file of files.filter(stack.matches))
        dependencies.push(
          ...(await parseFile(join(folder, file), stack.parse))
        );

  const local =
    stackName === 'python'
      ? new Set([...localPythonNames(members), ...PYTHON_STANDARD_LIBRARY])
      : new Set();

  return unique(dependencies).filter((name) => !local.has(name));
};
