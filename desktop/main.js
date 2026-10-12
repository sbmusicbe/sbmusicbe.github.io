'use strict';
// Klose als programma: opent de website in een eigen venster. Alle gegevens blijven versleuteld
// op het toestel en in het account, net als in de browser.
const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('node:path');

const URL_APP = process.env.KLOSE_URL || 'https://sbmusic.be/taken/';
const ORIGIN = new URL(URL_APP).origin;

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function open() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: '#0E1014', title: 'Klose', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: false, devTools: !app.isPackaged, enableBlinkFeatures: '', navigateOnDragDrop: false },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(URL_APP);
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  // externe links in de gewone browser, nooit in dit venster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== ORIGIN && !url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
}
// elke aanvraag voor rechten (camera, microfoon, locatie, meldingen, ...) wordt geweigerd: Klose heeft er geen nodig
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
});
// geen ingesloten webweergaven, en niets anders dan de eigen site in dit venster
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', e => e.preventDefault());
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('file:') && new URL(url).origin !== ORIGIN) e.preventDefault(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());
