// デスクトップ版のエントリ。ゲーム内サーバーを起動し、それを表示するウィンドウを開く。
// 同じLANの仲間は「オンライン」で、このPCのIPアドレスを指定して参加できる。
const { app, BrowserWindow, session, ipcMain, Menu } = require('electron');
const path = require('path');
const { start } = require('../server.js');
const steam = require('./steam.js');
steam.initSteam(); // Steam から起動された時だけ連携する(窓を開く前に)

let win = null;

// セーブデータのファイル(%APPDATA%\ArcanaVox\saves.json)。書き込みは少しまとめて行い、終了時に必ず書き出す
const fs = require('fs');
const store = {
  file: null, data: {}, timer: null,
  load() {
    this.file = path.join(app.getPath('userData'), 'saves.json');
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { this.data = {}; }
  },
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 300); },
  flush() {
    clearTimeout(this.timer); this.timer = null;
    try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data)); fs.renameSync(tmp, this.file); } catch (e) { console.log('[save]', e.message); }
  },
};
app.on('before-quit', () => { if (store.timer) store.flush(); });

async function createWindow() {
  store.load();
  // 既定ポートが埋まっていれば空いているポートを使う
  let info;
  // 埋まっていたら決まった予備のポートを順に試す(毎回違うポートだと、ブラウザ側の保存領域が別物になる)
  for (const port of [8080, 18080, 28080, 0]) { try { info = await start(port); break; } catch {} }

  // マイク(詠唱)を許可する。ゲーム自身のページ以外の権限要求は拒否
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const own = wc.getURL().startsWith(`http://localhost:${info.port}`);
    cb(own && ['media', 'pointerLock', 'fullscreen'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' || permission === 'pointerLock');

  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#000000', title: '詠唱迷宮 ARCANA VOX', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false, devTools: !app.isPackaged }, // 配布版では開発者ツールを開けない
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://localhost:${info.port}/?app=1`);
  // F11 で全画面、F12 で開発者ツール(開発中の起動だけ)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12' && !app.isPackaged) { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (app.isPackaged && input.control && input.shift && /^[ijc]$/i.test(input.key)) e.preventDefault();
  });
  ipcMain.handle('host-info', () => info);
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('achieve', (e, id) => steam.achieve(id));
  // セーブデータの控え: ブラウザの保存領域はアドレス(ポート)ごとに分かれるので、ファイルにも書いておく
  ipcMain.on('store-load', e => { e.returnValue = store.data; });
  ipcMain.on('store-set', (e, k, v) => { store.data[k] = v; store.save(); });
  ipcMain.on('store-del', (e, k) => { delete store.data[k]; store.save(); });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
