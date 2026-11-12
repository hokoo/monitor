const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const main = path.join(__dirname, '../desktop/main.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function boot(port) {
  const profile = mkdtempSync(path.join(tmpdir(), 'monitor-w5-unit-'));
  const app = new EventEmitter();
  app.setName=app.setPath=app.setAppUserModelId=()=>{}; app.getPath=()=>profile; app.requestSingleInstanceLock=()=>true; app.whenReady=()=>Promise.resolve();
  const powerMonitor = new EventEmitter();
  const screen = new EventEmitter();
  const display={id:1,workArea:{x:0,y:0,width:800,height:600}};
  screen.getPrimaryDisplay=()=>display; screen.getAllDisplays=()=>[display];
  const timers=[], windows=[];
  let available=false, navigationFails=false, navigationHangs=false, launches=0, requests=0;
  class BrowserWindow {
    constructor() {
      this.webContents=new EventEmitter(); this.webContents.url='';
      this.webContents.getURL=()=>this.webContents.url;
      this.webContents.setWindowOpenHandler=()=>{};
      this.webContents.insertCSS=()=>Promise.resolve();
      this.webContents.executeJavaScript=()=>Promise.resolve('en');
      windows.push(this);
    }
    on() {} setBounds() {} isAlwaysOnTop() {return false;} hide() {}
    loadFile() {this.webContents.url='file:///offline.html';return Promise.resolve();}
    loadURL(url) {if(navigationFails)return Promise.reject(Error('navigation failed'));if(navigationHangs)return new Promise(()=>{});this.webContents.url=url;return Promise.resolve();}
  }
  class Tray {setToolTip() {} setContextMenu() {} on() {}}
  const electron={app,BrowserWindow,Tray,Menu:{setApplicationMenu() {},buildFromTemplate:items=>items},nativeImage:{createFromPath:()=>({})},screen,powerMonitor,session:{defaultSession:{setPermissionRequestHandler() {},setPermissionCheckHandler() {}}}};
  const http={get(_url,_options,callback) {requests++;const request=new EventEmitter();queueMicrotask(()=>available ? callback({statusCode:200,destroy() {}}) : request.emit('error',Error('offline')));return request;}};
  const spawn=(_path,_args,options)=>{assert.equal(_path,'C:\\Program Files\\Docker\\Docker\\frontend\\Docker Desktop.exe');assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');launches++;const child=new EventEmitter();child.unref=()=>{};return child;};
  const originalRequire=require('node:module').createRequire(main);
  vm.runInNewContext(readFileSync(main,'utf8'),{require:name=>name==='electron'?electron:name==='node:http'?http:name==='node:child_process'?{spawn}:name==='node:fs'?{...originalRequire(name),statSync:()=>({isFile:()=>true})}:originalRequire(name),__dirname:path.dirname(main),process:{env:{MONITOR_WIDGET_PORT:String(port),MONITOR_WIDGET_USER_DATA:profile},platform:'win32'},URL,AbortSignal,setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:timer=>{const index=timers.indexOf(timer);if(index>=0)timers.splice(index,1);}});
  await tick();
  return {profile,app,powerMonitor,windows,timers,online:()=>{available=true;},offline:()=>{available=false;},failNavigation:()=>{navigationFails=true;},hangNavigation:()=>{navigationHangs=true;},get launches(){return launches;},get requests(){return requests;},async step(){const timer=timers.shift();assert.ok(timer,'retry timer missing');timer.fn();await tick();await tick();}};
}

test('initial failed default-port probe launches trusted Docker once, retries and loads one window', async () => {
  const shell=await boot(8765);
  try {
    assert.equal(shell.windows.length,1);
    assert.deepEqual(shell.timers.map(timer=>timer.delay),[1000]);
    await shell.step(); assert.equal(shell.launches,1);
    assert.deepEqual(shell.timers.map(timer=>timer.delay),[2000]);
    await shell.step(); assert.equal(shell.launches,1);
    shell.online(); await shell.step();
    assert.equal(shell.windows.length,1);
    assert.equal(shell.windows[0].webContents.getURL(),'http://127.0.0.1:8765/');
    assert.equal(shell.timers.length,0);
    shell.powerMonitor.emit('resume'); await tick();
    assert.equal(shell.launches,1);
  } finally {shell.app.emit('before-quit');rmSync(shell.profile,{recursive:true,force:true});}
});

test('nondefault port never launches Docker and retry is capped', async () => {
  const shell=await boot(18765);
  try {
    for(let i=0;i<6;i++) await shell.step();
    assert.equal(shell.launches,0);
    assert.equal(shell.timers[0].delay,10000);
    assert.equal(shell.windows.length,1);
    shell.powerMonitor.emit('resume');
    assert.equal(shell.timers[0].delay,0);
    await shell.step();
    assert.equal(shell.timers[0].delay,1000);
    shell.online(); await shell.step();
    assert.equal(shell.windows[0].webContents.getURL(),'http://127.0.0.1:18765/');
  } finally {shell.app.emit('before-quit');rmSync(shell.profile,{recursive:true,force:true});}
});

test('healthy first probe consumes Docker eligibility even if page navigation fails', async () => {
  const shell=await boot(8765);
  try {
    shell.online();shell.failNavigation();
    await shell.step();
    shell.offline();await shell.step();
    assert.equal(shell.launches,0);
    assert.equal(shell.windows.length,1);
  } finally {shell.app.emit('before-quit');rmSync(shell.profile,{recursive:true,force:true});}
});

test('navigation timeout returns to bounded bootstrap retry', async () => {
  const shell=await boot(18765);
  try {
    shell.online();shell.hangNavigation();await shell.step();
    assert.equal(shell.timers[0].delay,5000);
    await shell.step();
    assert.equal(shell.timers[0].delay,2000);
    assert.equal(shell.windows.length,1);
  } finally {shell.app.emit('before-quit');rmSync(shell.profile,{recursive:true,force:true});}
});
