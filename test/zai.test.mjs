import test from 'node:test';
import assert from 'node:assert/strict';
import {parseZaiQuota, readZai} from '../zai.mjs';
import {createMonitor, validateConfig} from '../core.mjs';
import {createServer} from '../server.mjs';

const source = {id: 'plan', type: 'subscription', adapter: 'zai', authRef: 'env:ZAI_TEST_TOKEN'};
const body = limits => ({data: {limits}});
const response = (limits, status = 200, headers = {}) => new Response(JSON.stringify(body(limits)), {status, headers});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('Z.ai config requires subscription and isolated environment references', () => {
  const account = {id: 'one', provider: 'Z.ai', label: 'One', sources: [source]};
  assert.deepEqual(validateConfig({accounts: [account]}).accounts[0].sources[0], source);
  for (const invalid of [{...source, type: 'api'}, {...source, authRef: 'local:token'}, {...source, authRef: 'literal-token'}, {...source, authRef: null}]) {
    assert.throws(() => validateConfig({accounts: [{...account, sources: [invalid]}]}));
  }
  assert.throws(() => validateConfig({accounts: [account, {...account, id: 'two', sources: [{...source, id: 'other'}]}]}));
});

test('strict percentages distinguish zero, missing and partial fields without inventing weekly or reset', () => {
  const result = parseZaiQuota(body([{type: 'TOKENS_LIMIT', percentage: 100}, {type: 'TIME_LIMIT', percentage: 0, currentValue: 3, usage: 4, usageDetails: [{secret: 'private'}]}]));
  assert.deepEqual(result.metrics.map(metric => [metric.window.id, metric.value]), [['5h', 0], ['monthly_mcp', 100], ['weekly', null]]);
  assert.equal(result.metrics[0].window.durationMinutes, 300);
  assert.equal(result.metrics[1].window.durationMinutes, null);
  assert.equal(result.metrics.every(metric => metric.window.resetsAt === undefined), true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(parseZaiQuota(body([{type: 'TOKENS_LIMIT', percentage: 25}])).metrics.map(metric => metric.value), [75, null, null]);
  assert.deepEqual(parseZaiQuota(body([])).metrics.map(metric => metric.value), [null, null, null]);
});

test('malformed schema and known percentage values fail atomically', () => {
  for (const value of [NaN, Infinity, -1, 101, '0', false, {}]) {
    assert.throws(() => parseZaiQuota(body([{type: 'TOKENS_LIMIT', percentage: value}])), error => error.code === 'invalid_data');
  }
  for (const invalid of [{}, {data: {}}, {data: {limits: {}}}, body([null]), body([{type: 'TOKENS_LIMIT', percentage: 2}, {type: 'TOKENS_LIMIT', percentage: 3}])]) {
    assert.throws(() => parseZaiQuota(invalid), error => error.code === 'invalid_data');
  }
});

test('fixed GET sends raw token, rejects redirect, forwards signal, and sanitizes failures', async () => {
  const controller = new AbortController();
  const seen = [];
  const fetcher = async (url, options) => {seen.push([url, options]); return response([{type: 'TOKENS_LIMIT', percentage: 40}]);};
  const result = await readZai({}, source, {signal: controller.signal}, {fetcher, env: {ZAI_TEST_TOKEN: 'secret-token'}});
  assert.equal(result.metrics[0].value, 60);
  assert.equal(seen[0][0], 'https://api.z.ai/api/monitor/usage/quota/limit');
  assert.equal(seen[0][1].method, 'GET');
  assert.equal(seen[0][1].headers.Authorization, 'secret-token');
  assert.equal(seen[0][1].redirect, 'error');
  assert.equal(seen[0][1].signal, controller.signal);
  await assert.rejects(() => readZai({}, source, {signal: controller.signal}, {fetcher, env: {}}), error => error.status === 401);
  assert.equal(seen.length, 1);
  for (const status of [401, 403]) {
    await assert.rejects(() => readZai({}, source, {signal: controller.signal}, {fetcher: async () => response([], status), env: {ZAI_TEST_TOKEN: 'secret-token'}}), error => error.status === status && !JSON.stringify(error).includes('secret'));
  }
  await assert.rejects(() => readZai({}, source, {signal: controller.signal}, {fetcher: async () => response([], 429, {'Retry-After': '42'}), env: {ZAI_TEST_TOKEN: 'secret-token'}}), error => error.status === 429 && error.retryAfter === '42');
  for (const fetcher of [async () => {throw Error('secret-token');}, async () => Response.redirect('https://evil.test/'), async () => new Response('{broken')]) {
    await assert.rejects(() => readZai({}, source, {signal: controller.signal}, {fetcher, env: {ZAI_TEST_TOKEN: 'secret-token'}}), error => !JSON.stringify(error).includes('secret-token'));
  }
  controller.abort();
  await assert.rejects(() => readZai({}, source, {signal: controller.signal}, {fetcher: async () => {throw Error('secret-token');}, env: {ZAI_TEST_TOKEN: 'secret-token'}}), error => error.code === 'timeout');
});

test('two accounts update and fail independently with safe common state', async () => {
  const config = validateConfig({accounts: [
    {id: 'one', provider: 'Z.ai', label: 'One', sources: [{...source, authRef: 'env:ZAI_ONE'}]},
    {id: 'two', provider: 'Z.ai', label: 'Two', sources: [{...source, authRef: 'env:ZAI_TWO'}]}
  ]});
  let time = Date.parse('2026-01-01T00:00:00.000Z'), secondStatus = 403;
  const env = {ZAI_ONE: 'one-secret', ZAI_TWO: 'two-secret'};
  const fetcher = async (url, options) => options.headers.Authorization === 'one-secret' ? response([{type: 'TOKENS_LIMIT', percentage: 100}]) : response([{type: 'TOKENS_LIMIT', percentage: 20}], secondStatus);
  const monitor = createMonitor(config, {zai: (account, configuredSource, context) => readZai(account, configuredSource, context, {fetcher, env})}, {now: () => time});
  monitor.tick(); await flush();
  let [one, two] = monitor.snapshot().accounts.map(account => account.sources[0]);
  assert.equal(one.metrics[0].value, 0);
  assert.equal(one.metrics[0].observationBasis, 'response_received');
  assert.equal(one.metrics[0].window.resetsAt, null);
  assert.equal(one.sourceLabel, 'Z.ai Coding Plan quota');
  assert.equal(two.status, 'auth');
  assert.equal(two.nextAttemptAt, null);
  assert.equal(two.metrics.length, 0);
  assert.equal(JSON.stringify(monitor.snapshot()).includes('secret'), false);
  secondStatus = 200; time += 10000; monitor.tick(); await flush();
  assert.equal(monitor.snapshot().accounts[1].sources[0].status, 'auth');
  monitor.refresh(); await flush();
  [one, two] = monitor.snapshot().accounts.map(account => account.sources[0]);
  assert.equal(one.status, 'ok');
  assert.equal(two.metrics[0].value, 80);
  assert.equal(two.metrics[2].value, null);
});

test('default server registry reaches Z.ai adapter and missing key pauses only its source', async () => {
  const config = validateConfig({accounts: [{id: 'one', provider: 'Z.ai', label: 'One', sources: [{...source, authRef: 'env:ZAI_MONITOR_TEST_ABSENT_TOKEN'}]}]});
  const app = createServer(config);
  app.monitor.tick(); await flush();
  const state = app.monitor.snapshot().accounts[0].sources[0];
  assert.equal(state.status, 'auth');
  assert.equal(state.safeError, 'auth');
  assert.equal(state.sourceLabel, 'Z.ai Coding Plan quota');
  assert.equal(state.nextAttemptAt, null);
});

test('Z.ai 429 honors Retry-After and invalid JSON uses safe common failure', async () => {
  const config = validateConfig({accounts: [{id: 'one', provider: 'Z.ai', label: 'One', sources: [source]}]});
  let time = Date.parse('2026-01-01T00:00:00.000Z'), phase = 0;
  const fetcher = async () => ++phase === 1 ? response([], 429, {'Retry-After': '30'}) : new Response('{broken');
  const monitor = createMonitor(config, {zai: (account, configuredSource, context) => readZai(account, configuredSource, context, {fetcher, env: {ZAI_TEST_TOKEN: 'secret'}})}, {now: () => time});
  monitor.tick(); await flush();
  let state = monitor.snapshot().accounts[0].sources[0];
  assert.equal(state.safeError, 'rate_limited');
  assert.equal(state.delayReason, 'retry_after');
  assert.equal(Date.parse(state.nextAttemptAt), time + 30000);
  time += 30000; monitor.tick(); await flush();
  state = monitor.snapshot().accounts[0].sources[0];
  assert.equal(state.safeError, 'invalid_data');
  assert.equal(state.status, 'error');
  assert.equal(JSON.stringify(state).includes('secret'), false);
});
