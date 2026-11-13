// Run: node test/browser-check.mjs (uses the preinstalled global Playwright package).
import assert from 'node:assert/strict';
import {chromium} from '/home/itron/.npm-global/lib/node_modules/@playwright/test/index.mjs';
import {createServer} from '../server.mjs';
import {createMonitor, validateConfig} from '../core.mjs';
import {readDemo} from '../demo.mjs';

const fixture = locale => validateConfig({locale, accounts:[
  {id:'one',provider:'Demo provider',label:'First fictitious account',color:'#557799',sources:[{id:'plan',type:'subscription',adapter:'demo'},{id:'api',type:'api',adapter:'demo'}]},
  {id:'two',provider:'Demo provider',label:'Second fictitious account',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}
]});
const rows = page => page.locator('#rows tr:not(.account-label)');
const errors=[];
let browser, app, page;
async function start(config, adapters, monitor) {app=createServer(config,{port:0,adapters,monitor});const address=await app.listen();return `http://127.0.0.1:${address.port}`;}
async function stop() {if(app){if(page && !page.isClosed()) await page.goto('about:blank');await app.close();app=null;}}
async function open(base, count) {await page.goto(base);await page.waitForFunction(n=>document.querySelectorAll('#rows tr:not(.account-label)').length===n,count);}
const config = (locale, provider, adapter) => validateConfig({locale,accounts:[{id:'one',provider,label:'Fictitious account',sources:[{id:'plan',type:'subscription',adapter,authRef:adapter==='zai'?'env:ZAI_BROWSER_MOCK':adapter==='codex'?'local:browser':undefined}]}]});
const source = (id, sourceLabel, status, metrics, now, extras={}) => ({id,type:'subscription',sourceLabel,status,metrics,lastAttemptAt:now,lastSuccessAt:status==='loading'||status==='auth'||status==='error'?null:now,nextAttemptAt:null,safeError:status==='auth'?'auth':status==='error'?'network':null,...extras});
const monitor = (locale, provider, sources, now) => ({start(){},stop(){},refresh(){},snapshot(){return {locale,now,accounts:[{id:'one',provider,label:'Fictitious account',sources}]};}});
try {
  let attempts=0;
  const adapters={demo:async(...args)=>{attempts++;return readDemo(...args);}};
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:600,height:420},locale:'fr-FR'});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});

  let base=await start(fixture('en'),adapters);
  await open(base,5);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.deepEqual(await page.locator('th').allTextContents(),['Resource','Remaining / value','Reset']);
  assert.equal(await page.locator('#rows tr.account-label').count(),5);
  assert.match(await page.locator('#rows').textContent(),/5h/);
  assert.match(await page.locator('#rows').textContent(),/Weekly/);
  assert.match(await page.locator('#rows').textContent(),/First fictitious account/);
  assert.equal(await page.locator('.bar').count(),4);
  assert.equal(await rows(page).first().evaluate(el=>el.style.getPropertyValue('--account-color')),'#557799');
  assert.equal(await rows(page).last().evaluate(el=>el.style.getPropertyValue('--account-color')),'#a990cb');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.deepEqual(await page.evaluate(() => {const now=Date.now();return [resetParts(new Date(now+90000000).toISOString()),resetParts(null)];}),[['1d','1h','0m'],['','','—']]);
  assert.deepEqual(await page.evaluate(() => {
    const now=Date.now(), metric={value:1,observedAt:new Date(now).toISOString(),freshness:'fresh'}, source={status:'ok',pollIntervalMs:10000,lastSuccessAt:new Date(now-19000).toISOString()};
    const status=(s={},m={})=>metricStatus({...source,...s},{...metric,...m});
    return [status(),status({lastSuccessAt:new Date(now-21000).toISOString()}),status({lastSuccessAt:new Date(now-21000).toISOString()},{value:null}),status({lastSuccessAt:new Date(now-21000).toISOString()},{observedAt:null}),status({status:'error'}),status({},{freshness:'stale'}),status({},{freshness:'unknown'}),status({},{window:{resetsAt:new Date(now-1).toISOString()}}),status({status:'auth'}),status({},{kind:'unsupported'}),status({status:'loading',lastSuccessAt:null})];
  }),['fresh','stale','unknown','unknown','stale','stale','unknown','stale','auth','unsupported','loading']);
  await page.screenshot({path:'/tmp/monitor-w3-en.png'});
  const before=attempts;
  const refresh=await page.evaluate(async()=>{const r=await fetch('/api/refresh',{method:'POST'});return r.status;});
  assert.equal(refresh,200);
  for(let i=0;i<20 && attempts===before;i++) await page.waitForTimeout(50);
  assert.ok(attempts>before); // server refresh remains owned by the server
  const second=await browser.newPage();await second.goto(base);await second.waitForSelector('#rows tr');
  const after=attempts;await second.waitForTimeout(250);assert.equal(attempts,after);await second.close();
  await stop();

  base=await start(fixture('ru'),adapters);
  await open(base,5);
  assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  assert.deepEqual(await page.locator('th').allTextContents(),['Ресурс','Остаток / значение','Сброс']);
  assert.match(await page.locator('#rows').textContent(),/Неделя/);
  await page.screenshot({path:'/tmp/monitor-w3-ru.png'});
  await stop();

  base=await start(validateConfig({locale:'en',accounts:[]}),adapters);
  await open(base,1);
  assert.match(await rows(page).first().textContent(),/No accounts configured/);
  await page.route('**/api/state',route=>route.abort());
  await page.reload();
  assert.match(await rows(page).first().textContent(),/Could not reach local server/);
  await page.unroute('**/api/state');
  assert.deepEqual(errors.splice(0).filter(error=>!error.includes('net::ERR_FAILED')),[]);
  await stop();

  base=await start(validateConfig({accounts:[{id:'x',provider:'<img src=x onerror=alert(1)>',label:'Fictitious',sources:[{id:'s',type:'api',adapter:'demo'}]}]}),adapters);
  await open(base,1);
  assert.equal(await page.locator('#rows img').count(),0);
  assert.match(await rows(page).first().textContent(),/<img src=x onerror=alert\(1\)>/);
  await stop();

  const now=new Date().toISOString(), reset=new Date(Date.now()+3600000).toISOString();
  for(const locale of ['en','ru']) {
    let time=Date.now(), reads=0;
    const liveConfig=config(locale,'Demo provider','demo');
    const liveMonitor=createMonitor(liveConfig,{demo:async()=>{
      if(++reads>1) throw Error('synthetic read failure');
      return {passive:true,metrics:[
        {key:'old',name:'Old observation',kind:'percent',scope:'account',value:35,observedAt:new Date(time-600000).toISOString(),sourceLabel:'Fictitious demo source'},
        {key:'current',name:'Current observation',kind:'percent',scope:'account',value:50,observedAt:new Date(time).toISOString(),sourceLabel:'Fictitious demo source'}
      ]};
    }},{now:()=>time,staleMs:60000});
    base=await start(liveConfig,{},liveMonitor);
    await open(base,2);
    assert.deepEqual(liveMonitor.snapshot().accounts[0].sources[0].metrics.map(metric=>metric.freshness),['stale','fresh']);
    assert.deepEqual(await rows(page).locator('td:first-child').evaluateAll(cells=>cells.map(el=>el.classList[1])),['stale','fresh']);
    time+=10000;liveMonitor.tick();
    for(let i=0;i<20 && liveMonitor.snapshot().accounts[0].sources[0].status!=='error';i++) await page.waitForTimeout(20);
    const failed=liveMonitor.snapshot().accounts[0].sources[0];
    assert.equal(failed.status,'error');assert.ok(Date.now()-Date.parse(failed.lastSuccessAt)<20000);
    assert.deepEqual(failed.metrics.map(metric=>metric.freshness),['stale','stale']);
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('#rows tr:not(.account-label)').length===2);
    assert.deepEqual(await rows(page).locator('td:first-child').evaluateAll(cells=>cells.map(el=>el.classList[1])),['stale','stale']);
    assert.match(await rows(page).nth(1).locator('td:first-child').getAttribute('aria-label'),locale==='ru'?/Устарело|STALE/:/STALE/);
    await stop();

    const metric=(value, freshness='fresh')=>({key:'remaining',name:'Fictitious remaining',kind:'percent',value,window:{id:'5h',label:'5h',resetsAt:reset},sourceLabel:'Fictitious demo source',observedAt:now,freshness});
    const states=[source('fresh','Fictitious demo source','ok',[metric(0)],now),source('unknown','Fictitious demo source','ok',[metric(null,'unknown')],now),source('stale','Fictitious demo source','ok',[metric(35,'stale')],now,{lastSuccessAt:new Date(Date.now()-30000).toISOString()}),source('error','Fictitious demo source','error',[],now),source('auth','Fictitious demo source','auth',[],now),source('loading','Fictitious demo source','loading',[],now)];
    base=await start(validateConfig({locale,accounts:[{id:'one',provider:'Demo provider',label:'Fictitious account',sources:states.map(s=>({id:s.id,type:'subscription',adapter:'demo'}))}]}),adapters,monitor(locale,'Demo provider',states,now));
    await open(base,6);
    assert.deepEqual(await rows(page).locator('td:first-child').evaluateAll(cells=>cells.map(el=>el.classList[1])),['fresh','unknown','stale','error','auth','loading']);
    assert.match(await rows(page).nth(4).locator('td:first-child').getAttribute('aria-label'),locale==='ru'?/Нужна авторизация/:/Authorization needed/);
    assert.equal(await rows(page).first().locator('td:nth-child(2)').textContent(),'0%');
    await page.screenshot({path:`/tmp/monitor-w3-states-${locale}.png`});
    await stop();

    for(const status of ['loading','auth','ok']) {
      const metrics=status==='ok'?['5h','monthly_mcp','weekly'].map((id,index)=>({key:'remaining',name:'quota',kind:'percent',value:index===0?0:index===1?70:null,window:{id,label:id,durationMinutes:index===0?300:null,resetsAt:null},sourceLabel:'Z.ai Coding Plan quota',observedAt:now,freshness:index===2?'unknown':'fresh'})):[];
      const state=source('plan','Z.ai Coding Plan quota',status,metrics,now);
      base=await start(config(locale,'Z.ai','zai'),adapters,monitor(locale,'Z.ai',[state],now));
      await open(base,status==='ok'?2:1);
      const text=await rows(page).first().textContent();
      if(status==='ok'){assert.match(text,locale==='ru'?/5 ч/:/5h/);assert.match(text,/0%/);assert.match(await rows(page).nth(1).textContent(),locale==='ru'?/Неделя/:/Weekly/);assert.doesNotMatch(await page.locator('#rows').textContent(),/Monthly MCP|Месячный лимит MCP/);}
      else assert.match(await rows(page).first().locator('td:first-child').getAttribute('aria-label'),status==='auth'?(locale==='ru'?/Нужна авторизация/:/Authorization needed/):(locale==='ru'?/Загрузка/:/Loading/));
      await stop();
    }
    for(const status of ['ok','auth']) {
      const metrics=status==='ok'?[{key:'remaining',name:'Codex',kind:'percent',value:0,window:{id:'abc_primary',label:'5h',durationMinutes:300,resetsAt:reset},sourceLabel:'Codex ChatGPT quota',observedAt:now,freshness:'fresh'}]:[];
      base=await start(config(locale,'Codex','codex'),adapters,monitor(locale,'Codex',[source('plan','Codex ChatGPT quota',status,metrics,now)],now));
      await open(base,1);
      assert.match(await rows(page).first().textContent(),status==='ok'?/0%/:(locale==='ru'?/Квота Codex ChatGPT/:/Codex ChatGPT quota/));
      assert.match(await rows(page).first().locator('td:first-child').getAttribute('aria-label'),status==='auth'?(locale==='ru'?/Нужна авторизация/:/Authorization needed/):/OK/);
      await stop();
    }
  }
  assert.deepEqual(errors,[]);
  console.log('Browser check passed; screenshots: /tmp/monitor-w3-{en,ru,states-en,states-ru}.png');
} finally {await stop();if(browser)await browser.close();}
