import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('container login uses device auth in separate private profiles', {skip: process.platform === 'win32'}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'monitor-login-test-'));
  try {
    for (const file of ['codex.mjs', 'codex-login.mjs']) await copyFile(new URL(`../${file}`, import.meta.url), path.join(root, file));
    const fake = path.join(root, 'fake');
    await mkdir(fake);
    const cli = path.join(fake, 'codex');
    await writeFile(cli, '#!/bin/sh\nprintf "%s\\n" "$*" > "$CODEX_HOME/args"\n');
    await chmod(cli, 0o755);
    for (const alias of ['personal', 'work']) {
      const result = spawnSync(process.execPath, [path.join(root, 'codex-login.mjs'), alias], {
        env: {...process.env, PATH: `${fake}${path.delimiter}${process.env.PATH ?? ''}`}, encoding: 'utf8', timeout: 5000
      });
      assert.equal(result.status, 0, result.stderr);
      const home = path.join(root, '.monitor-codex', alias);
      assert.equal((await readFile(path.join(home, 'args'), 'utf8')).trim(), '-c cli_auth_credentials_store="file" login --device-auth');
      assert.equal((await stat(home)).mode & 0o077, 0);
      await assert.rejects(stat(path.join(home, '.monitor-lock')), {code: 'ENOENT'});
    }
  } finally {await rm(root, {recursive: true, force: true});}
});
