// ページ側へ最小限の機能だけを公開する
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  hostInfo: () => ipcRenderer.invoke('host-info'),
  quit: () => ipcRenderer.send('quit'),
  achieve: id => ipcRenderer.send('achieve', String(id)), // Steam の実績
  // セーブデータの控え(アプリのデータフォルダの saves.json)。ポートが変わっても記録が消えないように
  storeLoad: () => { try { return ipcRenderer.sendSync('store-load') || {}; } catch { return {}; } },
  storeSet: (k, v) => ipcRenderer.send('store-set', String(k), String(v)),
  storeDel: k => ipcRenderer.send('store-del', String(k)),
});
