// Run with Windows Node 24 against a private smoke instance paused with -WaitForCdp.
import assert from 'node:assert/strict';
const port=Number(process.env.MONITOR_WIDGET_PORT ?? 18765);
const base=`http://127.0.0.1:${port}/`;
const readyOnly=process.argv.includes('--ready-only');
const targetsUrl='http://127.0.0.1:18767/json/list';
let target;
for(let i=0;i<60&&!target;i++) {
  try {target=(await fetch(targetsUrl).then(response=>response.json())).find(item=>item.type==='page'&&item.url===base);} catch {}
  if(!target) await new Promise(resolve=>setTimeout(resolve,250));
}
assert.ok(target,'widget renderer must be available over the smoke-only CDP port');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let nextId=0;
const pending=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);}};
function send(method,params={}) {const id=++nextId;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression) {const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
try {
  let readiness;
  for(let i=0;i<60;i++) {
    readiness=await evaluate("(()=>{const el=document.querySelector('.widget-drag'),style=el&&getComputedStyle(el);return {url:location.href,readyState:document.readyState,headers:document.querySelectorAll('#headers th').length,dragDisplay:style?.display,dragHeight:style?.height,dragRegion:style?.webkitAppRegion};})()");
    if(readiness.url===base&&readiness.readyState==='complete'&&readiness.headers===3&&readiness.dragDisplay==='block'&&readiness.dragRegion==='drag'&&parseFloat(readiness.dragHeight)>=18) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(readiness.url===base&&readiness.readyState==='complete'&&readiness.headers===3&&readiness.dragDisplay==='block'&&readiness.dragRegion==='drag'&&parseFloat(readiness.dragHeight)>=18,`widget renderer not ready: ${JSON.stringify(readiness)}`);
  console.log(`widget_ready=${JSON.stringify(readiness)}`);
  if(!readyOnly) {
  assert.deepEqual(await evaluate("[typeof window.require,typeof window.process,typeof window.electron]"),['undefined','undefined','undefined']);
  assert.equal(await evaluate("window.open('https://example.com/') === null"),true);
  assert.equal((await fetch('http://127.0.0.1:18767/json/list').then(response=>response.json())).filter(item=>item.type==='page').length,1);
  for(const url of [`http://127.0.0.1:${port}/other`,`http://127.0.0.1:${port}/?q=1`,`http://localhost:${port}/`,`http://user@127.0.0.1:${port}/`,'https://example.com/']) {
    await evaluate(`try { location.href=${JSON.stringify(url)}; } catch {}`);
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await evaluate('location.href'),base,`blocked navigation: ${url}`);
  }
  assert.equal(await evaluate("document.querySelectorAll('#headers th').length"),3);
  console.log('Electron renderer isolation and navigation check passed');
  }
} finally {socket.close();}
