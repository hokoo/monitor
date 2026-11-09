import {remainingPercent} from './core.mjs';

export async function readDemo(account, source, {signal}) {
  if (signal.aborted) throw {code: 'timeout'};
  const observedAt = new Date().toISOString();
  const common = {scope: 'account', sourceLabel: 'Fictitious demo source', observedAt};
  if (source.type === 'api') return {metrics: [{...common, key: 'balance', name: 'Fictitious API credits', kind: 'balance', currency: 'USD', value: 12.5}]};
  return {metrics: [
    {...common, key: 'remaining', name: 'Fictitious remaining', kind: 'percent', value: remainingPercent(58), window: {id: '5h', label: '5h', durationMinutes: 300, resetsAt: new Date(Date.now() + 2 * 3600000).toISOString()}},
    {...common, key: 'remaining', name: 'Fictitious remaining', kind: 'percent', value: remainingPercent(22), window: {id: 'weekly', label: 'Weekly', durationMinutes: 10080, resetsAt: new Date(Date.now() + 4 * 86400000).toISOString()}}
  ]};
}
