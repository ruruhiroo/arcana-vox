// デスクトップ版のエントリ。ゲーム内サーバーを起動し、それを表示するウィンドウを開く。
// 同じLANの仲間は「オンライン」で、このPCのIPアドレスを指定して参加できる。
const { app, BrowserWindow, session, ipcMain, Menu } = require('electron');
const path = require('path');
const { start } = require('../server.js');

let win = null;

async function createWindow() {
  // 既定ポートが埋まっていれば空いているポートを使う
  let info;
  try { info = await start(8080); } catch { info = await start(0); }

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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://localhost:${info.port}/?app=1`);
  // F11 で全画面、F12 で開発者ツール
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  ipcMain.handle('host-info', () => info);
  ipcMain.on('quit', () => app.quit());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
