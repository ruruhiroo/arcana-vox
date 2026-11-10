// Steam との連携(実績・オーバーレイ)。steamworks.js が入っていて、Steam から起動された時だけ動く。
// 入っていなければ何もしない(itch.io や exe 単体の配布でもそのまま動く)。
//   入れ方: npm i steamworks.js   App ID: steam_appid.txt(開発中のみ) か 環境変数 STEAM_APP_ID
const fs = require('fs');
const path = require('path');

let client = null;

function readAppId() {
  if (process.env.STEAM_APP_ID) return Number(process.env.STEAM_APP_ID);
  for (const p of [path.join(process.cwd(), 'steam_appid.txt'), path.join(path.dirname(process.execPath), 'steam_appid.txt')]) {
    try { const n = Number(fs.readFileSync(p, 'utf8').trim()); if (n) return n; } catch {}
  }
  return 0;
}

function initSteam() {
  let sw;
  try { sw = require('steamworks.js'); } catch { return null; } // 入っていない
  const appId = readAppId();
  try {
    client = appId ? sw.init(appId) : sw.init();
    try { sw.electronEnableSteamOverlay(); } catch {}
    console.log('[steam] 連携した:', client.localplayer.getName());
  } catch (e) {
    console.log('[steam] Steam から起動されていないので連携しない:', e.message);
    client = null;
  }
  return client;
}

// 実績を解除する(同じ実績を何度呼んでもよい)
function achieve(id) {
  if (!client || typeof id !== 'string') return false;
  try { if (!client.achievement.isActivated(id)) client.achievement.activate(id); return true; } catch { return false; }
}

module.exports = { initSteam, achieve };
