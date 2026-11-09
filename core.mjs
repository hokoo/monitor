const SECOND = 1000;
export const POLL_MS = 10 * SECOND;
export const STALE_MS = 180 * SECOND;
const MAX_BACKOFF = 300 * SECOND;
const iso = time => new Date(time).toISOString();
const key = (accountId, sourceId) => JSON.stringify([accountId, sourceId]);
const metricKey = metric => JSON.stringify([metric.key, metric.window?.id ?? null]);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const validTime = value => value == null || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || !['en', 'ru'].includes(config.locale ?? 'en') || !Array.isArray(config.accounts)) throw Error('invalid config');
  const ids = new Set();
  const zaiAuthRefs = new Set();
  for (const account of config.accounts) {
    if (!validId(account.id) || !validText(account.provider) || !validText(account.label) || !Array.isArray(account.sources) || account.sources.length === 0 || ids.has(account.id)) throw Error('invalid config');
    ids.add(account.id);
    const sourceIds = new Set();
    for (const source of account.sources) {
      if (!validId(source.id) || !['subscription', 'api'].includes(source.type) || !['demo', 'zai'].includes(source.adapter) || source.adapter === 'zai' && (source.type !== 'subscription' || typeof source.authRef !== 'string' || !/^env:[A-Z_][A-Z0-9_]*$/.test(source.authRef)) || sourceIds.has(source.id) || (source.minIntervalMs != null && (!Number.isInteger(source.minIntervalMs) || source.minIntervalMs < POLL_MS || source.minIntervalMs > 86400000)) || (source.staleAfterMs != null && (!Number.isInteger(source.staleAfterMs) || source.staleAfterMs < SECOND || source.staleAfterMs > 86400000)) || (source.authRef != null && (typeof source.authRef !== 'string' || !/^(env:[A-Z_][A-Z0-9_]*|local:[a-zA-Z0-9_-]+)$/.test(source.authRef)))) throw Error('invalid config');
      if (source.adapter === 'zai') {
        if (zaiAuthRefs.has(source.authRef)) throw Error('invalid config');
        zaiAuthRefs.add(source.authRef);
      }
      sourceIds.add(source.id);
    }
  }
  return {locale: config.locale ?? 'en', accounts: config.accounts};
}

export function remainingPercent(used) {
  if (!finite(used) || used < 0 || used > 100) throw Error('invalid metric');
  return 100 - used;
}
export function remainingQuantity(limit, used) {
  if (!finite(limit) || limit < 0 || !finite(used) || used < 0) throw Error('invalid metric');
  return limit - used;
}

export function normalizeMetric(metric, receivedAt, passive = false) {
  if (!metric || !validId(metric.key) || !validText(metric.name) || !validText(metric.kind) || !validText(metric.scope) || !validText(metric.sourceLabel) || (metric.observationBasis != null && !['source', 'response_received', 'unknown'].includes(metric.observationBasis)) || !validTime(metric.observedAt) || !validTime(metric.snapshotAt) || !validTime(metric.periodStart) || !validTime(metric.periodEnd) || !validTime(metric.dataRefreshedAt)) throw Error('invalid metric');
  if (metric.window != null && (!validId(metric.window.id) || !validText(metric.window.label) || (metric.window.durationMinutes != null && (!finite(metric.window.durationMinutes) || metric.window.durationMinutes <= 0)) || !validTime(metric.window.resetsAt))) throw Error('invalid metric');
  const kind = ['percent', 'quota', 'balance', 'spend', 'text'].includes(metric.kind) ? metric.kind : 'unsupported';
  const value = kind === 'unsupported' ? null : metric.value ?? null;
  if (value !== null && (metric.kind === 'text' ? !validText(value) : !finite(value))) throw Error('invalid metric');
  if (metric.kind === 'percent' && value !== null && (value < 0 || value > 100)) throw Error('invalid metric');
  if (kind !== 'unsupported' && (metric.unit != null && !validText(metric.unit) || metric.currency != null && !/^[A-Z]{3}$/.test(metric.currency))) throw Error('invalid metric');
  if (metric.kind === 'balance' && !metric.currency) throw Error('invalid metric');
  const observedAt = metric.observedAt ?? (passive ? null : receivedAt);
  return {key: metric.key, name: metric.name, kind, scope: metric.scope, unit: kind === 'unsupported' ? null : metric.unit ?? null, currency: kind === 'unsupported' ? null : metric.currency ?? null, value, window: metric.window ? {id: metric.window.id, label: metric.window.label, durationMinutes: metric.window.durationMinutes ?? null, resetsAt: metric.window.resetsAt ?? null} : null, observedAt, observationBasis: metric.observedAt ? (metric.observationBasis ?? 'source') : (passive ? 'unknown' : 'response_received'), receivedAt, snapshotAt: metric.snapshotAt ?? null, periodStart: metric.periodStart ?? null, periodEnd: metric.periodEnd ?? null, dataRefreshedAt: metric.dataRefreshedAt ?? null, sourceLabel: metric.sourceLabel};
}

export function safeFailure(error, now = Date.now()) {
  const status = error?.status;
  if (status === 401 || status === 403) return {code: 'auth', retryAfter: null};
  if (status === 429) {
    const raw = error.retryAfter;
    let delay = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) delay = raw * SECOND;
    else if (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw)) delay = Number(raw) * SECOND;
    else if (typeof raw === 'string') { const date = Date.parse(raw); if (Number.isFinite(date)) delay = date - now; }
    return {code: 'rate_limited', retryAfter: Math.max(POLL_MS, delay ?? POLL_MS)};
  }
  if (error?.name === 'AbortError' || error?.code === 'timeout') return {code: 'timeout', retryAfter: null};
  if (error?.code === 'invalid_data') return {code: 'invalid_data', retryAfter: null};
  return {code: 'network', retryAfter: null};
}

export function createMonitor(config, adapters, {now = Date.now, timeoutMs = 10_000, concurrency = 4, pollMs = POLL_MS, staleMs = STALE_MS} = {}) {
  const states = new Map();
  for (const account of config.accounts) for (const source of account.sources) states.set(key(account.id, source.id), {metrics: new Map(), status: 'loading', safeError: null, lastAttemptAt: null, lastSuccessAt: null, nextAttemptAt: iso(now()), retryAfter: null, delayReason: 'initial', failures: 0, busy: false});
  let active = 0;
  let timer = null;
  async function attempt(account, source, state) {
    state.busy = true; active++;
    const started = now();
    state.lastAttemptAt = iso(started);
    state.nextAttemptAt = null;
    state.status = state.lastSuccessAt ? state.status : 'loading';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let readerPromise;
    try {
      const reader = adapters[source.adapter];
      if (!reader) throw {code: 'invalid_data'};
      readerPromise = Promise.resolve().then(() => reader(account, source, {signal: controller.signal}));
      const result = await Promise.race([readerPromise, new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject({code: 'timeout'}), {once: true}))]);
      const receivedAt = iso(now());
      if (!result || !Array.isArray(result.metrics) || (result.removedKeys != null && !Array.isArray(result.removedKeys))) throw {code: 'invalid_data'};
      let normalized;
      try {normalized = result.metrics.map(metric => normalizeMetric(metric, receivedAt, !!result.passive));}
      catch {throw {code: 'invalid_data'};}
      const seen = new Set();
      for (const metric of normalized) {const id = metricKey(metric); if (seen.has(id)) throw {code: 'invalid_data'}; seen.add(id);}
      if (result.removedKeys?.some(id => typeof id !== 'string')) throw {code: 'invalid_data'};
      if (result.removedKeys) for (const id of result.removedKeys) state.metrics.delete(id);
      for (const [id, previous] of state.metrics) if (!seen.has(id)) state.metrics.set(id, {...previous, missing: true});
      for (const metric of normalized) {
        const id = metricKey(metric);
        const previous = state.metrics.get(id);
        if (source.adapter === 'zai' && metric.value == null && previous?.value != null) state.metrics.set(id, {...previous, missing: true});
        else if (result.passive && previous && (metric.snapshotAt && previous.snapshotAt === metric.snapshotAt || !metric.snapshotAt && metric.observedAt && previous.observedAt === metric.observedAt)) state.metrics.set(id, {...previous, missing: false});
        else state.metrics.set(id, {...metric, missing: false});
      }
      state.status = 'ok'; state.safeError = null; state.lastSuccessAt = receivedAt; state.failures = 0; state.retryAfter = null;
      const interval = Math.max(pollMs, source.minIntervalMs ?? 0);
      state.nextAttemptAt = iso(now() - started >= interval ? now() + interval : started + interval);
      state.delayReason = source.minIntervalMs > pollMs ? 'source_interval' : 'regular';
    } catch (error) {
      const failure = safeFailure(error, now());
      state.status = failure.code === 'auth' ? 'auth' : 'error'; state.safeError = failure.code;
      state.failures++;
      const delay = failure.code === 'auth' ? null : failure.retryAfter ?? Math.min(MAX_BACKOFF, pollMs * 2 ** Math.min(state.failures, 5));
      const due = delay == null || !Number.isFinite(delay) || delay > 8.64e15 - now() ? null : iso(now() + delay);
      state.retryAfter = failure.code === 'rate_limited' ? due : null;
      state.nextAttemptAt = due;
      state.delayReason = failure.code === 'auth' ? 'awaiting_retry' : failure.code === 'rate_limited' ? 'retry_after' : 'backoff';
    } finally {clearTimeout(timeout); if (readerPromise) await readerPromise.catch(() => {}); state.busy = false; active--;}
  }
  function tick() {
    for (const account of config.accounts) for (const source of account.sources) {
      const state = states.get(key(account.id, source.id));
      if (active >= concurrency) return;
      if (!state.busy && state.nextAttemptAt && Date.parse(state.nextAttemptAt) <= now()) void attempt(account, source, state);
    }
  }
  function refresh() {
    for (const state of states.values()) if (!state.busy && (state.status === 'auth' || state.delayReason === 'regular' || state.delayReason === 'initial')) {
      state.nextAttemptAt = iso(now()); state.delayReason = 'manual';
    }
    tick();
  }
  function snapshot() {
    const time = now();
    return {locale: config.locale, now: iso(time), accounts: config.accounts.map(account => ({id: account.id, provider: account.provider, label: account.label, sources: account.sources.map(source => {
      const state = states.get(key(account.id, source.id));
      const maxAge = source.staleAfterMs ?? staleMs;
      return {id: source.id, type: source.type, sourceLabel: source.adapter === 'zai' ? 'Z.ai Coding Plan quota' : 'Fictitious demo source', status: state.status, safeError: state.safeError, lastAttemptAt: state.lastAttemptAt, lastSuccessAt: state.lastSuccessAt, nextAttemptAt: state.nextAttemptAt, retryAfter: state.retryAfter, delayReason: state.delayReason, staleAfter: maxAge, busy: state.busy, metrics: [...state.metrics.values()].map(metric => ({...metric, freshness: metric.value == null || !metric.observedAt ? 'unknown' : metric.missing || state.status !== 'ok' || time - Date.parse(metric.observedAt) > maxAge || (metric.window?.resetsAt && time >= Date.parse(metric.window.resetsAt)) ? 'stale' : 'fresh'}))};
    })}))};
  }
  return {tick, refresh, snapshot, start() {tick(); timer = setInterval(tick, 1000);}, stop() {if (timer) clearInterval(timer); timer = null;}};
}
