const {app, BrowserWindow, Menu, Tray, nativeImage, screen, session} = require('electron');
const {mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const path = require('node:path');
const {corners, position} = require('./position.cjs');

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
      ru: {show:'Показать', hide:'Скрыть', top:'Поверх окон', refresh:'Обновить', exit:'Выход', display:'Экран', corner:'Угол', missing:'Недоступен', corners:['Сверху слева','Сверху справа','Снизу слева','Снизу справа']},
      en: {show:'Show', hide:'Hide', top:'Always on top', refresh:'Refresh', exit:'Exit', display:'Display', corner:'Corner', missing:'Unavailable', corners:['Top left','Top right','Bottom left','Bottom right']}
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
        if (!saveSettings({alwaysOnTop: item.checked})) win.setAlwaysOnTop(!item.checked);
        tray.setContextMenu(menu());
      }},
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
