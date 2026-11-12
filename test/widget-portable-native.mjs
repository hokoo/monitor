// Run from Windows Node: verifies the installed portable executable, not source Electron.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const [repo,install]=process.argv.slice(2);
assert.ok(repo&&install,'usage: node widget-portable-native.mjs REPO INSTALL');
const exe=path.join(install,'Resource Monitor.exe');
const appManifest=path.join(install,'resources/app/package.json');
assert.equal(readFileSync(path.join(install,'version'),'utf8').trim(),'45.3.1');
const profile=mkdtempSync(path.join(tmpdir(),'monitor-w6-profile-'));
const port=18765, base=`http://127.0.0.1:${port}/`, name='org.local.resource-monitor.widget';
const runKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValue=()=>{
  try {return execFileSync('reg.exe',['query',runKey,'/v',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split(/\r?\n/).find(line=>line.trimStart().startsWith(`${name} `))?.match(/\s+REG_SZ\s+(.+)$/)?.[1] ?? null;}
  catch(error){if(error.status===1)return null;throw error;}
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=async()=>{const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const number=server.address().port;await new Promise(resolve=>server.close(resolve));return number;};
let server, child, second, restarted, socket, original, touched=false, stderr='', firstPid;
let nextId=0;const pending=new Map();
async function evaluate(expression){
  const id=++nextId;
  const result=await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const moduleExpression=`process.getBuiltinModule('module').createRequire(${JSON.stringify(appManifest)})('electron')`;
const main=expression=>evaluate(`(()=>{const e=${moduleExpression};const w=e.BrowserWindow.getAllWindows()[0];return ${expression};})()`);
const ownItems=()=>main(`e.app.getLoginItemSettings({path:process.execPath,args:[]}).launchItems.filter(i=>i.name===${JSON.stringify(name)})`);
async function until(label,check,limit=15000){
  const start=Date.now();while(Date.now()-start<limit){const value=await check();if(value)return value;await wait(250);}throw Error(`${label} timed out`);
}
async function launch(){
  const inspectorPort=await freePort();
  const proc=spawn(exe,[`--inspect=127.0.0.1:${inspectorPort}`],{env:{...process.env,MONITOR_WIDGET_PORT:String(port),MONITOR_WIDGET_USER_DATA:profile},stdio:['ignore','ignore','pipe']});
  proc.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
  let target;
  await until('inspector',async()=>{if(proc.exitCode!==null)throw Error(`portable exe exited: ${stderr}`);try{target=(await fetch(`http://127.0.0.1:${inspectorPort}/json/list`).then(r=>r.json()))[0];}catch{}return target?.webSocketDebuggerUrl;});
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);}};
  return proc;
}
async function exitCurrent(){
  const proc=child||restarted;
  await main('(()=>{setTimeout(()=>e.app.exit(0),0);return true;})()');
  socket.close();socket=null;
  await Promise.race([new Promise(resolve=>proc.once('exit',resolve)),wait(5000)]);
  assert.equal(proc.exitCode,0,`portable exe exit: ${stderr}`);
  if(child){child=null;}else{restarted=null;}
}
const fixture=()=>http.createServer((req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}` || (req.method==='POST'&&req.headers.origin!==base.slice(0,-1))){res.writeHead(403).end();return;}
  if(req.url==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({locale:'en',accounts:[]}));return;}
  if(req.url==='/api/refresh'&&req.method==='POST'){res.end('{}');return;}
  const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[req.url];
  if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(readFileSync(path.join(repo,'public',file)));
});
try {
  server=fixture();await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
  child=await launch();
  firstPid=child.pid;
  await until('loaded widget',async()=>await main('w?.webContents.getURL()')===base);
  assert.equal(await main('e.BrowserWindow.getAllWindows().length'),1);
  assert.equal((await main('e.app.getPath("userData")')).toLowerCase(),profile.toLowerCase());
  const display=await main('e.screen.getPrimaryDisplay()');
  const initial=await main('w.getBounds()');
  original=await ownItems();
  assert.ok(original.length<=1,'multiple own startup entries already exist');
  const beforeRun=runValue();
  if(beforeRun && beforeRun.toLowerCase()!==`"${exe}"`.toLowerCase()) throw Error('Own login item name has a different executable; refusing to overwrite it');
  await main(`(()=>{globalThis.__w6Menus=[];const original=e.Menu.buildFromTemplate;e.Menu.buildFromTemplate=function(template){globalThis.__w6Menus.push(template);return original.call(this,template)};w.webContents.emit('did-finish-load');return true;})()`);
  await until('startup tray callback',async()=>await main('globalThis.__w6Menus?.at(-1)?.some(item=>item.label==="Open at login")'));
  assert.equal(await main('globalThis.__w6Menus.at(-1).find(item=>item.label==="Open at login").checked'),original[0]?.enabled===true);
  await main('globalThis.__w6Menus.at(-1).find(item=>item.label==="Open at login").click({checked:true});true');
  touched=true;
  const on=await ownItems();
  assert.equal(on.length,1);assert.equal(on[0].path.toLowerCase(),exe.toLowerCase());assert.equal(on[0].enabled,true);
  assert.equal(runValue()?.toLowerCase(),`"${exe}"`.toLowerCase());
  assert.equal(await main('globalThis.__w6Menus.at(-1).find(item=>item.label==="Open at login").checked'),true);
  await main('globalThis.__w6Menus.at(-1).find(item=>item.label==="Open at login").click({checked:false});true');
  assert.deepEqual(await ownItems(),[]);
  assert.equal(runValue(),null);
  if(original[0]) await main(`e.app.setLoginItemSettings(${JSON.stringify({openAtLogin:true,path:original[0].path,args:original[0].args,name,enabled:original[0].enabled})})`);
  assert.deepEqual(await ownItems(),original);
  touched=false;
  second=spawn(exe,[],{env:{...process.env,MONITOR_WIDGET_PORT:String(port),MONITOR_WIDGET_USER_DATA:profile},stdio:'ignore'});
  await Promise.race([new Promise(resolve=>second.once('exit',resolve)),wait(5000)]);
  assert.equal(second.exitCode,0,'second portable launch did not exit');
  assert.equal(await main('e.BrowserWindow.getAllWindows().length'),1);
  assert.deepEqual(await main('w.getBounds()'),initial);
  await exitCurrent();
  writeFileSync(path.join(profile,'widget.json'),JSON.stringify({displayId:display.id,corner:'bottom-left',alwaysOnTop:true}));
  restarted=await launch();
  await until('restarted widget',async()=>await main('w?.webContents.getURL()')===base);
  const bounds=await main('w.getBounds()');
  assert.equal(bounds.x,display.workArea.x);assert.equal(bounds.y,display.workArea.y+display.workArea.height-bounds.height);
  assert.equal(await main('w.isAlwaysOnTop()'),true);
  assert.deepEqual(await ownItems(),original);
  console.log(JSON.stringify({result:'pass',exe,profile,firstPid,secondExitCode:second.exitCode,restartPid:restarted.pid,initial,bounds,startupRestored:true}));
  await exitCurrent();
} finally {
  if(touched && socket){
    try {
      await main(`e.app.setLoginItemSettings(${JSON.stringify(original?.[0]
        ?{openAtLogin:true,path:original[0].path,args:original[0].args,name,enabled:original[0].enabled}
        :{openAtLogin:false,path:exe,args:[],name})})`);
      assert.deepEqual(await ownItems(),original);
    } catch(error){console.error(`Startup restore failed: ${error.message}`);process.exitCode=1;}
  }
  socket?.close();
  for(const proc of [child,second,restarted]) if(proc && proc.exitCode===null && proc.signalCode===null){proc.kill();await Promise.race([new Promise(resolve=>proc.once('exit',resolve)),wait(5000)]);}
  if(server)await new Promise(resolve=>server.close(resolve));
}
