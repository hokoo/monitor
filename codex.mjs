import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, lstat, rmdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = 'Codex ChatGPT quota';
const STORE = 'cli_auth_credentials_store="file"';
export const profileName = ref => typeof ref === 'string' && /^local:[a-zA-Z0-9_-]{1,64}$/.test(ref) ? ref.slice(6) : null;

async function privateDirectory(dir) {
  try {await mkdir(dir, {mode: 0o700});} catch (error) {if (error.code !== 'EEXIST') throw error;}
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw {code: 'invalid_data'};
}

async function safeProfileFiles(home) {
  try {await lstat(path.join(home, 'config.toml')); throw {code: 'invalid_data'};}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  try {
    const stat = await lstat(path.join(home, 'auth.json'));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw {code: 'invalid_data'};
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
}

export async function claimProfile(alias, {base = path.join(root, '.monitor-codex')} = {}) {
  if (!profileName(`local:${alias}`)) throw {code: 'invalid_data'};
  await privateDirectory(base);
  const home = path.join(base, alias);
  await privateDirectory(home);
  const lock = path.join(home, '.monitor-lock');
  try {await mkdir(lock, {mode: 0o700});} catch {throw {code: 'profile_busy'};}
  try {await safeProfileFiles(home);} catch (error) {await rmdir(lock).catch(() => {}); throw error;}
  let released = false;
  return {home, async release() {if (!released) {released = true; await rmdir(lock).catch(() => {});}}};
}

export function childEnv(home, env = process.env) {
  const clean = {CODEX_HOME: home};
  for (const key of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM']) if (typeof env[key] === 'string') clean[key] = env[key];
  return clean;
}

function timestamp(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 8.64e12) return null;
  return new Date(seconds * 1000).toISOString();
}

export function parseCodexLimits(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw {code: 'invalid_data'};
  const buckets = body.rateLimitsByLimitId && typeof body.rateLimitsByLimitId === 'object' && !Array.isArray(body.rateLimitsByLimitId)
    ? Object.entries(body.rateLimitsByLimitId) : body.rateLimits && typeof body.rateLimits === 'object' ? [['codex', body.rateLimits]] : [];
  if (body.rateLimitsByLimitId != null && (typeof body.rateLimitsByLimitId !== 'object' || Array.isArray(body.rateLimitsByLimitId))) throw {code: 'invalid_data'};
  const metrics = [];
  for (const [bucketId, bucket] of buckets) {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) throw {code: 'invalid_data'};
    const bucketKey = createHash('sha256').update(bucketId).digest('hex').slice(0, 16);
    const safeName = bucketId === 'codex' ? 'Codex' : `Limit ${bucketKey.slice(0, 8)}`;
    for (const slot of ['primary', 'secondary']) {
      const window = bucket[slot];
      if (window == null) continue;
      if (typeof window !== 'object' || Array.isArray(window)) throw {code: 'invalid_data'};
      if (window.windowDurationMins != null && (!Number.isInteger(window.windowDurationMins) || window.windowDurationMins <= 0)) throw {code: 'invalid_data'};
      if (window.resetsAt != null && timestamp(window.resetsAt) == null) throw {code: 'invalid_data'};
      const duration = window.windowDurationMins ?? null;
      const label = duration === 300 ? '5h' : duration ? `${duration} min` : slot === 'primary' ? 'Primary' : 'Secondary';
      const used = window.usedPercent;
      const valid = typeof used === 'number' && Number.isFinite(used) && used >= 0 && used <= 100;
      if (used != null && !valid) throw {code: 'invalid_data'};
      metrics.push({key: 'remaining', name: safeName, kind: 'percent', scope: 'account', value: valid ? 100 - used : null, sourceLabel: SOURCE,
        window: {id: `${bucketKey}_${slot}`, label, durationMinutes: duration, resetsAt: timestamp(window.resetsAt)}});
    }
  }
  return {metrics};
}

export async function readCodex(account, source, {signal}, {base, spawnFn = spawn, env = process.env} = {}) {
  const alias = profileName(source.authRef);
  if (!alias) throw {code: 'invalid_data'};
  const profile = await claimProfile(alias, {base});
  let child, closed;
  try {
    if (signal.aborted) throw {code: 'timeout'};
    child = spawnFn('codex', ['-c', STORE, 'app-server', '--stdio'], {cwd: profile.home, env: childEnv(profile.home, env), stdio: ['pipe', 'pipe', 'ignore']});
    closed = new Promise(resolve => {child.once('close', resolve); child.once('error', resolve);});
    const replies = new Map();
    let buffer = '';
    let failed;
    const fail = error => {failed = error; for (const pending of replies.values()) pending.reject(error); replies.clear();};
    const onAbort = () => fail({code: 'timeout'});
    signal.addEventListener('abort', onAbort, {once: true});
    if (signal.aborted) onAbort();
    child.once('error', () => fail({code: 'network'}));
    child.once('close', () => fail({code: 'network'}));
    child.stdin.on('error', () => fail({code: 'network'}));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 1_000_000) return fail({code: 'invalid_data'});
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message;
        try {message = JSON.parse(line);} catch {return fail({code: 'invalid_data'});}
        if (message && replies.has(message.id)) {
          const pending = replies.get(message.id); replies.delete(message.id);
          message.error ? pending.reject(message.error.code === 401 || message.error.code === 403 ? {status: message.error.code} : message.error.code === 429 ? {status: 429} : {code: 'network'}) : pending.resolve(message.result);
        }
      }
    });
    const request = (id, method, params) => {
      if (failed) return Promise.reject(failed);
      return new Promise((resolve, reject) => {
        replies.set(id, {resolve, reject});
        child.stdin.write(`${JSON.stringify({id, method, params})}\n`, error => {if (error) fail({code: 'network'});});
      });
    };
    try {
      await request(1, 'initialize', {clientInfo: {name: 'resource-monitor', version: '1.0'}});
      child.stdin.write('{"method":"initialized"}\n');
      const identity = await request(2, 'account/read', {refreshToken: false});
      if (identity?.account?.type !== 'chatgpt') throw {status: 401};
      return parseCodexLimits(await request(3, 'account/rateLimits/read', {excludeResetCreditDetails: true}));
    } finally {signal.removeEventListener('abort', onAbort);}
  } finally {
    if (child) {
      child.kill('SIGTERM');
      const hardKill = setTimeout(() => child.kill('SIGKILL'), 1000);
      await closed;
      clearTimeout(hardKill);
    }
    await profile.release();
  }
}
