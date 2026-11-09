// Run: node test/smoke-codex.mjs. Uses an empty private profile; no login or model call.
import assert from 'node:assert/strict';
import {mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readCodex} from '../codex.mjs';

const base = await mkdtemp(path.join(tmpdir(), 'monitor-codex-smoke-'));
const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(), 15000);
try {
  await assert.rejects(readCodex({}, {authRef:'local:empty'}, {signal:abort.signal}, {base}), error => error.status === 401);
  await assert.rejects(access(path.join(base, 'empty', 'auth.json')), error => error.code === 'ENOENT');
  console.log('Codex app-server smoke passed: isolated empty profile requires login.');
} finally {clearTimeout(timeout); await rm(base, {recursive:true,force:true});}
