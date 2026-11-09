import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Writable, PassThrough} from 'node:stream';
import {mkdtemp, lstat, rm, symlink, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {claimProfile, childEnv, parseCodexLimits, profileName, readCodex} from '../codex.mjs';
import {validateConfig, createMonitor} from '../core.mjs';

const source = alias => ({id: 'plan', type: 'subscription', adapter: 'codex', authRef: `local:${alias}`});
const flush = () => new Promise(resolve => setImmediate(resolve));
const payload = used => ({rateLimits: {primary: {usedPercent: used, windowDurationMins: 300, resetsAt: 1800000000}}, rateLimitsByLimitId: {
  codex: {primary: {usedPercent: used, windowDurationMins: 300, resetsAt: 1800000000}, secondary: {usedPercent: 100, windowDurationMins: 10080, resetsAt: null}},
  other: {primary: {usedPercent: 100, windowDurationMins: null, resetsAt: null}}
}});

function fakeChild({account = {type: 'chatgpt', email: 'person@example.com'}, limits = payload(100), stall = false, crash = false, malformed = false, split = false, rpcError = false} = {}) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.requests = []; child.closed = false;
  child.stdin = new Writable({write(chunk, encoding, done) {
    const message = JSON.parse(String(chunk)); child.requests.push(message);
    if (crash) {setImmediate(() => child.emit('close', 1)); done(); return;}
    if (!stall && message.id) setImmediate(() => {
      const frame = malformed ? '{bad\n' : JSON.stringify(rpcError && message.id === 3 ? {id:message.id,error:{code:401,message:'secret@example.com'}} : {id: message.id, result: message.id === 2 ? {account, requiresOpenaiAuth: true} : message.id === 3 ? limits : {}}) + '\n';
      if (split) {const halfway=Math.floor(frame.length/2);child.stdout.write(frame.slice(0,halfway));child.stdout.write(frame.slice(halfway));}
      else child.stdout.write(frame);
    });
    done();
  }});
  child.kill = () => {if (!child.closed) {child.closed = true; setImmediate(() => child.emit('close', 0));} return true;};
  return child;
}

test('config rejects path refs and duplicate Codex profile ownership', () => {
  const config = alias => ({accounts: [{id: 'one', provider: 'Codex', label: 'One', sources: [source(alias)]}]});
  assert.doesNotThrow(() => validateConfig(config('first')));
  for (const ref of ['local:../work', 'local:/tmp/work', 'env:KEY', 'local:x.y', 'local:https://a']) assert.throws(() => validateConfig({accounts: [{id:'one',provider:'Codex',label:'One',sources:[{...source('first'),authRef:ref}]}]}));
  assert.throws(() => validateConfig({accounts: [{id:'one',provider:'Codex',label:'One',sources:[source('first')]},{id:'two',provider:'Codex',label:'Two',sources:[source('first')]}]}));
  assert.throws(() => validateConfig({accounts: [{id:'one',provider:'Codex',label:'One',sources:[{...source('first'),type:'api'}]}]}));
});

test('combined example validates and login aliases reject path arguments', async () => {
  const example=JSON.parse(await readFile(new URL('../config.codex.example.json',import.meta.url),'utf8'));
  assert.equal(validateConfig(example).accounts.length,3);
  assert.equal(profileName('local:../working'),null);
  assert.equal(profileName('local:personal'),'personal');
});

test('all buckets and windows retain zero, 5h, unknown and safe labels', () => {
  const metrics = parseCodexLimits(payload(100)).metrics;
  assert.equal(metrics.length, 3);
  assert.deepEqual(metrics.map(m => m.value), [0, 0, 0]);
  assert.equal(metrics[0].window.label, '5h');
  assert.equal(metrics[0].window.resetsAt, '2027-01-15T08:00:00.000Z');
  assert.equal(metrics[1].window.durationMinutes, 10080);
  assert.equal(metrics[2].window.resetsAt, null);
  assert.equal(parseCodexLimits({rateLimits: payload(30).rateLimits}).metrics[0].value, 70);
  assert.equal(parseCodexLimits({rateLimits: payload(30).rateLimits, rateLimitsByLimitId: {}}).metrics.length, 0);
  const unsafe = parseCodexLimits({rateLimits: {}, rateLimitsByLimitId: {'secret@example.com/path': {primary: {usedPercent: null, windowDurationMins: null, resetsAt: null}}}}).metrics[0];
  assert.equal(unsafe.value, null); assert.equal(unsafe.window.resetsAt, null);
  assert.equal(JSON.stringify(unsafe).includes('secret@example.com'), false);
  for (const bad of [{usedPercent:-1}, {usedPercent:101}, {usedPercent:'20'}, {usedPercent:20,windowDurationMins:-1}, {usedPercent:20,resetsAt:'bad'}])
    assert.throws(() => parseCodexLimits({rateLimits:{primary:bad}}), e=>e.code==='invalid_data');
  assert.deepEqual(parseCodexLimits({rateLimits: {}}).metrics, []);
});

test('private profiles, lock and child environment isolate accounts', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'monitor-codex-test-'));
  try {
    const one = await claimProfile('one', {base});
    assert.equal((await lstat(one.home)).mode & 0o077, 0);
    await assert.rejects(claimProfile('one', {base}), e => e.code === 'profile_busy');
    const two = await claimProfile('two', {base});
    assert.notEqual(one.home, two.home);
    const env = childEnv(one.home, {PATH:'/bin',HOME:'/home/person',CODEX_HOME:'/working',CODEX_SQLITE_HOME:'/working/db',OPENAI_API_KEY:'secret',OPENAI_BASE_URL:'https://bad',HTTPS_PROXY:'https://bad'});
    assert.equal(env.CODEX_HOME, one.home); assert.equal(env.CODEX_SQLITE_HOME, undefined); assert.equal(env.OPENAI_API_KEY, undefined); assert.equal(env.OPENAI_BASE_URL, undefined); assert.equal(env.HTTPS_PROXY, undefined);
    await one.release(); await two.release();
    await symlink('/tmp', path.join(base, 'bad'));
    await assert.rejects(claimProfile('bad', {base}), e => e.code === 'invalid_data');
    await symlink('/tmp/working-auth', path.join(one.home, 'auth.json'));
    await assert.rejects(claimProfile('one', {base}), e => e.code === 'invalid_data');
    await rm(path.join(one.home, 'auth.json'));
    await writeFile(path.join(one.home, 'config.toml'), 'cli_auth_credentials_store = "keyring"', {mode:0o600});
    await assert.rejects(claimProfile('one', {base}), e => e.code === 'invalid_data');
  } finally {await rm(base, {recursive:true,force:true});}
});

test('stdio handshake, auth and secrets stay isolated', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'monitor-codex-test-'));
  const children = [];
  const calls = [];
  const spawnFn = (cmd, argv, options) => {calls.push({cmd,argv,env:options.env});const child=fakeChild({account:{type:'chatgpt',email:`${path.basename(options.env.CODEX_HOME)}@example.com`}});children.push(child);return child;};
  try {
    const config = validateConfig({accounts:[{id:'one',provider:'Codex',label:'First',sources:[source('one')]},{id:'two',provider:'Codex',label:'Second',sources:[source('two')]}]});
    const monitor = createMonitor(config, {codex:(account,s,context)=>readCodex(account,s,context,{base,spawnFn,env:{PATH:'/bin',HOME:'/home/person',OPENAI_API_KEY:'secret'}})});
    monitor.tick();
    for (let i=0;i<30 && monitor.snapshot().accounts.some(a=>a.sources[0].busy);i++) await new Promise(resolve=>setTimeout(resolve,10));
    const state=monitor.snapshot();
    assert.deepEqual(state.accounts.map(a=>a.sources[0].status), ['ok','ok']);
    assert.equal(state.accounts[0].sources[0].metrics.length,3);
    assert.deepEqual(state.accounts.map(a=>a.label),['one@example.com','two@example.com']);
    assert.equal(JSON.stringify(state).includes('secret'),false);
    assert.equal(JSON.stringify(state).includes(base),false);
    assert.equal(calls.length,2); assert.notEqual(calls[0].env.CODEX_HOME,calls[1].env.CODEX_HOME);
    for(const child of children) {
      assert.deepEqual(child.requests.map(r=>r.method),['initialize','initialized','account/read','account/rateLimits/read']);
      assert.deepEqual(child.requests[2].params,{refreshToken:false});
      assert.deepEqual(child.requests[3].params,{excludeResetCreditDetails:true});
      assert.equal(child.closed,true);
    }
    await monitor.stop();
  } finally {await rm(base,{recursive:true,force:true});}
});

test('missing login, child crash and abort release profile and do not block sibling', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'monitor-codex-test-'));
  try {
    const child = fakeChild({account:null});
    await assert.rejects(readCodex({},source('one'),{signal:new AbortController().signal},{base,spawnFn:()=>child}),e=>e.status===401);
    assert.equal(child.closed,true);
    const crash = fakeChild({crash:true});
    await assert.rejects(readCodex({},source('one'),{signal:new AbortController().signal},{base,spawnFn:()=>crash}),e=>e.code==='network');
    const stalled = fakeChild({stall:true}); const abort = new AbortController();
    const pending = readCodex({},source('one'),{signal:abort.signal},{base,spawnFn:()=>stalled});
    for (let i=0;i<30 && !stalled.requests.length;i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(stalled.requests.length);
    abort.abort();
    await assert.rejects(pending,e=>e.code==='timeout');
    assert.equal(stalled.closed,true);
    const recovered=fakeChild();
    assert.equal((await readCodex({},source('one'),{signal:new AbortController().signal},{base,spawnFn:()=>recovered})).metrics.length,3);
    const sibling=fakeChild();
    assert.equal((await readCodex({},source('two'),{signal:new AbortController().signal},{base,spawnFn:()=>sibling})).metrics.length,3);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('split frames parse; malformed and RPC errors stay safe', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'monitor-codex-test-'));
  const run = options => readCodex({},source('one'),{signal:new AbortController().signal},{base,spawnFn:()=>fakeChild(options)});
  try {
    assert.equal((await run({split:true})).metrics.length,3);
    await assert.rejects(run({malformed:true}),e=>e.code==='invalid_data' && !JSON.stringify(e).includes('secret'));
    await assert.rejects(run({rpcError:true}),e=>e.status===401 && !JSON.stringify(e).includes('secret'));
  } finally {await rm(base,{recursive:true,force:true});}
});

test('partial Codex reads retain last known value and time as stale while sibling updates', async () => {
  const config=validateConfig({accounts:[{id:'one',provider:'Codex',label:'One',sources:[source('one')]},{id:'two',provider:'Codex',label:'Two',sources:[source('two')]}]});
  let phase=0, time=Date.parse('2026-01-01T00:00:00.000Z');
  const reader=(account)=>parseCodexLimits(account.id==='two'?payload(phase?20:10):phase?{rateLimits:{},rateLimitsByLimitId:{codex:{primary:{usedPercent:null,windowDurationMins:300,resetsAt:null}}}}:payload(100));
  const monitor=createMonitor(config,{codex:reader},{now:()=>time});
  monitor.tick();await flush();
  let [one,two]=monitor.snapshot().accounts.map(a=>a.sources[0]);
  const observed=one.metrics[0].observedAt;
  assert.equal(one.metrics[0].value,0);assert.equal(two.metrics[0].value,90);
  phase=1;time+=10000;monitor.tick();await flush();
  [one,two]=monitor.snapshot().accounts.map(a=>a.sources[0]);
  assert.equal(one.metrics[0].value,0);assert.equal(one.metrics[0].observedAt,observed);assert.equal(one.metrics[0].freshness,'stale');
  assert.equal(one.metrics[1].freshness,'stale');assert.equal(two.metrics[0].value,80);assert.equal(two.metrics[0].freshness,'fresh');
  await monitor.stop();
});

test('monitor timeout and stop terminate owned child without delaying sibling', async () => {
  const base=await mkdtemp(path.join(tmpdir(),'monitor-codex-test-'));
  const children=[];
  try {
    const config=validateConfig({accounts:[{id:'one',provider:'Codex',label:'One',sources:[source('one')]},{id:'two',provider:'Codex',label:'Two',sources:[source('two')]}]});
    const monitor=createMonitor(config,{codex:(account,s,context)=>readCodex(account,s,context,{base,spawnFn:()=>{const child=fakeChild({stall:account.id==='one'});children.push(child);return child;}})},{timeoutMs:100});
    monitor.tick();
    for(let i=0;i<30 && monitor.snapshot().accounts[1].sources[0].status!=='ok';i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(monitor.snapshot().accounts[1].sources[0].status,'ok');
    for(let i=0;i<30 && monitor.snapshot().accounts[0].sources[0].safeError!=='timeout';i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(monitor.snapshot().accounts[0].sources[0].safeError,'timeout');
    await monitor.stop();
    assert.ok(children.every(child=>child.closed));
  } finally {await rm(base,{recursive:true,force:true});}
});

test('stop waits for active Codex child and blocks later refresh and tick', async () => {
  const base=await mkdtemp(path.join(tmpdir(),'monitor-codex-test-'));
  const children=[];
  let time=Date.parse('2026-01-01T00:00:00.000Z');
  try {
    const config=validateConfig({accounts:[{id:'one',provider:'Codex',label:'One',sources:[source('one')]}]});
    const monitor=createMonitor(config,{codex:(account,s,context)=>readCodex(account,s,context,{base,spawnFn:()=>{const child=fakeChild({stall:true});children.push(child);return child;}})},{now:()=>time,timeoutMs:5000});
    monitor.tick();
    for(let i=0;i<30 && !children.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(children.length,1);
    await monitor.stop();
    assert.equal(children[0].closed,true);
    assert.equal(monitor.snapshot().accounts[0].sources[0].busy,false);
    const profile=await claimProfile('one',{base});await profile.release();
    time+=60000;monitor.refresh();monitor.tick();await flush();
    assert.equal(children.length,1);
  } finally {await rm(base,{recursive:true,force:true});}
});
