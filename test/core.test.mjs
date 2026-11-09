import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor, validateConfig, remainingPercent, remainingQuantity, normalizeMetric, safeFailure} from '../core.mjs';
const config = validateConfig({accounts:[
  {id:'a',provider:'Demo',label:'One',sources:[{id:'s',type:'subscription',adapter:'demo'}]},
  {id:'b',provider:'Demo',label:'Two',sources:[{id:'s',type:'subscription',adapter:'demo'}]}
]});
const metric = (value=0, observedAt='2026-01-01T00:00:00.000Z', window='5h') => ({key:'quota',name:'Quota',kind:'quota',scope:'account',unit:'credits',value,observedAt,sourceLabel:'Fictitious demo source',window:{id:window,label:window,durationMinutes:300,resetsAt:'2026-01-01T05:00:00.000Z'}});
const flush = () => new Promise(resolve => setTimeout(resolve,0));
const state = monitor => monitor.snapshot().accounts.map(account => account.sources[0]);

test('validates config and transform ranges without inventing values', () => {
  assert.equal(remainingPercent(100),0);
  assert.equal(remainingQuantity(10,12),-2);
  assert.throws(()=>remainingPercent(101));
  assert.throws(()=>remainingQuantity(2,-1));
  assert.throws(()=>validateConfig({accounts:[{...config.accounts[0],sources:[config.accounts[0].sources[0],config.accounts[0].sources[0]]}]}));
  assert.throws(()=>normalizeMetric(metric(Number.NaN),new Date().toISOString()));
  assert.equal(normalizeMetric(metric(null),new Date().toISOString()).value,null);
  assert.equal(safeFailure({status:429,retryAfter:'3600'},0).retryAfter,3600000);
  assert.equal(safeFailure({status:429,retryAfter:'Thu, 01 Jan 1970 01:00:00 GMT'},0).retryAfter,3600000);
});

test('isolates IDs, retains missing metrics stale, removes only explicitly, and handles reset', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), call=0;
  const monitor=createMonitor(config,{demo:async(account)=>{
    if(account.id==='b') return {metrics:[metric(7)]};
    call++;return call===1?{metrics:[metric(0),metric(null,undefined,'weekly')]}:call===2?{metrics:[metric(4)]}:{metrics:[],removedKeys:[JSON.stringify(['quota','5h'])]};
  }},{now:()=>time});
  assert.equal(state(monitor)[0].status,'loading');
  monitor.tick();await flush();
  assert.equal(state(monitor)[0].metrics.length,2);
  assert.equal(state(monitor)[0].metrics[0].value,0);
  assert.equal(state(monitor)[1].metrics[0].value,7);
  time+=10000;monitor.tick();await flush();
  assert.equal(state(monitor)[0].metrics.find(m=>m.window.id==='weekly').freshness,'unknown');
  time+=10000;monitor.tick();await flush();
  assert.equal(state(monitor)[0].metrics.length,1);
  time=Date.parse('2026-01-01T05:01:00.000Z');
  assert.equal(state(monitor)[1].metrics[0].freshness,'stale');
  assert.equal(state(monitor)[1].metrics[0].value,7);
});

test('invalid partial response is atomic and errors do not erase prior values', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), bad=false;
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>bad?{metrics:[metric(1)],removedKeys:[JSON.stringify(['quota','5h']),42]}:{metrics:[metric(0)]}},{now:()=>time});
  monitor.tick();await flush();bad=true;time+=10000;monitor.tick();await flush();
  const source=state(monitor)[0];
  assert.equal(source.status,'error');assert.equal(source.safeError,'invalid_data');assert.equal(source.metrics[0].value,0);assert.equal(source.metrics[0].freshness,'stale');
});

test('passive unchanged snapshot retains observed time and absent timestamp never appears fresh', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), phase=0;
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>{phase++;return {passive:true,metrics:[{...metric(2,phase>=3?'2026-01-01T01:00:20.000Z':'2026-01-01T00:00:00.000Z'),snapshotAt:phase===4?'2026-01-01T01:00:20.000Z':'2026-01-01T00:00:00.000Z'}]};}},{now:()=>time,staleMs:3600000});
  monitor.tick();await flush();const first=state(monitor)[0].metrics[0].receivedAt;
  time+=10000;monitor.tick();await flush();assert.equal(state(monitor)[0].metrics[0].receivedAt,first);
  time+=10000;monitor.tick();await flush();assert.equal(state(monitor)[0].metrics[0].observedAt,'2026-01-01T00:00:00.000Z');
  time+=10000;monitor.tick();await flush();assert.equal(state(monitor)[0].metrics[0].observedAt,'2026-01-01T01:00:20.000Z');
  const unknown=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>({passive:true,metrics:[{...metric(1),observedAt:null}]})},{now:()=>time});
  unknown.tick();await flush();assert.equal(state(unknown)[0].metrics[0].freshness,'unknown');
  let count=0;const noTimestamp=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>({passive:true,metrics:[{...metric(++count),observedAt:null,snapshotAt:null}]})},{now:()=>time});
  noTimestamp.tick();await flush();time+=10000;noTimestamp.tick();await flush();assert.equal(state(noTimestamp)[0].metrics[0].value,2);assert.equal(state(noTimestamp)[0].metrics[0].freshness,'unknown');
});

test('timeout keeps one source busy until uncooperative reader settles while others progress', async () => {
  let release, calls=0;
  const slow=new Promise(resolve=>{release=resolve;});
  const monitor=createMonitor(config,{demo:account=>account.id==='a'?(calls++,slow):Promise.resolve({metrics:[metric(8)]})},{timeoutMs:10});
  monitor.tick();await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(state(monitor)[0].safeError,'timeout');assert.equal(state(monitor)[0].busy,true);
  assert.equal(state(monitor)[1].metrics[0].value,8);
  monitor.refresh();monitor.tick();assert.equal(calls,1);
  release({metrics:[metric(1)]});await flush();assert.equal(state(monitor)[0].busy,false);
});

test('auth suspension, explicit retry, 429 delay and bounded network backoff', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), attempts=0;
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>{attempts++;if(attempts===1)throw {status:401};if(attempts===2)throw {status:429,retryAfter:'3600'};if(attempts===3)throw Error('secret:token');return {metrics:[metric(1)]};}},{now:()=>time});
  monitor.tick();await flush();assert.equal(state(monitor)[0].nextAttemptAt,null);
  time+=20000;monitor.tick();await flush();assert.equal(attempts,1);
  monitor.refresh();await flush();assert.equal(attempts,2);assert.equal(state(monitor)[0].delayReason,'retry_after');
  const rateUntil=Date.parse(state(monitor)[0].nextAttemptAt);monitor.refresh();assert.equal(attempts,2);
  time=rateUntil;monitor.tick();await flush();assert.equal(attempts,3);assert.equal(state(monitor)[0].safeError,'network');
  assert.equal(JSON.stringify(monitor.snapshot()).includes('secret'),false);
  time=Date.parse(state(monitor)[0].nextAttemptAt);monitor.tick();await flush();assert.equal(state(monitor)[0].status,'ok');
});

test('normal cadence follows attempt start, global cap skips busy sources, and read-only tabs do not poll adapters', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), calls=[], release;
  const pending=new Promise(resolve=>{release=resolve;});
  const monitor=createMonitor(config,{demo:account=>{calls.push([account.id,time]);return account.id==='a'?pending:Promise.resolve({metrics:[metric(3)]});}},{now:()=>time,concurrency:1,timeoutMs:60000});
  monitor.tick();monitor.tick();monitor.refresh();
  assert.deepEqual(calls.map(item=>item[0]),[]);
  await flush();assert.deepEqual(calls.map(item=>item[0]),['a']);
  monitor.snapshot();monitor.snapshot();monitor.snapshot();assert.equal(calls.length,1);
  release({metrics:[metric(1)]});await flush();
  monitor.tick();await flush();assert.deepEqual(calls.map(item=>item[0]),['a','b']);
  const next=Date.parse(state(monitor)[1].nextAttemptAt);
  assert.equal(next,time+10000);
  time+=9999;monitor.tick();await flush();assert.equal(calls.length,2);
  time++;monitor.tick();await flush();assert.equal(calls.length,3);
});

test('403 also suspends source until explicit retry', async () => {
  let calls=0,time=Date.parse('2026-01-01T01:00:00.000Z');
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>{calls++;throw {status:403};}},{now:()=>time});
  monitor.tick();await flush();time+=60000;monitor.tick();await flush();assert.equal(calls,1);assert.equal(state(monitor)[0].delayReason,'awaiting_retry');
  monitor.refresh();await flush();assert.equal(calls,2);
});

test('malformed metric response is invalid_data and huge Retry-After cannot crash state', async () => {
  let time=Date.parse('2026-01-01T01:00:00.000Z'), phase=0;
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>{phase++;if(phase===1)return {metrics:[metric(0)]};if(phase===2)return {metrics:[metric(Number.NaN)]};throw {status:429,retryAfter:'999999999999999999999999'};}},{now:()=>time});
  monitor.tick();await flush();time+=10000;monitor.tick();await flush();
  assert.equal(state(monitor)[0].safeError,'invalid_data');assert.equal(state(monitor)[0].metrics[0].value,0);
  time=Date.parse(state(monitor)[0].nextAttemptAt);monitor.tick();await flush();
  assert.equal(state(monitor)[0].safeError,'rate_limited');assert.equal(state(monitor)[0].nextAttemptAt,null);
});

test('unknown metric kind is projected as unsupported without leaking raw value', async () => {
  const unknown={...metric(1),kind:'future_metric',name:'<img src=x>',value:{token:'do-not-expose'},unit:'private-unit',currency:'USD'};
  const projected=normalizeMetric(unknown,new Date().toISOString());
  assert.equal(projected.kind,'unsupported');assert.equal(projected.value,null);
  assert.equal(projected.unit,null);assert.equal(projected.currency,null);
  assert.equal(JSON.stringify(projected).includes('do-not-expose'),false);
  const monitor=createMonitor(validateConfig({accounts:[config.accounts[0]]}),{demo:async()=>({metrics:[unknown]})});
  monitor.tick();await flush();assert.equal(state(monitor)[0].status,'ok');
  assert.equal(state(monitor)[0].metrics[0].kind,'unsupported');
  assert.throws(()=>normalizeMetric({...unknown,kind:'percent',value:101},new Date().toISOString()));
});
