// Focused renderer transport check; synthetic snapshots only.
import assert from 'node:assert/strict';
import {chromium} from '/home/itron/.npm-global/lib/node_modules/@playwright/test/index.mjs';
import {createServer} from '../server.mjs';
import {validateConfig} from '../core.mjs';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  for(const locale of ['en','ru']) {
    const config=validateConfig({locale,accounts:[{id:'demo',provider:'Demo',label:'Fictitious',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}]});
    const snapshot=()=>({locale,accounts:[{id:'demo',provider:'Demo',label:'Fictitious',sources:[{id:'plan',type:'subscription',sourceLabel:'Fictitious demo source',status:'ok',pollIntervalMs:10000,lastSuccessAt:new Date().toISOString(),metrics:[{key:'remaining',name:'Fictitious remaining',kind:'percent',value:50,observedAt:new Date().toISOString(),freshness:'fresh',window:{id:'5h',label:'5h',resetsAt:new Date(Date.now()+3600000).toISOString()}}]}]}]});
    const monitor={start(){},stop(){},refresh(){},snapshot};
    let server=createServer(config,{port:0,monitor});
    const {port}=await server.listen();
    const page=await browser.newPage({viewport:{width:600,height:420}});
    try {
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.locator('#rows td.fresh').first().waitFor();
      await page.route('**/api/state',async route=>{await new Promise(resolve=>setTimeout(resolve,3000));await route.abort().catch(()=>{});});
      await page.waitForTimeout(2100);
      await page.locator('#connection:not([hidden])').waitFor({timeout:2500});
      assert.match(await page.locator('#connection').textContent(),locale==='ru'?/Локальный сервер недоступен/:/Local server unavailable/);
      assert.equal(await page.locator('#rows td.fresh').count(),0);
      assert.ok(await page.locator('#rows td.stale').count()>0);
      await page.unroute('**/api/state');
      await server.close();
      server=null;
      await page.waitForTimeout(2200);
      assert.equal(await page.locator('#connection').isVisible(),true);
      server=createServer(config,{port,monitor});
      await server.listen();
      await page.locator('#connection[hidden]').waitFor({state:'attached',timeout:5000});
      await page.locator('#rows td.fresh').first().waitFor();
      console.log(`${locale} renderer: timeout, server loss, stale values, automatic recovery passed`);
    } finally {
      await page.close();
      if(server) await server.close();
    }
  }
} finally {await browser.close();}
