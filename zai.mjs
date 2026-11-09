import {remainingPercent} from './core.mjs';

const QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';
const SOURCE = 'Z.ai Coding Plan quota';
const definitions = [
  ['TOKENS_LIMIT', '5h', '5h quota', 300],
  ['TIME_LIMIT', 'monthly_mcp', 'Monthly MCP quota', null]
];

export function parseZaiQuota(body) {
  const data = body?.data;
  if (!data || !Array.isArray(data.limits)) throw {code: 'invalid_data'};
  const limits = new Map();
  for (const item of data.limits) {
    if (!item || typeof item !== 'object') throw {code: 'invalid_data'};
    if (definitions.some(([type]) => type === item.type)) {
      if (limits.has(item.type)) throw {code: 'invalid_data'};
      limits.set(item.type, item);
    }
  }
  const metrics = definitions.map(([type, id, name, durationMinutes]) => {
    const item = limits.get(type);
    const used = item?.percentage;
    if (used != null && (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100)) throw {code: 'invalid_data'};
    return {key: 'remaining', name, kind: 'percent', scope: 'account', value: used == null ? null : remainingPercent(used), sourceLabel: SOURCE, window: {id, label: id === '5h' ? '5h' : 'Monthly MCP', durationMinutes}};
  });
  metrics.push({key: 'remaining', name: 'Weekly (not reported; applicability unknown)', kind: 'percent', scope: 'account', value: null, sourceLabel: SOURCE, window: {id: 'weekly', label: 'Weekly'}});
  return {metrics};
}

export async function readZai(account, source, {signal}, {fetcher = fetch, env = process.env} = {}) {
  const token = env[source.authRef?.slice(4)];
  if (!token || typeof token !== 'string') throw {status: 401};
  let response;
  try {
    response = await fetcher(QUOTA_URL, {method: 'GET', headers: {Authorization: token, Accept: 'application/json'}, redirect: 'error', signal});
  } catch (error) {
    if (signal.aborted || error?.name === 'AbortError') throw {code: 'timeout'};
    throw {code: 'network'};
  }
  if (response.status === 401 || response.status === 403) throw {status: response.status};
  if (response.status === 429) throw {status: 429, retryAfter: response.headers.get('retry-after')};
  if (!response.ok) throw {code: 'network'};
  let body;
  try {body = await response.json();}
  catch {throw {code: 'invalid_data'};}
  return parseZaiQuota(body);
}
