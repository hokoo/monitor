// Run: node test/browser-check.mjs (uses the preinstalled global Playwright package).
import assert from 'node:assert/strict';
import {chromium} from '/home/itron/.npm-global/lib/node_modules/@playwright/test/index.mjs';
import {createServer} from '../server.mjs';
import {validateConfig} from '../core.mjs';
import {readDemo} from '../demo.mjs';

const fixture = locale => validateConfig({locale,accounts:[
  {id:'one',provider:'Demo provider',label:'First fictitious account',color:'#557799',sources:[{id:'plan',type:'subscription',adapter:'demo'},{id:'api',type:'api',adapter:'demo'}]},
  {id:'two',provider:'Demo provider',label:'Second fictitious account',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}
]});
const errors=[];
let browser, app, page;
async function start(config, adapters, monitor) {app=createServer(config,{port:0,adapters,monitor});const address=await app.listen();return `http://127.0.0.1:${address.port}`;}
async function stop() {if(app){if(page && !page.isClosed()) await page.goto('about:blank');await app.close();app=null;}}
try {
  let attempts=0;
  const adapters={demo:async(...args)=>{attempts++;return readDemo(...args);}};
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({locale:'fr-FR',viewport:{width:1280,height:800}});
  page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  let base=await start(fixture('en'),adapters);
  await page.goto(base);await page.locator('tbody tr').first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===5);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('th').allTextContents().then(a=>a.join('|')),'Account|Resource|Remaining / value|Reset|Observed|State');
  assert.match(await page.locator('#subtitle').textContent(),/fictitious/);
  assert.match(await page.locator('tbody').textContent(),/5h/);
  assert.match(await page.locator('tbody').textContent(),/Weekly/);
  assert.equal(await page.locator('.bar').count(),4);
  assert.equal(await page.locator('tbody tr').first().evaluate(el=>el.style.getPropertyValue('--account-color')),'#557799');
  assert.notEqual(await page.locator('tbody tr').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.locator('tbody tr').first().focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('tbody tr.active').count(),1);
  assert.match(await page.locator('#details-body').textContent(),/Next attempt/);
  assert.match(await page.locator('#details-body').textContent(),/Fictitious demo source/);
  await page.locator('tbody tr.active').focus();
  const rowKey=await page.evaluate(()=>document.activeElement.dataset.rowKey);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.rowKey),rowKey);
  assert.equal(await page.locator('tbody tr.active').getAttribute('data-row-key'),rowKey);
  await page.screenshot({path:'/tmp/monitor-t2-en.png',fullPage:true});
  const beforeTabs=attempts;
  const second=await context.newPage();await second.goto(base);await second.locator('tbody tr').first().waitFor();
  await second.waitForTimeout(250);
  assert.equal(attempts,beforeTabs);
  await second.close();
  await page.locator('#filter').fill('no such resource');
  assert.match(await page.locator('#empty').textContent(),/No results/);
  await page.locator('#filter').press('Escape');
  assert.equal(await page.locator('#filter').inputValue(),'');
  assert.equal(await page.locator('tbody tr').count(),5);
  await page.locator('#filter').fill('First fictitious');
  assert.equal(await page.locator('tbody tr.active').getAttribute('data-row-key'),rowKey);
  await page.locator('#refresh').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#filter').inputValue(),'First fictitious');
  assert.equal(await page.locator('tbody tr.active').getAttribute('data-row-key'),rowKey);
  await page.locator('#filter').press('Escape');
  await page.locator('#refresh').focus();
  const beforeRefresh=attempts;await page.keyboard.press('r');
  for(let i=0;i<20 && attempts===beforeRefresh;i++) await page.waitForTimeout(50);
  assert.ok(attempts>beforeRefresh);
  await page.locator('#filter').focus();const inputBefore=attempts;await page.keyboard.press('r');
  assert.equal(attempts,inputBefore);
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true})));
  assert.equal(attempts,inputBefore);
  await page.locator('#refresh').focus();await page.keyboard.press('/');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'filter');
  await page.locator('#refresh').focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'table-scroll');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'TR');
  await page.locator('tbody tr').last().focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'details');
  await page.setViewportSize({width:390,height:760});
  assert.equal(await page.locator('#table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),true);
  await page.screenshot({path:'/tmp/monitor-t2-narrow.png',fullPage:true});
  await stop();
  base=await start(fixture('ru'),adapters);
  await page.goto(base);await page.locator('tbody tr').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  assert.equal(await page.locator('th').allTextContents().then(a=>a.join('|')),'Аккаунт|Ресурс|Остаток / значение|Сброс|Получено|Состояние');
  assert.match(await page.locator('tbody').textContent(),/Неделя/);
  await page.locator('#filter').fill('Неделя');assert.equal(await page.locator('tbody tr').count(),2);
  await page.locator('#filter').press('Escape');
  await page.setViewportSize({width:1280,height:800});
  await page.screenshot({path:'/tmp/monitor-t2-ru.png',fullPage:true});
  await stop();
  base=await start(validateConfig({locale:'en',accounts:[]}),adapters);
  await page.goto(base);assert.match(await page.locator('#empty').textContent(),/No accounts configured/);
  await stop();
  base=await start(validateConfig({accounts:[{id:'x',provider:'<img src=x onerror=alert(1)>',label:'Fictitious',sources:[{id:'s',type:'api',adapter:'demo'}]}]}),adapters);
  await page.goto(base);await page.locator('tbody tr').first().waitFor();
  assert.equal(await page.locator('tbody img').count(),0);
  assert.match(await page.locator('tbody').textContent(),/<img src=x onerror=alert\(1\)>/);
  await stop();
  const now=new Date().toISOString(), reset=new Date(Date.now()+3600000).toISOString();
  const statusIds=['fresh','unknown','stale','error','auth'];
  const statusConfig=locale=>validateConfig({locale,accounts:[{id:'states',provider:'Demo provider',label:'Fictitious status examples',sources:statusIds.map(id=>({id,type:'subscription',adapter:'demo'}))}]});
  const statusSource=(id,index)=>({id,type:'subscription',sourceLabel:'Fictitious demo source',status:index===3?'error':index===4?'auth':'ok',safeError:index===3?'rate_limited':index===4?'auth':null,lastAttemptAt:now,lastSuccessAt:now,nextAttemptAt:index===3?reset:index===4?null:reset,retryAfter:index===3?reset:null,delayReason:index===3?'retry_after':index===4?'awaiting_retry':'regular',staleAfter:180000,busy:false,metrics:[{key:'remaining',name:'Fictitious remaining',kind:'percent',scope:'account',unit:null,currency:null,value:index===1?null:index===0?0:index===2?35:index===3?25:50,window:{id:'5h',label:'5h',durationMinutes:300,resetsAt:reset},observedAt:now,observationBasis:'source',receivedAt:now,snapshotAt:null,periodStart:null,periodEnd:null,dataRefreshedAt:null,sourceLabel:'Fictitious demo source',freshness:index===1?'unknown':index>1?'stale':'fresh'}]});
  const statusMonitor=locale=>({start(){},stop(){},refresh(){},snapshot(){return {locale,now,accounts:[{id:'states',provider:'Demo provider',label:'Fictitious status examples',sources:statusIds.map(statusSource)}]};}});
  base=await start(statusConfig('en'),adapters,statusMonitor('en'));
  await page.goto(base);await page.locator('tbody tr').last().waitFor();
  assert.deepEqual(await page.locator('tbody tr td:last-child').allTextContents(),['Current','Unknown','Stale','Error · Stale','Authorization needed · Stale']);
  assert.equal(await page.locator('tbody tr').nth(3).locator('td').nth(2).getAttribute('class'),'stale');
  await page.screenshot({path:'/tmp/monitor-t2-states.png',fullPage:true});
  await stop();
  base=await start(statusConfig('ru'),adapters,statusMonitor('ru'));
  await page.goto(base);await page.locator('tbody tr').last().waitFor();
  assert.deepEqual(await page.locator('tbody tr td:last-child').allTextContents(),['Актуально','Неизвестно','Устарело','Ошибка · Устарело','Нужна авторизация · Устарело']);
  await page.locator('tbody tr').nth(3).click();
  assert.match(await page.locator('#details-body').textContent(),/Ожидание по Retry-After провайдера/);
  await page.screenshot({path:'/tmp/monitor-t2-states-ru.png',fullPage:true});
  await stop();
  for (const locale of ['en','ru']) for (const [status,mixed] of [['loading',true],['auth',false],['ok',true]]) {
    const zaiConfig=validateConfig({locale,accounts:[
      {id:'glm',provider:'Z.ai',label:'GLM account',sources:[{id:'plan',type:'subscription',adapter:'zai',authRef:'env:ZAI_BROWSER_MOCK'}]},
      ...(mixed?[{id:'demo',provider:'Demo provider',label:'Fictitious',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}]:[])
    ]});
    const zaiMetrics=status==='ok'?[...['5h','monthly_mcp','weekly'].map((id,index)=>({key:'remaining',name:index===0?'5h quota':index===1?'Monthly MCP quota':'Weekly (not reported; applicability unknown)',kind:'percent',scope:'account',value:index===0?0:index===1?70:null,window:{id,label:id,durationMinutes:index===0?300:null,resetsAt:null},sourceLabel:'Z.ai Coding Plan quota',observedAt:now,observationBasis:'response_received',receivedAt:now,periodStart:null,periodEnd:null,dataRefreshedAt:null,freshness:index===2?'unknown':'fresh'}))]:[];
    const zaiState={id:'plan',type:'subscription',sourceLabel:'Z.ai Coding Plan quota',status,safeError:status==='auth'?'auth':null,lastAttemptAt:now,lastSuccessAt:status==='ok'?now:null,nextAttemptAt:status==='auth'?null:reset,retryAfter:null,delayReason:status==='auth'?'awaiting_retry':'initial',staleAfter:180000,busy:status==='loading',metrics:zaiMetrics};
    const demoState={...zaiState,sourceLabel:'Fictitious demo source',status:'loading',safeError:null,metrics:[]};
    const mock={start(){},stop(){},refresh(){},snapshot(){return {locale,now,accounts:[{id:'glm',provider:'Z.ai',label:'GLM account',sources:[zaiState]},...(mixed?[{id:'demo',provider:'Demo provider',label:'Fictitious',sources:[demoState]}]:[])]};}};
    base=await start(zaiConfig,adapters,mock);
    await page.goto(base);await page.locator('tbody tr').first().waitFor();
    const subtitle=await page.locator('#subtitle').textContent();
    assert.match(subtitle,locale==='ru'?/Настроен GLM Coding Plan/:/Z.ai Coding Plan configured/);
    assert.equal(subtitle.includes(locale==='ru'?'вымышлены':'fictitious'),mixed);
    const firstRow=page.locator('tbody tr').first();
    assert.match(await firstRow.textContent(),locale==='ru'?/Подписка/:/Subscription/);
    if(status==='loading'||status==='auth') {
      assert.match(await firstRow.textContent(),locale==='ru'?/Квота GLM Coding Plan Z.ai/:/Z.ai Coding Plan quota/);
      assert.match(await firstRow.textContent(),status==='auth'?(locale==='ru'?/Нужна авторизация/:/Authorization needed/):(locale==='ru'?/Загрузка/:/Loading/));
    } else {
      assert.match(await firstRow.textContent(),locale==='ru'?/Лимит 5 ч/:/5h quota/);
      assert.match(await firstRow.textContent(),/0%/);
      assert.match(await page.locator('tbody').textContent(),locale==='ru'?/применимость неизвестна/:/applicability unknown/);
      assert.doesNotMatch(await page.locator('tbody').textContent(),/Monthly MCP|Месячный лимит MCP/);
    }
    await firstRow.click();
    assert.match(await page.locator('#details-body').textContent(),locale==='ru'?/Квота GLM Coding Plan Z.ai/:/Z.ai Coding Plan quota/);
    if (status === 'ok') {
      const weekly = zaiMetrics[2];
      Object.assign(weekly, {name:'Weekly quota',value:76,freshness:'fresh'});
      Object.assign(weekly.window, {durationMinutes:10080,resetsAt:reset});
      await page.reload(); await page.locator('tbody tr').nth(1).waitFor();
      assert.match(await page.locator('tbody tr').nth(1).textContent(),locale==='ru'?/Недельный лимит/:/Weekly quota/);
      assert.match(await page.locator('tbody tr').nth(1).textContent(),/76%/);
      Object.assign(zaiState, {status:'error',safeError:'network',httpStatus:502});
      await page.reload(); await page.locator('tbody tr').first().click();
      assert.match(await page.locator('#details-body').textContent(),/HTTP 502/);
    }
    await stop();
  }
  for (const locale of ['en','ru']) for (const mode of ['ok','empty','auth']) {
    const codexConfig=validateConfig({locale,accounts:[
      {id:'codex',provider:'Codex',label:'Private profile',sources:[{id:'plan',type:'subscription',adapter:'codex',authRef:'local:browser'}]},
      {id:'demo',provider:'Demo provider',label:'Fictitious',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}
    ]});
    const metric={key:'remaining',name:'Codex',kind:'percent',scope:'account',value:0,window:{id:'abc_primary',label:'5h',durationMinutes:300,resetsAt:reset},sourceLabel:'Codex ChatGPT quota',observedAt:now,observationBasis:'response_received',receivedAt:now,freshness:'fresh'};
    const codexState={id:'plan',type:'subscription',sourceLabel:'Codex ChatGPT quota',status:mode==='auth'?'auth':'ok',safeError:mode==='auth'?'auth':null,lastAttemptAt:now,lastSuccessAt:mode==='auth'?null:now,nextAttemptAt:mode==='auth'?null:reset,retryAfter:null,delayReason:mode==='auth'?'awaiting_retry':'regular',staleAfter:180000,busy:false,metrics:mode==='ok'?[metric]:[]};
    const demoState={...codexState,sourceLabel:'Fictitious demo source',status:'loading',safeError:null,metrics:[]};
    const mock={start(){},stop(){},refresh(){},snapshot(){return {locale,now,accounts:[{id:'codex',provider:'Codex',label:'Private profile',sources:[codexState]},{id:'demo',provider:'Demo provider',label:'Fictitious',sources:[demoState]}]};}};
    base=await start(codexConfig,adapters,mock);
    await page.goto(base);await page.locator('tbody tr').first().waitFor();
    assert.match(await page.locator('#subtitle').textContent(),locale==='ru'?/демонстрационные источники вымышлены/:/demo sources are fictitious/);
    const row=page.locator('tbody tr').first();
    if(mode==='ok') {assert.match(await row.textContent(),locale==='ru'?/5 ч/:/5h/);assert.match(await row.textContent(),/0%/);}
    if(mode==='empty') {assert.match(await row.textContent(),locale==='ru'?/применимость неизвестна/:/applicability unknown/);assert.match(await row.textContent(),locale==='ru'?/Неизвестно/:/Unknown/);}
    if(mode==='auth') {assert.match(await row.textContent(),locale==='ru'?/Нужна авторизация/:/Authorization needed/);await row.click();assert.match(await page.locator('#details-body').textContent(),locale==='ru'?/отдельный профиль Codex/:/monitor’s Codex profile/);}
    await stop();
  }
  assert.deepEqual(errors,[]);
  console.log('Browser check passed; screenshots: /tmp/monitor-t2-en.png, /tmp/monitor-t2-narrow.png, /tmp/monitor-t2-ru.png, /tmp/monitor-t2-states.png, /tmp/monitor-t2-states-ru.png');
} finally {await stop();if(browser)await browser.close();}
