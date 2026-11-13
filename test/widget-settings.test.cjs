const assert = require('node:assert/strict');
const {test} = require('node:test');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const main = path.join(__dirname, '../desktop/main.cjs');
const mainRequire = createRequire(main);
const primary = {id: 11, workArea: {x: 0, y: 40, width: 1440, height: 860}};
const left = {id: 22, workArea: {x: -1280, y: -80, width: 1200, height: 700}};
const portableExe='C:\\Program Files\\Resource Monitor\\Resource Monitor.exe';

async function boot(profile, displays, loginItems) {
  const app = new EventEmitter();
  app.setName = app.setPath = () => {};
  app.setAppUserModelId = () => {};
  app.isPackaged = Boolean(loginItems);
  app.getLoginItemSettings = () => ({launchItems:loginItems?.filter(item=>item.path===portableExe)});
  app.setLoginItemSettings = ({name,path,args,openAtLogin}) => {
    const index=loginItems.findIndex(item=>item.name===name);
    if(index>=0) loginItems.splice(index,1);
    if(openAtLogin) loginItems.push({name,path,args,scope:'user',enabled:true});
  };
  app.getPath = () => profile;
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  const screen = new EventEmitter();
  screen.displays = displays;
  screen.getAllDisplays = () => screen.displays;
  screen.getPrimaryDisplay = () => screen.displays[0];
  const windows = [];
  class BrowserWindow {
    constructor(options) {
      this.bounds = {x: options.x, y: options.y, width: options.width, height: options.height};
      this.topmost = options.alwaysOnTop;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.loadURL = () => Promise.resolve();
      this.webContents.getURL = () => 'http://127.0.0.1:18765/';
      this.webContents.insertCSS = () => Promise.resolve();
      this.webContents.executeJavaScript = () => Promise.resolve('ru');
      windows.push(this);
    }
    on() {}
    loadURL() {return Promise.resolve();}
    loadFile() {return Promise.resolve();}
    setBounds(bounds) {this.bounds = bounds;}
    isAlwaysOnTop() {return this.topmost;}
    setAlwaysOnTop(value) {this.topmost = value;}
  }
  class Tray {setToolTip() {} setContextMenu(menu) {this.menu = menu;} on() {}}
  const trays = [];
  const electron = {app, BrowserWindow, Tray:class extends Tray {constructor(...args) {super(...args); trays.push(this);}},
    Menu:{setApplicationMenu() {}, buildFromTemplate:items=>items}, nativeImage:{createFromPath:()=>({})}, screen,
    session:{defaultSession:{setPermissionRequestHandler() {},setPermissionCheckHandler() {}}},powerMonitor:new EventEmitter()};
  const requireMock=name=>name==='electron'?electron:name==='node:child_process'?{execFileSync:()=>{
    const item=loginItems?.find(value=>value.name==='org.local.resource-monitor.widget');
    if(!item)throw Object.assign(Error('not found'),{status:1});
    return `    ${item.name}    REG_SZ    "${item.path}"\r\n`;
  }}:mainRequire(name);
  vm.runInNewContext(readFileSync(main,'utf8'),{require:requireMock,__dirname:path.dirname(main),process:{env:{ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT:'18765',MONITOR_WIDGET_USER_DATA:profile},platform:loginItems?'win32':'linux',execPath:portableExe},URL,setTimeout:()=>0,clearTimeout:()=>{}});
  await new Promise(resolve=>setImmediate(resolve));
  return {screen, win:windows[0], tray:trays[0], app};
}

test('tray selection persists display, corner and topmost across removal, return and restart', async () => {
  const profile=mkdtempSync(path.join(tmpdir(),'monitor-w4-settings-'));
  const saved=()=>JSON.parse(readFileSync(path.join(profile,'widget.json'),'utf8'));
  try {
    const shell=await boot(profile,[primary,left]);
    assert.deepEqual(saved(),{displayId:11,corner:'top-right'});
    shell.tray.menu.find(item=>item.label==='Display').submenu.find(item=>item.label.includes('(22)')).click();
    shell.tray.menu.find(item=>item.label==='Corner').submenu.find(item=>item.label==='Bottom left').click();
    shell.tray.menu.find(item=>item.label==='Always on top').click({checked:true});
    assert.deepEqual(saved(),{displayId:22,corner:'bottom-left',alwaysOnTop:true});
    assert.deepEqual(shell.win.bounds,{x:-1280,y:200,width:600,height:420});
    shell.screen.displays=[primary];shell.screen.emit('display-removed');
    assert.deepEqual(shell.win.bounds,{x:0,y:480,width:600,height:420});
    assert.equal(saved().displayId,22);
    assert.ok(shell.tray.menu.find(item=>item.label==='Display').submenu.some(item=>item.label==='Unavailable (22)'));
    shell.screen.displays=[primary,left];shell.screen.emit('display-added');
    assert.deepEqual(shell.win.bounds,{x:-1280,y:200,width:600,height:420});
    const restarted=await boot(profile,[primary,left]);
    assert.deepEqual(restarted.win.bounds,{x:-1280,y:200,width:600,height:420});
    assert.equal(restarted.win.topmost,true);
    restarted.win.webContents.emit('did-finish-load');
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(restarted.tray.menu.some(item=>item.label==='Экран'));
  } finally {rmSync(profile,{recursive:true,force:true});}
});

test('packaged Windows startup menu changes only its own login item and reflects enabled state', async () => {
  const profile=mkdtempSync(path.join(tmpdir(),'monitor-w6-startup-'));
  const other={name:'OtherApp',path:'C:\\Other.exe',args:[],scope:'user',enabled:true};
  const items=[other];
  try {
    const shell=await boot(profile,[primary],items);
    const startup=()=>shell.tray.menu.find(item=>item.label==='Open at login');
    assert.equal(startup().checked,false);
    startup().click({checked:true});
    assert.equal(startup().checked,true);
    assert.equal(items.length,2);
    assert.equal(items[0],other);
    assert.equal(items[1].path,'C:\\Program Files\\Resource Monitor\\Resource Monitor.exe');
    items[1].enabled=false;
    shell.tray.menu.find(item=>item.label==='Always on top').click({checked:true});
    assert.equal(startup().checked,false);
    startup().click({checked:true});
    assert.equal(startup().checked,true);
    startup().click({checked:false});
    assert.equal(startup().checked,false);
    assert.deepEqual(items,[other]);
    const collision={name:'org.local.resource-monitor.widget',path:'C:\\Other.exe',args:[],scope:'user',enabled:true};
    items.push(collision);
    shell.tray.menu.find(item=>item.label==='Always on top').click({checked:false});
    assert.equal(startup().enabled,false);
    startup().click({checked:true});
    assert.deepEqual(items,[other,collision]);
  } finally {rmSync(profile,{recursive:true,force:true});}
});
