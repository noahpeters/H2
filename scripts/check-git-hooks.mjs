import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

for (const failure of ['lint', 'test', 'none']) {
  test(`pre-push ${failure === 'none' ? 'allows a passing push' : `blocks failing ${failure}`}`, () => {
    const temp = mkdtempSync(join(tmpdir(), 'h2-hook-'));
    try {
      const repo = join(temp, 'repo');
      const remote = join(temp, 'remote.git');
      const bin = join(temp, 'bin');
      mkdirSync(repo);
      mkdirSync(bin);
      const git = (...args) =>
        execFileSync('git', args, {cwd: repo, stdio: 'pipe'});
      git('init', '-b', 'test');
      git('init', '--bare', remote);
      git('config', 'user.name', 'Hook test');
      git('config', 'user.email', 'hook@example.invalid');
      mkdirSync(join(repo, '.githooks'));
      copyFileSync(
        resolve('.githooks/pre-push'),
        join(repo, '.githooks/pre-push'),
      );
      copyFileSync(resolve('package.json'), join(repo, 'package.json'));
      execFileSync(
        process.execPath,
        [resolve('scripts/install-git-hooks.mjs')],
        {cwd: repo, env: {...process.env, CI: ''}},
      );
      assert.equal(
        readFileSync(join(repo, '.git/hooks/pre-push'), 'utf8'),
        readFileSync('.githooks/pre-push', 'utf8'),
      );
      git('add', '.');
      git('commit', '-m', 'fixture');
      const log = join(temp, 'calls');
      const commands = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
      writeFileSync(
        join(bin, 'npm'),
        `#!/bin/sh\nif [ "$2" = "verify:push" ]; then\n  exec /bin/sh -c '${commands['verify:push']}'\nfi\nprintf '%s\\n' "$*" >> "$HOOK_TEST_LOG"\nif [ "$2" = "$HOOK_TEST_FAILURE" ] || { [ "$1" = test ] && [ "$HOOK_TEST_FAILURE" = test ]; }; then exit 42; fi\n`,
        {mode: 0o755},
      );
      const result = spawnSync(
        'git',
        ['push', remote, 'HEAD:refs/heads/test'],
        {
          cwd: repo,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            HOOK_TEST_LOG: log,
            HOOK_TEST_FAILURE: failure,
          },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status === 0, failure === 'none', result.stderr);
      const calls = readFileSync(log, 'utf8');
      assert.match(calls, /run lint/);
      assert.equal(calls.includes('test -- --run'), failure !== 'lint');
      const ref = spawnSync('git', [
        '--git-dir',
        remote,
        'rev-parse',
        '--verify',
        'refs/heads/test',
      ]);
      assert.equal(ref.status === 0, failure === 'none');
    } finally {
      rmSync(temp, {recursive: true, force: true});
    }
  });
}
