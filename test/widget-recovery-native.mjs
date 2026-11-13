// Isolated Windows Electron recovery proof. Node 25; no production server or credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,cpSync,copyFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const [repo,electronExe]=process.argv.slice(2);
assert.ok(repo&&electronExe,'usage: node widget-recovery-native.mjs WINDOWS_REPO_PATH ELECTRON_EXE');
const work=mkdtempSync(path.join(tmpdir(),'monitor-w5-native-'));
copyFileSync(path.join(repo,'package.json'),path.join(work,'package.json'));
cpSync(path.join(repo,'desktop'),path.join(work,'desktop'),{recursive:true});
console.log(`isolated_work=${work}`);
const port=18765, base=`http://127.0.0.1:${port}/`, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=async()=>{const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const number=server.address().port;await new Promise(resolve=>server.close(resolve));return number;};
let server, reads=0, refreshes=0, child, second, socket, stderr='';
const snapshot=()=>{const now=new Date().toISOString();return {locale:'en',accounts:[{id:'demo',provider:'Demo',label:'Fictitious account',sources:[{id:'plan',type:'subscription',sourceLabel:'Fictitious demo source',status:'ok',pollIntervalMs:10000,lastSuccessAt:now,metrics:[{key:'remaining',name:'Fictitious remaining',kind:'percent',value:50,observedAt:now,freshness:'fresh',window:{id:'5h',label:'5h',resetsAt:new Date(Date.now()+3600000).toISOString()}}]}]}]};};
async function startFixture(){
  server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.headers.host!==`127.0.0.1:${port}` || (req.method==='POST'&&req.headers.origin!==base.slice(0,-1))){res.writeHead(403).end();return;}
    if(req.url==='/api/state'){reads++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));return;}
    if(req.url==='/api/refresh'&&req.method==='POST'){refreshes++;res.end('{}');return;}
    const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[req.url];
    if(!file){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(readFileSync(path.join(repo,'public',file)));
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
}
async function stopFixture(){if(server){await new Promise(resolve=>server.close(resolve));server=null;}}
const isStopped=()=>child?.exitCode!==null||child?.signalCode!==null;
async function stopElectron(){
  socket?.close();socket=null;
  if(second&&second.exitCode===null&&second.signalCode===null) second.kill();
  if(child&&!isStopped()) child.kill();
  if(child&&!isStopped()) await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(5000)]);
  assert.ok(!child||isStopped(),`own Electron PID ${child?.pid} did not exit: ${stderr}`);
}
let nextId=0;const pending=new Map();
async function evaluate(expression){
  const id=++nextId;
  const result=await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const moduleExpression=`process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(work,'package.json'))})('electron')`;
const main=expression=>evaluate(`(()=>{const e=${moduleExpression};const w=e.BrowserWindow.getAllWindows()[0];return ${expression};})()`);
const renderer=expression=>main(`w?.webContents.executeJavaScript(${JSON.stringify(expression)})`);
async function until(label,check,limit=15000){
  const start=Date.now();
  while(Date.now()-start<limit){const value=await check();if(value)return Date.now()-start;await wait(250);}
  throw Error(`${label} timed out`);
}
try {
  const inspectorPort=await freePort();
  child=spawn(electronExe,[`--inspect=127.0.0.1:${inspectorPort}`,work],{env:{...process.env,ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT:String(port),MONITOR_WIDGET_USER_DATA:path.join(work,'profile')},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
  let target;
  await until('main inspector',async()=>{if(isStopped())throw Error(`Electron exited early: ${stderr}`);try{target=(await fetch(`http://127.0.0.1:${inspectorPort}/json/list`).then(r=>r.json()))[0];}catch{}return target?.webSocketDebuggerUrl;});
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);}};
  const initialMs=await until('offline window',async()=>{const state=await main("w&&{count:e.BrowserWindow.getAllWindows().length,url:w.webContents.getURL()}");return state?.count===1&&state.url.startsWith('file:')&&state.url.endsWith('/offline.html');});
  assert.match(await renderer('document.body.innerText'),/Waiting for local server/);
  second=spawn(electronExe,[work],{env:{...process.env,ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT:String(port),MONITOR_WIDGET_USER_DATA:path.join(work,'profile')},stdio:'ignore'});
  await Promise.race([new Promise(resolve=>second.once('exit',resolve)),wait(5000)]);
  assert.equal(second.exitCode,0,'second launch did not exit cleanly');
  assert.equal(await main('e.BrowserWindow.getAllWindows().length'),1);
  for(const candidate of ['https://example.com/',`http://127.0.0.1:${port}/other`,'file:///C:/Windows/win.ini']) {
    await renderer(`location.href=${JSON.stringify(candidate)}`);await wait(150);
    assert.ok((await main('w.webContents.getURL()')).endsWith('/offline.html'),`offline navigation blocked: ${candidate}`);
  }
  await startFixture();
  const startupMs=await until('initial server recovery',async()=>await main('w.webContents.getURL()')===base,15000);
  await until('initial fresh rows',async()=>await renderer("document.querySelectorAll('#rows td.fresh').length")>0);
  assert.equal(await renderer("fetch('/api/refresh',{method:'POST'}).then(response=>response.status)"),200);
  assert.equal(refreshes,1);
  for(const candidate of [`http://127.0.0.1:${port}/other`,'file:///C:/Windows/win.ini']) {
    await renderer(`location.href=${JSON.stringify(candidate)}`);await wait(150);
    assert.equal(await main('w.webContents.getURL()'),base,`online navigation blocked: ${candidate}`);
  }
  await stopFixture();
  const lossMs=await until('explicit offline stale state',async()=>await renderer("Boolean(document.querySelector('#connection:not([hidden])')) && document.querySelectorAll('#rows td.fresh').length===0 && document.querySelectorAll('#rows td.stale').length>0"),6000);
  assert.equal(await main('e.BrowserWindow.getAllWindows().length'),1);
  await startFixture();
  const recoveryMs=await until('server return',async()=>await renderer("Boolean(document.querySelector('#connection[hidden]')) && document.querySelectorAll('#rows td.fresh').length>0"),6000);
  await stopFixture();
  await until('second offline state',async()=>await renderer("Boolean(document.querySelector('#connection:not([hidden])'))"),6000);
  const beforeResume=reads;
  await startFixture();
  await main("e.powerMonitor.emit('resume');true");
  const resumeMs=await until('simulated resume refresh',async()=>reads>beforeResume && await renderer("Boolean(document.querySelector('#connection[hidden]'))"),6000);
  assert.equal(await main('e.BrowserWindow.getAllWindows().length'),1);
  console.log(JSON.stringify({result:'pass',initialOfflineMs:initialMs,lateStartMs:startupMs,lossMs,recoveryMs,simulatedResumeMs:resumeMs,windows:1,fixtureReads:reads,fixtureRefreshes:refreshes}));
  await main('(()=>{setTimeout(()=>e.app.exit(0),0);return true;})()');
  socket.close();socket=null;
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(5000)]);
  assert.equal(child.exitCode,0,`own Electron PID ${child.pid} exit: ${stderr}`);
} finally {await stopFixture();await stopElectron();}
