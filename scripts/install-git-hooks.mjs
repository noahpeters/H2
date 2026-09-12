import {execFileSync} from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// CI validates explicitly, and source archives may have no Git metadata.
if (!process.env.CI && existsSync('.git')) {
  let custom = '';
  try {
    custom = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  if (custom) {
    throw new Error(
      `Existing hooks at ${custom}; integrate .githooks/pre-push before replacing them.`,
    );
  }
  const source = fileURLToPath(
    new URL('../.githooks/pre-push', import.meta.url),
  );
  const destination = execFileSync(
    'git',
    ['rev-parse', '--git-path', 'hooks/pre-push'],
    {encoding: 'utf8'},
  ).trim();
  if (
    existsSync(destination) &&
    readFileSync(destination, 'utf8') !== readFileSync(source, 'utf8')
  ) {
    throw new Error(
      'Existing pre-push hook; integrate .githooks/pre-push before replacing it.',
    );
  }
  mkdirSync(dirname(destination), {recursive: true});
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
  process.stdout.write('Installed H2 pre-push validation.\n');
}
