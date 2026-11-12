const {app, BrowserWindow, Menu, Tray, nativeImage, screen, session} = require('electron');
const {mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const path = require('node:path');

app.setName('Resource Monitor');
if (process.env.MONITOR_WIDGET_USER_DATA) {
  const userData=process.env.MONITOR_WIDGET_USER_DATA;
  if (!path.isAbsolute(userData)) throw Error('Widget user data path must be absolute');
  mkdirSync(userData,{recursive:true});
  app.setPath('userData',userData);
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const port = process.env.MONITOR_WIDGET_PORT ?? '8765';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw Error('Invalid widget port');
  const url = `http://127.0.0.1:${port}/`;
  let win, tray, quitting = false;
  const settingsFile = () => path.join(app.getPath('userData'), 'widget.json');
  const readTopmost = () => {try {return JSON.parse(readFileSync(settingsFile(), 'utf8')).alwaysOnTop === true;} catch {return false;}};
  const show = () => {if (win) {if (win.isMinimized()) win.restore(); win.show(); win.focus();}};
  app.on('second-instance', show);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const work = screen.getPrimaryDisplay().workArea;
    win = new BrowserWindow({
      width: 600, height: 420, x: work.x + Math.max(0, work.width - 600), y: work.y,
      frame: false, autoHideMenuBar: true, alwaysOnTop: readTopmost(), backgroundColor: '#111111',
      webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false}
    });
    win.on('close', event => {if (!quitting) {event.preventDefault(); win.hide();}});
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    const allowedDocument = candidate => {try {return new URL(candidate).href===url;} catch {return false;}};
    const currentDocument = () => {try {const current=new URL(win.webContents.getURL());current.hash='';return allowedDocument(current.href);} catch {return false;}};
    win.webContents.on('will-navigate', event => {if (!allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('will-frame-navigate', event => {if (!event.isMainFrame || !allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('will-redirect', event => {if (!event.isMainFrame || !allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('did-finish-load', () => {if (currentDocument()) {
      void win.webContents.insertCSS('.widget-drag{display:block!important;height:18px;-webkit-app-region:drag}');
      void win.webContents.executeJavaScript('document.documentElement.lang').then(locale => {labels=locale==='ru'?labelSets.ru:labelSets.en;tray?.setContextMenu(menu());}).catch(() => {});
    }});
    void win.loadURL(url).catch(() => {});

    const labelSets = {
      ru: {show:'Показать', hide:'Скрыть', top:'Поверх окон', refresh:'Обновить', exit:'Выход'},
      en: {show:'Show', hide:'Hide', top:'Always on top', refresh:'Refresh', exit:'Exit'}
    };
    let labels = labelSets.en;
    const refresh = () => {
      if (!currentDocument()) return;
      void win.webContents.executeJavaScript("fetch('/api/refresh', {method:'POST'}).then(response => {if (response.ok) return load();}).catch(() => {})").catch(() => {});
    };
    const menu = () => Menu.buildFromTemplate([
      {label: labels.show, click: show},
      {label: labels.hide, click: () => win.hide()},
      {label: labels.top, type: 'checkbox', checked: win.isAlwaysOnTop(), click: item => {
        win.setAlwaysOnTop(item.checked);
        try {writeFileSync(settingsFile(), JSON.stringify({alwaysOnTop: item.checked}));} catch {win.setAlwaysOnTop(!item.checked);}
        tray.setContextMenu(menu());
      }},
      {label: labels.refresh, click: refresh},
      {type: 'separator'},
      {label: labels.exit, click: () => {quitting = true; app.quit();}}
    ]);
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
    tray.setToolTip('Resource Monitor');
    tray.setContextMenu(menu());
    tray.on('double-click', show);
  });
  app.on('window-all-closed', () => {});
}
