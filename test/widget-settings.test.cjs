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

async function boot(profile, displays) {
  const app = new EventEmitter();
  app.setName = app.setPath = () => {};
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
    setBounds(bounds) {this.bounds = bounds;}
    isAlwaysOnTop() {return this.topmost;}
    setAlwaysOnTop(value) {this.topmost = value;}
  }
  class Tray {setToolTip() {} setContextMenu(menu) {this.menu = menu;} on() {}}
  const trays = [];
  const electron = {app, BrowserWindow, Tray:class extends Tray {constructor(...args) {super(...args); trays.push(this);}},
    Menu:{setApplicationMenu() {}, buildFromTemplate:items=>items}, nativeImage:{createFromPath:()=>({})}, screen,
    session:{defaultSession:{setPermissionRequestHandler() {},setPermissionCheckHandler() {}}}};
  vm.runInNewContext(readFileSync(main,'utf8'),{require:name=>name==='electron'?electron:mainRequire(name),__dirname:path.dirname(main),process:{env:{MONITOR_WIDGET_PORT:'18765',MONITOR_WIDGET_USER_DATA:profile}},URL});
  await new Promise(resolve=>setImmediate(resolve));
  return {screen, win:windows[0], tray:trays[0]};
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
