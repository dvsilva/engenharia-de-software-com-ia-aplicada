import { describe, it, strict } from 'poku';
import { checkToolchain } from '../../../stackfy/scripts/scanner/targets.mjs';

const machineWith = (installed) => (command) =>
  installed.includes(command)
    ? { status: 0, stdout: `${command} 1.0.0\n`, stderr: '' }
    : { status: null, error: new Error('ENOENT') };

const missingToolchains = [
  {
    typed: 'rust',
    reported: {
      target: 'rust',
      language: 'rust',
      known: true,
      installed: false,
      install: 'https://rustup.rs',
    },
  },
  {
    typed: 'React',
    reported: {
      target: 'react',
      language: 'typescript',
      known: true,
      installed: false,
      install: 'https://nodejs.org',
    },
  },
  {
    typed: 'Next.js',
    reported: {
      target: 'next-js',
      language: 'typescript',
      known: true,
      installed: false,
      install: 'https://nodejs.org',
    },
  },
  {
    typed: 'Spring Boot 3',
    reported: {
      target: 'spring-boot-3',
      language: 'java',
      known: true,
      installed: false,
      install: 'https://adoptium.net',
    },
  },
];

describe('Toolchain check', () => {
  it('an installed toolchain reports its version', () => {
    strict.deepEqual(checkToolchain('Go', machineWith(['go'])), {
      target: 'go',
      language: 'go',
      known: true,
      installed: true,
      command: 'go version',
      version: 'go 1.0.0',
    });
  });

  it('falls back to the next command a toolchain may use', () => {
    strict.equal(
      checkToolchain('python', machineWith(['python'])).command,
      'python --version'
    );
  });

  for (const { typed, reported } of missingToolchains)
    it(`a missing toolchain for "${typed}" reports its language's install address, keeping the target as typed`, () => {
      strict.deepEqual(checkToolchain(typed, machineWith([])), reported);
    });

  it('a target support has not listed is reported as unknown', () => {
    strict.deepEqual(checkToolchain('cobol', machineWith(['cobol'])), {
      target: 'cobol',
      known: false,
      installed: false,
    });
  });
});
