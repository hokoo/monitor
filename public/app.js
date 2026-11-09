const words = {
  en: {eyebrow:'● LOCAL / RESOURCE MONITOR',title:'Resource monitor',subtitle:'Local view · demo sources are fictitious',zaiOnly:'Z.ai Coding Plan configured · read status shown per resource',mixedSources:'Z.ai Coding Plan configured · demo sources are fictitious',codexOnly:'Codex ChatGPT quota configured · read status shown per resource',liveSources:'Live sources configured · read status shown per resource',mixedCodex:'Codex configured · demo sources are fictitious',allSources:'Live sources configured · demo sources are fictitious',codexSource:'Codex ChatGPT quota',codexUnknown:'Codex quota (no windows reported; applicability unknown)',codexAuthError:'Sign in to this monitor’s Codex profile, then Refresh.',codexLimit:'Codex limit',primary:'Primary',secondary:'Secondary',filter:'Filter',filterHint:'Provider, account, resource',refresh:'[r] Refresh',hint:'[/] Filter  [Esc] Clear  [Tab] Navigate',account:'Account',resource:'Resource',value:'Remaining / value',reset:'Reset',received:'Observed',state:'State',details:'Selected resource',none:'Select a row for details.',noConfig:'No accounts configured. Copy config.example.json to config.json, edit the accounts, then restart the server.',noResults:'No results',loading:'Loading',fresh:'Current',stale:'Stale',unknown:'Unknown',auth:'Authorization needed',error:'Error',ok:'Read succeeded',unsupported:'Unsupported',source:'Source',unit:'Unit',scope:'Scope',observedAt:'Observed at',receivedAt:'Received at',attemptAt:'Last attempt',successAt:'Last successful read',resetAt:'Reset at',nextAt:'Next attempt',reason:'Delay reason',safeError:'Error',basis:'Observation basis',snapshotAt:'Snapshot at',period:'Period',dataRefreshedAt:'Data refreshed at',subscription:'Subscription',api:'API',demoSource:'Fictitious demo source',zaiSource:'Z.ai Coding Plan quota',zai5h:'5h quota',zaiMcp:'Monthly MCP quota',zaiWeeklyQuota:'Weekly quota',zaiWeekly:'Weekly (not reported; applicability unknown)',monthlyMcp:'Monthly MCP',demoRemaining:'Fictitious remaining',demoBalance:'Fictitious API credits',weekly:'Weekly',never:'Never',notAvailable:'—',inProgress:'Refreshing',idle:'Waiting for next poll',sourceInterval:'Source interval',regular:'Regular 10s poll',initial:'Initial collection',manual:'Manual refresh',retryAfter:'Provider Retry-After',backoff:'Retry backoff',awaitingRetry:'Awaiting manual retry',authError:'Authorization denied; use Refresh to retry.',rateError:'Rate limited by source.',timeoutError:'Source timed out.',invalidError:'Invalid source data.',networkError:'Source unavailable.',requestError:'Could not reach local server.',row:'Resource row',scopeAccount:'Account',responseReceived:'Response received',sourceBasis:'Source timestamp',unknownBasis:'Unknown',fictitious:'FICTITIOUS DEMO',results:'resources',fetchStatus:'Read status',freshness:'Value freshness'},
  ru: {eyebrow:'● ЛОКАЛЬНО / МОНИТОР РЕСУРСОВ',title:'Монитор ресурсов',subtitle:'Локальный экран · демонстрационные источники вымышлены',zaiOnly:'Настроен GLM Coding Plan Z.ai · статус чтения указан для ресурса',mixedSources:'Настроен GLM Coding Plan Z.ai · демонстрационные источники вымышлены',codexOnly:'Настроена квота Codex ChatGPT · статус чтения указан для ресурса',liveSources:'Настроены источники · статус чтения указан для ресурса',mixedCodex:'Настроен Codex · демонстрационные источники вымышлены',allSources:'Настроены источники · демонстрационные источники вымышлены',codexSource:'Квота Codex ChatGPT',codexUnknown:'Квота Codex (окна не сообщены; применимость неизвестна)',codexAuthError:'Войди в отдельный профиль Codex монитора, затем нажми «Обновить».',codexLimit:'Лимит Codex',primary:'Основное',secondary:'Дополнительное',filter:'Фильтр',filterHint:'Провайдер, аккаунт, ресурс',refresh:'[r] Обновить',hint:'[/] Фильтр  [Esc] Очистить  [Tab] Навигация',account:'Аккаунт',resource:'Ресурс',value:'Остаток / значение',reset:'Сброс',received:'Получено',state:'Состояние',details:'Выбранный ресурс',none:'Выбери строку для подробностей.',noConfig:'Аккаунты не настроены. Скопируй config.example.json в config.json, измени аккаунты и перезапусти сервер.',noResults:'Ничего не найдено',loading:'Загрузка',fresh:'Актуально',stale:'Устарело',unknown:'Неизвестно',auth:'Нужна авторизация',error:'Ошибка',ok:'Чтение успешно',unsupported:'Не поддерживается',source:'Источник',unit:'Единица',scope:'Область',observedAt:'Время наблюдения',receivedAt:'Время получения',attemptAt:'Последняя попытка',successAt:'Последнее успешное чтение',resetAt:'Время сброса',nextAt:'Следующая попытка',reason:'Причина задержки',safeError:'Ошибка',basis:'Основание наблюдения',snapshotAt:'Снимок',period:'Период',dataRefreshedAt:'Обновление данных',subscription:'Подписка',api:'API',demoSource:'Вымышленный демонстрационный источник',zaiSource:'Квота GLM Coding Plan Z.ai',zai5h:'Лимит 5 ч',zaiMcp:'Месячный лимит MCP',zaiWeeklyQuota:'Недельный лимит',zaiWeekly:'Неделя (источник не сообщает; применимость неизвестна)',monthlyMcp:'Месяц MCP',demoRemaining:'Вымышленный остаток',demoBalance:'Вымышленные API кредиты',weekly:'Неделя',never:'Никогда',notAvailable:'—',inProgress:'Обновление',idle:'Ожидание следующего опроса',sourceInterval:'Интервал источника',regular:'Обычный опрос 10 с',initial:'Первый сбор',manual:'Ручное обновление',retryAfter:'Ожидание по Retry-After провайдера',backoff:'Задержка повтора',awaitingRetry:'Ожидание ручного повтора',authError:'Отказ авторизации; нажми «Обновить» для повтора.',rateError:'Источник ограничил частоту.',timeoutError:'Время ожидания источника истекло.',invalidError:'Некорректные данные источника.',networkError:'Источник недоступен.',requestError:'Нет связи с локальным сервером.',row:'Строка ресурса',scopeAccount:'Аккаунт',responseReceived:'Получение ответа',sourceBasis:'Время источника',unknownBasis:'Неизвестно',fictitious:'ВЫМЫШЛЕННОЕ ДЕМО',results:'ресурсов',fetchStatus:'Статус чтения',freshness:'Свежесть значения'}
};
let data = null, selected = null, requestError = false;
const $ = id => document.getElementById(id);
const locale = () => data?.locale === 'ru' ? 'ru' : 'en';
const t = key => words[locale()][key] ?? words.en[key] ?? key;
const fmt = date => date ? new Intl.DateTimeFormat(locale(), {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(date)) : t('notAvailable');
const num = (value, digits = 2) => new Intl.NumberFormat(locale(), {maximumFractionDigits:digits}).format(value);
function age(date) {
  if (!date) return t('notAvailable');
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(date))/1000));
  const unit = seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day';
  const amount = unit === 'second' ? seconds : Math.floor(seconds / ({minute:60,hour:3600,day:86400}[unit]));
  return new Intl.RelativeTimeFormat(locale(), {numeric:'auto',style:'short'}).format(-amount, unit);
}
function until(date) {
  if (!date) return t('notAvailable');
  const seconds = Math.floor((Date.parse(date)-Date.now())/1000);
  if (seconds <= 0) return new Intl.RelativeTimeFormat(locale(), {numeric:'auto',style:'short'}).format(-Math.max(1,Math.ceil(-seconds/60)), 'minute');
  const unit = seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day';
  const amount = unit === 'second' ? seconds : Math.ceil(seconds / ({minute:60,hour:3600,day:86400}[unit]));
  return new Intl.RelativeTimeFormat(locale(), {numeric:'auto',style:'short'}).format(amount,unit);
}
function flat() {
  return data.accounts.flatMap(account => account.sources.flatMap(source => source.metrics.length ? source.metrics.map(metric => ({account,source,metric,key:JSON.stringify([account.id,source.id,metric.key,metric.window?.id ?? null])})) : [{account,source,metric:null,key:JSON.stringify([account.id,source.id,null,null])}])).filter(({source,metric}) => source.sourceLabel !== 'Z.ai Coding Plan quota' || metric?.window?.id !== 'monthly_mcp');
}
function filtered(rows) {
  const query = $('filter').value.trim().toLocaleLowerCase(locale());
  return rows.filter(({account,source,metric}) => [account.provider,account.label,t(source.type),metricName(metric),windowName(metric),metric?.key].some(value => String(value ?? '').toLocaleLowerCase(locale()).includes(query)));
}
function metricName(metric) {if(metric?.sourceLabel === 'Codex ChatGPT quota')return metric.name === 'Codex' ? t('codexLimit') : `${t('codexLimit')} ${metric.name.slice(6)}`;if(metric?.sourceLabel === 'Z.ai Coding Plan quota') return t(({'5h':'zai5h',monthly_mcp:'zaiMcp',weekly:metric.window?.durationMinutes === 10080 ? 'zaiWeeklyQuota' : 'zaiWeekly'})[metric.window?.id] ?? 'resource');return metric?.sourceLabel === 'Fictitious demo source' && metric.key === 'balance' ? t('demoBalance') : metric?.sourceLabel === 'Fictitious demo source' && metric.key === 'remaining' ? t('demoRemaining') : metric?.name ?? t('notAvailable');}
function windowName(metric) {if(metric?.sourceLabel === 'Codex ChatGPT quota')return metric.window?.durationMinutes === 300 ? locale() === 'ru' ? '5 ч' : '5h' : metric.window?.durationMinutes ? `${metric.window.durationMinutes} ${locale() === 'ru' ? 'мин' : 'min'}` : t(metric.window?.label?.toLowerCase() ?? 'unknown');if(metric?.sourceLabel === 'Z.ai Coding Plan quota')return metric.window?.id === 'monthly_mcp' ? t('monthlyMcp') : metric.window?.id === 'weekly' ? t('weekly') : metric.window?.label;if(metric?.sourceLabel === 'Fictitious demo source' && metric.window?.id === 'weekly')return t('weekly');return metric?.window?.label ?? null;}
function metricFreshness(metric) {if(!metric||metric.value==null||!metric.observedAt)return 'unknown';if(metric.window?.resetsAt && Date.now()>=Date.parse(metric.window.resetsAt))return 'stale';return metric.freshness;}
function metricStatus(source, metric) {if (!metric) return source.status === 'ok' ? 'unknown' : source.status; if(metric.kind==='unsupported')return 'unsupported';if(source.status==='auth')return 'auth';if(source.status==='error')return 'error';return metricFreshness(metric);}
function statusText(source,metric){const status=metricStatus(source,metric);return metric && (status==='auth'||status==='error') ? `${t(status)} · ${t(metricFreshness(metric))}` : t(status);}
function metricValue(metric) {
  if (!metric || metric.value == null) return t('notAvailable');
  if (metric.kind === 'text') return metric.value;
  if (metric.kind === 'balance' || metric.currency) return new Intl.NumberFormat(locale(), {style:'currency',currency:metric.currency,maximumFractionDigits:2}).format(metric.value);
  return num(metric.value) + (metric.kind === 'percent' ? '%' : metric.unit ? ` ${metric.unit}` : '');
}
function cell(tr, content, className) {const td = tr.insertCell(); if (className) td.className = className; td.textContent = content; return td;}
function detailLine(dl, label, value) {const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value ?? t('notAvailable');dl.append(dt,dd);}
function renderDetails(row) {
  const area=$('details-body');area.replaceChildren();
  if (!row) {area.textContent=t('none');return;}
  const {account,source,metric}=row, dl=document.createElement('dl');
  const lines = [
    [t('account'),`${account.provider} / ${account.label}`],
    [t('resource'),metric ? `${t(source.type)} / ${metricName(metric)}${metric.window ? ` / ${windowName(metric)}` : ''}` : t(source.type)],
    [t('source'),source.sourceLabel === 'Z.ai Coding Plan quota' ? t('zaiSource') : source.sourceLabel === 'Codex ChatGPT quota' ? t('codexSource') : source.sourceLabel === 'Fictitious demo source' ? t('demoSource') : metric?.sourceLabel ?? source.sourceLabel],
    [t('unit'),metric?.currency ?? metric?.unit ?? (metric?.kind === 'percent' ? '%' : t('notAvailable'))],
    [t('scope'),metric?.scope === 'account' ? t('scopeAccount') : metric?.scope],
    [t('fetchStatus'),t(source.status)], [t('freshness'),metric ? t(metricFreshness(metric)) : t('unknown')],
    [t('observedAt'),fmt(metric?.observedAt)], [t('receivedAt'),fmt(metric?.receivedAt)],
    [t('attemptAt'),fmt(source.lastAttemptAt)], [t('successAt'),fmt(source.lastSuccessAt)],
    [t('resetAt'),fmt(metric?.window?.resetsAt)], [t('nextAt'),source.nextAttemptAt ? `${fmt(source.nextAttemptAt)} (${until(source.nextAttemptAt)})` : t('notAvailable')],
    [t('reason'),t(({source_interval:'sourceInterval',regular:'regular',initial:'initial',manual:'manual',retry_after:'retryAfter',backoff:'backoff',awaiting_retry:'awaitingRetry'})[source.delayReason] ?? 'unknown')],
    [t('safeError'),source.safeError ? t(source.safeError === 'auth' && source.sourceLabel === 'Codex ChatGPT quota' ? 'codexAuthError' : ({auth:'authError',rate_limited:'rateError',timeout:'timeoutError',invalid_data:'invalidError',network:'networkError'})[source.safeError] ?? 'networkError') + (source.httpStatus ? ` (HTTP ${source.httpStatus})` : '') : t('notAvailable')],
    [t('basis'),t(({response_received:'responseReceived',source:'sourceBasis',unknown:'unknownBasis'})[metric?.observationBasis] ?? 'unknownBasis')],
    [t('snapshotAt'),fmt(metric?.snapshotAt)], [t('period'),metric?.periodStart || metric?.periodEnd ? `${fmt(metric?.periodStart)} – ${fmt(metric?.periodEnd)}` : t('notAvailable')], [t('dataRefreshedAt'),fmt(metric?.dataRefreshedAt)]
  ];
  for (const [label,value] of lines) detailLine(dl,label,value);
  area.append(dl);
}
function render() {
  if (!data) return;
  document.documentElement.lang=locale();document.title=t('title');
  for (const id of ['eyebrow','title','filter-label','refresh','hint','details-title']) $(id).textContent=t(({eyebrow:'eyebrow',title:'title','filter-label':'filter',refresh:'refresh',hint:'hint','details-title':'details'})[id]);
  const sourceLabels=data.accounts.flatMap(account=>account.sources.map(source=>source.sourceLabel));
  const hasZai=sourceLabels.includes('Z.ai Coding Plan quota'), hasCodex=sourceLabels.includes('Codex ChatGPT quota'), hasDemo=sourceLabels.includes('Fictitious demo source');
  $('subtitle').textContent=t(hasCodex ? hasZai ? hasDemo ? 'allSources' : 'liveSources' : hasDemo ? 'mixedCodex' : 'codexOnly' : hasZai ? hasDemo ? 'mixedSources' : 'zaiOnly' : 'subtitle');
  $('filter').placeholder=t('filterHint');$('filter').setAttribute('aria-label',t('filter'));
  const all=flat(), visible=filtered(all), tbody=$('rows'), headers=$('headers');
  headers.replaceChildren();for(const name of ['account','resource','value','reset','received','state']) {const th=document.createElement('th');th.scope='col';th.textContent=t(name);headers.append(th);}
  const sources=data.accounts.flatMap(account=>account.sources);
  const progress=sources.some(source=>source.busy) ? t('inProgress') : sources.some(source=>source.status==='error'||source.status==='auth') ? t('error') : t('idle');
  $('summary').textContent=requestError ? t('requestError') : `${progress} · ${num(all.length,0)} ${t('results')}`;
  $('empty').hidden=!!visible.length;
  $('empty').textContent=data.accounts.length ? t('noResults') : t('noConfig');
  $('table-scroll').hidden=!visible.length;
  const focused=document.activeElement?.dataset?.rowKey;
  tbody.replaceChildren();
  for(const row of visible) {
    const {account,source,metric,key}=row, tr=tbody.insertRow();tr.tabIndex=0;tr.dataset.rowKey=key;tr.setAttribute('aria-label',`${t('row')}: ${account.label}, ${metricName(metric)}`);
    tr.setAttribute('aria-selected',String(key===selected));if(key===selected)tr.className='active';
    tr.addEventListener('click',()=>select(key));tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(key);}});
    cell(tr,`${key===selected?'▸':' '} ${account.provider} / ${account.label}`,'account');
    cell(tr,`${t(source.type)} / ${metric ? metricName(metric) : source.sourceLabel === 'Z.ai Coding Plan quota' ? t('zaiSource') : source.sourceLabel === 'Codex ChatGPT quota' ? source.status === 'ok' ? t('codexUnknown') : t('codexSource') : t('demoSource')}${metric?.window ? ` / ${windowName(metric)}` : ''}`);
    const status=metricStatus(source,metric), valueCell=cell(tr,metricValue(metric),metric ? metricFreshness(metric) : status);
    if(metric?.kind==='percent' && metric.value != null){const bar=document.createElement('span');bar.className='bar';bar.setAttribute('aria-hidden','true');const fill=document.createElement('span');fill.style.width=`${metric.value}%`;bar.append(fill);valueCell.prepend(bar);}
    cell(tr,metric?.window?.resetsAt ? until(metric.window.resetsAt) : t('notAvailable'),'small');
    cell(tr,metric?.observedAt ? age(metric.observedAt) : t('notAvailable'),'small');
    cell(tr,statusText(source,metric),`status ${status}`);
  }
  if(focused) [...tbody.rows].find(row=>row.dataset.rowKey===focused)?.focus();
  renderDetails(visible.find(row=>row.key===selected) ?? null);
}
function select(key){selected=key;render();}
async function load(){try{const response=await fetch('/api/state');if(!response.ok)throw Error();data=await response.json();requestError=false;render();}catch{requestError=true;if(data)render();else $('summary').textContent=words.en.requestError;}}
async function refresh(){try{const response=await fetch('/api/refresh',{method:'POST'});if(!response.ok)throw Error();data=await response.json();requestError=false;render();}catch{requestError=true;render();}}
$('refresh').addEventListener('click',refresh);$('filter').addEventListener('input',render);
$('filter').addEventListener('keydown',event=>{if(event.key==='Escape' && !event.ctrlKey && !event.metaKey && !event.altKey){$('filter').value='';render();}});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
  const target=event.target;
  if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target.isContentEditable)return;
  if(event.key==='r'){event.preventDefault();refresh();}
  if(event.key==='/'){event.preventDefault();$('filter').focus();}
  if(event.key==='Escape'){$('filter').value='';render();}
});
load();setInterval(load,2000);setInterval(()=>{if(data)render();},1000);
