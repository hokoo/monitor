const {app, BrowserWindow, Menu, Tray, nativeImage, screen, session, powerMonitor} = require('electron');
const {mkdirSync, readFileSync, writeFileSync, statSync} = require('node:fs');
const {spawn, execFileSync} = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {corners, position} = require('./position.cjs');

app.setName('Resource Monitor');
if (process.platform === 'win32') app.setAppUserModelId('org.local.resource-monitor.widget');
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
  const offlineFile = path.join(__dirname, 'offline.html');
  const offlineUrl = pathToFileURL(offlineFile).href;
  let win, tray, quitting = false;
  const settingsFile = () => path.join(app.getPath('userData'), 'widget.json');
  const readSettings = () => {try {const saved=JSON.parse(readFileSync(settingsFile(), 'utf8')); return saved && typeof saved==='object' && !Array.isArray(saved) ? saved : {};} catch {return {};}};
  let settings = readSettings();
  const saveSettings = change => {
    const next = {...settings, ...change};
    try {writeFileSync(settingsFile(), JSON.stringify(next)); settings = next; return true;} catch {return false;}
  };
  const show = () => {if (win) {if (win.isMinimized()) win.restore(); win.show(); win.focus();}};
  app.on('second-instance', show);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const primary = screen.getPrimaryDisplay();
    const displayId = Number.isInteger(settings.displayId) ? settings.displayId : primary.id;
    const corner = corners.includes(settings.corner) ? settings.corner : 'top-right';
    if (settings.displayId !== displayId || settings.corner !== corner) {
      if (!saveSettings({displayId, corner})) settings = {...settings, displayId, corner};
    }
    const place = () => win.setBounds(position(screen.getAllDisplays(), screen.getPrimaryDisplay(), settings.displayId, settings.corner).bounds);
    const initial = position(screen.getAllDisplays(), primary, displayId, corner).bounds;
    win = new BrowserWindow({
      ...initial,
      frame: false, autoHideMenuBar: true, alwaysOnTop: settings.alwaysOnTop === true, backgroundColor: '#111111',
      webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false}
    });
    win.on('close', event => {if (!quitting) {event.preventDefault(); win.hide();}});
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    const allowedDocument = candidate => {try {return [url, offlineUrl].includes(new URL(candidate).href);} catch {return false;}};
    const currentDocument = () => {try {const current=new URL(win.webContents.getURL());current.hash='';return allowedDocument(current.href);} catch {return false;}};
    win.webContents.on('will-navigate', event => {if (!allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('will-frame-navigate', event => {if (!event.isMainFrame || !allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('will-redirect', event => {if (!event.isMainFrame || !allowedDocument(event.url)) event.preventDefault();});
    win.webContents.on('did-finish-load', () => {if (currentDocument()) {
      void win.webContents.insertCSS('.widget-drag{display:block!important;height:18px;-webkit-app-region:drag}');
      if (win.webContents.getURL() === url) void win.webContents.executeJavaScript('document.documentElement.lang').then(locale => {labels=locale==='ru'?labelSets.ru:labelSets.en;tray?.setContextMenu(menu());}).catch(() => {});
    }});
    const probe = () => new Promise(resolve => {
      const request=http.get(`${url}api/state`, {signal:AbortSignal.timeout(1500)}, response => {const ready=response.statusCode===200;response.destroy();resolve(ready);});
      request.on('error', () => resolve(false));
    });
    const dockerPath = 'C:\\Program Files\\Docker\\Docker\\frontend\\Docker Desktop.exe';
    let initialProbe=true, retryDelay=1000, retryTimer, navigationTimer, checking=false;
    const retry = () => {
      if (quitting) return;
      retryTimer=setTimeout(async () => {
        checking=true;
        const first=initialProbe;
        initialProbe=false;
        if (await probe()) {
          if (quitting) {checking=false;return;}
          try {
            await Promise.race([win.loadURL(url),new Promise((_,reject)=>{navigationTimer=setTimeout(()=>{try {win.webContents.stop();} catch {} reject(Error('Navigation timed out'));},5000);})]);
            clearTimeout(navigationTimer);
            checking=false;
            return;
          } catch {clearTimeout(navigationTimer);if (!quitting) void win.loadFile(offlineFile).catch(() => {});}
        } else if (first && process.platform==='win32' && port==='8765') {
          if (quitting) {checking=false;return;}
          try {if (statSync(dockerPath).isFile()) {const child=spawn(dockerPath,[],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}} catch {}
        }
        retryDelay=Math.min(Math.max(retryDelay*2,1000),10000);
        checking=false;
        retry();
      },retryDelay);
    };
    void win.loadFile(offlineFile).catch(() => {});
    retry();
    powerMonitor.on('resume', () => {
      if (win.webContents.getURL() === url) void win.webContents.executeJavaScript('load()').catch(() => {});
      else if (!checking) {clearTimeout(retryTimer);retryDelay=0;retry();}
    });
    app.on('before-quit', () => {quitting=true;clearTimeout(retryTimer);clearTimeout(navigationTimer);});

    const labelSets = {
      ru: {show:'Показать', hide:'Скрыть', top:'Поверх окон', startup:'Запускать при входе', refresh:'Обновить', exit:'Выход', display:'Экран', corner:'Угол', missing:'Недоступен', corners:['Сверху слева','Сверху справа','Снизу слева','Снизу справа']},
      en: {show:'Show', hide:'Hide', top:'Always on top', startup:'Open at login', refresh:'Refresh', exit:'Exit', display:'Display', corner:'Corner', missing:'Unavailable', corners:['Top left','Top right','Bottom left','Bottom right']}
    };
    let labels = labelSets.en;
    const loginName = 'org.local.resource-monitor.widget';
    const loginOptions = {path:process.execPath, args:[]};
    const loginItems = () => app.getLoginItemSettings(loginOptions).launchItems;
    const loginEnabled = () => {
      try {
        return loginItems().some(item =>
          item.name === loginName && item.scope === 'user' && item.enabled === true &&
          item.path.toLowerCase() === process.execPath.toLowerCase() && item.args.length === 0);
      } catch {return false;}
    };
    const loginConflict = () => {
      try {
        const registry=execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','/v',loginName],{encoding:'utf8',windowsHide:true,timeout:2000,stdio:['ignore','pipe','pipe']});
        const value=registry.split(/\r?\n/).find(line => line.trimStart().startsWith(`${loginName} `));
        if (!value) return true;
        const command=value.match(/\s+REG_SZ\s+(.+)$/)?.[1];
        return command?.toLowerCase() !== `"${process.execPath}"`.toLowerCase();
      } catch (error) {return error.status !== 1;}
    };
    const refresh = () => {
      if (win.webContents.getURL() !== url) return;
      void win.webContents.executeJavaScript("fetch('/api/refresh', {method:'POST'}).then(response => {if (response.ok) return load();}).catch(() => {})").catch(() => {});
    };
    const menu = () => Menu.buildFromTemplate([
      {label: labels.show, click: show},
      {label: labels.hide, click: () => win.hide()},
      {label: labels.top, type: 'checkbox', checked: win.isAlwaysOnTop(), click: item => {
        win.setAlwaysOnTop(item.checked);
        if (!saveSettings({alwaysOnTop: item.checked})) win.setAlwaysOnTop(!item.checked);
        tray.setContextMenu(menu());
      }},
      ...(process.platform === 'win32' && app.isPackaged ? [{label: labels.startup, type:'checkbox', checked:loginEnabled(), enabled:!loginConflict(), click: item => {
        if (loginConflict()) return;
        try {app.setLoginItemSettings({...loginOptions, name:loginName, openAtLogin:item.checked});} catch {}
        tray.setContextMenu(menu());
      }}] : []),
      {label: labels.display, submenu: [
        ...screen.getAllDisplays().map((display, index) => ({label: `${display.label || `${labels.display} ${index + 1}`} (${display.id})`, type: 'radio', checked: display.id === settings.displayId, click: () => {
          if (saveSettings({displayId: display.id})) {place(); tray.setContextMenu(menu());}
        }})),
        ...(!screen.getAllDisplays().some(display => display.id === settings.displayId) ? [{label: `${labels.missing} (${settings.displayId})`, enabled: false}] : [])
      ]},
      {label: labels.corner, submenu: corners.map((value, index) => ({label: labels.corners[index], type: 'radio', checked: settings.corner === value, click: () => {
        if (saveSettings({corner: value})) {place(); tray.setContextMenu(menu());}
      }}))},
      {label: labels.refresh, click: refresh},
      {type: 'separator'},
      {label: labels.exit, click: () => {quitting = true; app.quit();}}
    ]);
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
    tray.setToolTip('Resource Monitor');
    tray.setContextMenu(menu());
    tray.on('double-click', show);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => {place(); tray.setContextMenu(menu());});
  });
  app.on('window-all-closed', () => {});
}
