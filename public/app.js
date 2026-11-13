const words = {
  en: {offline:'Local server unavailable. Reconnecting… Previously shown values are stale.',eyebrow:'● LOCAL / RESOURCE MONITOR',title:'Resource monitor',subtitle:'Local view · demo sources are fictitious',zaiOnly:'Z.ai Coding Plan configured · read status shown per resource',mixedSources:'Z.ai Coding Plan configured · demo sources are fictitious',codexOnly:'Codex ChatGPT quota configured · read status shown per resource',liveSources:'Live sources configured · read status shown per resource',mixedCodex:'Codex configured · demo sources are fictitious',allSources:'Live sources configured · demo sources are fictitious',codexSource:'Codex ChatGPT quota',codexUnknown:'Codex quota (no windows reported; applicability unknown)',codexAuthError:'Sign in to this monitor’s Codex profile, then Refresh.',codexLimit:'Codex limit',primary:'Primary',secondary:'Secondary',filter:'Filter',filterHint:'Provider, account, resource',refresh:'[r] Refresh',hint:'[/] Filter  [Esc] Clear  [Tab] Navigate',account:'Account',resource:'Resource',value:'Remaining / value',reset:'Reset',received:'Observed',state:'State',details:'Selected resource',none:'Select a row for details.',noConfig:'No accounts configured. Copy config.example.json to config.json, edit the accounts, then restart the server.',noResults:'No results',loading:'Loading',fresh:'OK',stale:'STALE',unknown:'Unknown',auth:'Authorization needed',error:'Error',ok:'Read succeeded',unsupported:'Unsupported',source:'Source',unit:'Unit',scope:'Scope',observedAt:'Observed at',receivedAt:'Received at',attemptAt:'Last attempt',successAt:'Last successful read',resetAt:'Reset at',nextAt:'Next attempt',reason:'Delay reason',safeError:'Error',basis:'Observation basis',snapshotAt:'Snapshot at',period:'Period',dataRefreshedAt:'Data refreshed at',subscription:'Subscription',api:'API',demoSource:'Fictitious demo source',zaiSource:'Z.ai Coding Plan quota',zai5h:'5h quota',zaiMcp:'Monthly MCP quota',zaiWeeklyQuota:'Weekly quota',zaiWeekly:'Weekly (not reported; applicability unknown)',monthlyMcp:'Monthly MCP',demoRemaining:'Fictitious remaining',demoBalance:'Fictitious API credits',weekly:'Weekly',never:'Never',notAvailable:'—',inProgress:'Refreshing',idle:'Waiting for next poll',sourceInterval:'Source interval',regular:'Regular 10s poll',initial:'Initial collection',manual:'Manual refresh',retryAfter:'Provider Retry-After',backoff:'Retry backoff',awaitingRetry:'Awaiting manual retry',authError:'Authorization denied; use Refresh to retry.',rateError:'Rate limited by source.',timeoutError:'Source timed out.',invalidError:'Invalid source data.',networkError:'Source unavailable.',requestError:'Could not reach local server.',row:'Resource row',scopeAccount:'Account',responseReceived:'Response received',sourceBasis:'Source timestamp',unknownBasis:'Unknown',fictitious:'FICTITIOUS DEMO',results:'resources',fetchStatus:'Read status',freshness:'Value freshness'},
  ru: {offline:'Локальный сервер недоступен. Повторное подключение… Ранее показанные значения устарели.',eyebrow:'● ЛОКАЛЬНО / МОНИТОР РЕСУРСОВ',title:'Монитор ресурсов',subtitle:'Локальный экран · демонстрационные источники вымышлены',zaiOnly:'Настроен GLM Coding Plan Z.ai · статус чтения указан для ресурса',mixedSources:'Настроен GLM Coding Plan Z.ai · демонстрационные источники вымышлены',codexOnly:'Настроена квота Codex ChatGPT · статус чтения указан для ресурса',liveSources:'Настроены источники · статус чтения указан для ресурса',mixedCodex:'Настроен Codex · демонстрационные источники вымышлены',allSources:'Настроены источники · демонстрационные источники вымышлены',codexSource:'Квота Codex ChatGPT',codexUnknown:'Квота Codex (окна не сообщены; применимость неизвестна)',codexAuthError:'Войди в отдельный профиль Codex монитора, затем нажми «Обновить».',codexLimit:'Лимит Codex',primary:'Основное',secondary:'Дополнительное',filter:'Фильтр',filterHint:'Провайдер, аккаунт, ресурс',refresh:'[r] Обновить',hint:'[/] Фильтр  [Esc] Очистить  [Tab] Навигация',account:'Аккаунт',resource:'Ресурс',value:'Остаток / значение',reset:'Сброс',received:'Получено',state:'Состояние',details:'Выбранный ресурс',none:'Выбери строку для подробностей.',noConfig:'Аккаунты не настроены. Скопируй config.example.json в config.json, измени аккаунты и перезапусти сервер.',noResults:'Ничего не найдено',loading:'Загрузка',fresh:'OK',stale:'STALE',unknown:'Неизвестно',auth:'Нужна авторизация',error:'Ошибка',ok:'Чтение успешно',unsupported:'Не поддерживается',source:'Источник',unit:'Единица',scope:'Область',observedAt:'Время наблюдения',receivedAt:'Время получения',attemptAt:'Последняя попытка',successAt:'Последнее успешное чтение',resetAt:'Время сброса',nextAt:'Следующая попытка',reason:'Причина задержки',safeError:'Ошибка',basis:'Основание наблюдения',snapshotAt:'Снимок',period:'Период',dataRefreshedAt:'Обновление данных',subscription:'Подписка',api:'API',demoSource:'Вымышленный демонстрационный источник',zaiSource:'Квота GLM Coding Plan Z.ai',zai5h:'Лимит 5 ч',zaiMcp:'Месячный лимит MCP',zaiWeeklyQuota:'Недельный лимит',zaiWeekly:'Неделя (источник не сообщает; применимость неизвестна)',monthlyMcp:'Месяц MCP',demoRemaining:'Вымышленный остаток',demoBalance:'Вымышленные API кредиты',weekly:'Неделя',never:'Никогда',notAvailable:'—',inProgress:'Обновление',idle:'Ожидание следующего опроса',sourceInterval:'Интервал источника',regular:'Обычный опрос 10 с',initial:'Первый сбор',manual:'Ручное обновление',retryAfter:'Ожидание по Retry-After провайдера',backoff:'Задержка повтора',awaitingRetry:'Ожидание ручного повтора',authError:'Отказ авторизации; нажми «Обновить» для повтора.',rateError:'Источник ограничил частоту.',timeoutError:'Время ожидания источника истекло.',invalidError:'Некорректные данные источника.',networkError:'Источник недоступен.',requestError:'Нет связи с локальным сервером.',row:'Строка ресурса',scopeAccount:'Аккаунт',responseReceived:'Получение ответа',sourceBasis:'Время источника',unknownBasis:'Неизвестно',fictitious:'ВЫМЫШЛЕННОЕ ДЕМО',results:'ресурсов',fetchStatus:'Статус чтения',freshness:'Свежесть значения'}
};
let data = null, connection = 'online', loading = false;
const $ = id => document.getElementById(id);
const locale = () => (data?.locale ?? document.documentElement.lang) === 'ru' ? 'ru' : 'en';
const t = key => words[locale()][key] ?? words.en[key] ?? key;
const fmt = date => date ? new Intl.DateTimeFormat(locale(), {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(date)) : t('notAvailable');
const num = (value, digits = 2) => new Intl.NumberFormat(locale(), {maximumFractionDigits:digits}).format(value);
function until(date) {
  if (!date) return t('notAvailable');
  const minutes = Math.max(0, Math.ceil((Date.parse(date) - Date.now()) / 60000));
  const ru = locale() === 'ru';
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}${ru ? 'д' : 'd'} ${Math.floor(minutes % 1440 / 60)}${ru ? 'ч' : 'h'}`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}${ru ? 'ч' : 'h'} ${minutes % 60}${ru ? 'мин' : 'm'}`;
  return `${minutes}${ru ? 'мин' : 'm'}`;
}
function resetParts(date) {
  if (!date) return ['', '', t('notAvailable')];
  const minutes = Math.max(0, Math.ceil((Date.parse(date) - Date.now()) / 60000));
  const ru = locale() === 'ru';
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return [days ? `${days}${ru ? 'д' : 'd'}` : '', days || hours ? `${hours}${ru ? 'ч' : 'h'}` : '', `${minutes % 60}${ru ? 'мин' : 'm'}`];
}
function flat() {
  return data.accounts.flatMap(account => account.sources.flatMap(source => source.metrics.length ? source.metrics.map(metric => ({account,source,metric,key:JSON.stringify([account.id,source.id,metric.key,metric.window?.id ?? null])})) : [{account,source,metric:null,key:JSON.stringify([account.id,source.id,null,null])}])).filter(({source,metric}) => source.sourceLabel !== 'Z.ai Coding Plan quota' || metric?.window?.id !== 'monthly_mcp');
}
function metricName(metric) {if(metric?.sourceLabel === 'Codex ChatGPT quota')return metric.name === 'Codex' ? t('codexLimit') : `${t('codexLimit')} ${metric.name.slice(6)}`;if(metric?.sourceLabel === 'Z.ai Coding Plan quota') return t(({'5h':'zai5h',monthly_mcp:'zaiMcp',weekly:metric.window?.durationMinutes === 10080 ? 'zaiWeeklyQuota' : 'zaiWeekly'})[metric.window?.id] ?? 'resource');return metric?.sourceLabel === 'Fictitious demo source' && metric.key === 'balance' ? t('demoBalance') : metric?.sourceLabel === 'Fictitious demo source' && metric.key === 'remaining' ? t('demoRemaining') : metric?.name ?? t('notAvailable');}
function windowName(metric) {if(metric?.sourceLabel === 'Codex ChatGPT quota')return metric.window?.durationMinutes === 10080 ? t('weekly') : metric.window?.durationMinutes === 300 ? locale() === 'ru' ? '5 ч' : '5h' : metric.window?.durationMinutes ? `${metric.window.durationMinutes} ${locale() === 'ru' ? 'мин' : 'min'}` : t(metric.window?.label?.toLowerCase() ?? 'unknown');if(metric?.sourceLabel === 'Z.ai Coding Plan quota')return metric.window?.id === 'monthly_mcp' ? t('monthlyMcp') : metric.window?.id === 'weekly' ? t('weekly') : metric.window?.id === '5h' ? locale() === 'ru' ? '5 ч' : '5h' : metric.window?.label;if(metric?.sourceLabel === 'Fictitious demo source' && metric.window?.id === 'weekly')return t('weekly');return metric?.window?.label ?? null;}
function metricFreshness(metric) {if(!metric||metric.value==null||!metric.observedAt)return 'unknown';if(metric.window?.resetsAt && Date.now()>=Date.parse(metric.window.resetsAt))return 'stale';return metric.freshness;}
function metricStatus(source, metric) {
  if (connection === 'offline') return metric?.value == null ? 'unknown' : 'stale';
  if (source.status === 'auth') return 'auth';
  if (!source.lastSuccessAt) return source.status === 'error' ? 'error' : 'loading';
  if (!metric || metric.value == null || !metric.observedAt) return 'unknown';
  if (metric.kind === 'unsupported') return 'unsupported';
  if (source.status === 'error' || metric.freshness === 'stale' || metric.missing || (metric.window?.resetsAt && Date.now() >= Date.parse(metric.window.resetsAt)) || Date.now() - Date.parse(source.lastSuccessAt) > 2 * (source.pollIntervalMs ?? 10000)) return 'stale';
  if (metric.freshness === 'unknown') return 'unknown';
  return 'fresh';
}
function metricValue(metric) {
  if (!metric || metric.value == null) return t('notAvailable');
  if (metric.kind === 'text') return metric.value;
  if (metric.kind === 'balance' || metric.currency) return new Intl.NumberFormat(locale(), {style:'currency',currency:metric.currency,maximumFractionDigits:2}).format(metric.value);
  return num(metric.value) + (metric.kind === 'percent' ? '%' : metric.unit ? ` ${metric.unit}` : '');
}
function cell(tr, content, className) {const td = tr.insertCell(); if (className) td.className = className; td.textContent = content; return td;}
function render() {
  if (!data) return;
  document.documentElement.lang=locale();document.title=t('title');
  const visible=flat(), tbody=$('rows'), headers=$('headers');
  headers.replaceChildren();for(const name of ['resource','value','reset']) {const th=document.createElement('th');th.scope='col';th.textContent=t(name);headers.append(th);}
  tbody.replaceChildren();
  for(const row of visible) {
    const {account,source,metric}=row, tr=tbody.insertRow();
    const palette=['#68bfa6','#a990cb','#d2a27e','#77a9d1','#c28c9d','#a6b47b','#8bb7b6','#bda582'];
    const color=account.color ?? palette[data.accounts.findIndex(a=>a.id===account.id)%palette.length];tr.style.setProperty('--account-color',color);
    const resource=metric?.window ? windowName(metric) : metric ? metricName(metric) : source.sourceLabel === 'Z.ai Coding Plan quota' ? t('zaiSource') : source.sourceLabel === 'Codex ChatGPT quota' ? source.status === 'ok' ? t('codexUnknown') : t('codexSource') : t('demoSource');
    const status=metricStatus(source,metric), resourceCell=cell(tr,`${account.provider} / ${resource}`,`account ${status}`);
    resourceCell.title=t(status); resourceCell.setAttribute('aria-label',`${account.provider} / ${resource}: ${t(status)}`);
    const valueCell=cell(tr,metricValue(metric),status);
    if(metric?.kind==='percent' && metric.value != null){const bar=document.createElement('span');bar.className='bar';bar.setAttribute('aria-hidden','true');const fill=document.createElement('span');fill.style.setProperty('--fill',`${metric.value}%`);bar.append(fill);const content=document.createElement('div'), value=document.createElement('span');content.className='value-content';value.textContent=valueCell.textContent;content.append(bar,value);valueCell.replaceChildren(content);}
    const resetCell=cell(tr,'','small');
    const resetGrid=document.createElement('div');resetGrid.className='reset-grid';
    for(const part of resetParts(metric?.window?.resetsAt)){const span=document.createElement('span');span.textContent=part;resetGrid.append(span);}
    resetCell.append(resetGrid);
    const loginRow=tbody.insertRow(); loginRow.className='account-label'; loginRow.style.setProperty('--account-color',color);
    const login=cell(loginRow,account.label); login.colSpan=3;
  }
  if (!visible.length) { const tr=tbody.insertRow(), td=tr.insertCell(); td.colSpan=3; td.textContent=t('noConfig'); }
}
async function load(){
  if (loading) return;
  loading=true;
  try {
    const response=await fetch('/api/state',{signal:AbortSignal.timeout(1500)});
    if (!response.ok) throw Error();
    data=await response.json();
    connection='online';
    $('connection').hidden=true;
    render();
  } catch {
    connection='offline';
    $('connection').textContent=t('offline');
    $('connection').hidden=false;
    if (data) render();
    else {const rows=$('rows');rows.replaceChildren();const tr=rows.insertRow(),td=tr.insertCell();td.colSpan=3;td.textContent=t('requestError');}
  } finally {loading=false;}
}
load();setInterval(load,2000);setInterval(()=>{if(data)render();},1000);
window.addEventListener('pageshow',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
