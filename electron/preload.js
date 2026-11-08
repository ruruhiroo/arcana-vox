// ページ側へ最小限の機能だけを公開する
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  hostInfo: () => ipcRenderer.invoke('host-info'),
  quit: () => ipcRenderer.send('quit'),
});
