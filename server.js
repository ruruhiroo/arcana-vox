// 詠唱迷宮 ARCANA VOX — 依存ゼロの静的配信 + WebSocket リレーサーバー
// 使い方: node server.js  →  http://localhost:8080  (LAN内なら http://<このPCのIP>:8080)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'public');
// three の場所 (パッケージ化したアプリでも node_modules/three を指す)
const THREE_ROOT = path.join(__dirname, 'node_modules', 'three');
// P2P 用ライブラリ(ESM)も node_modules から配信する
const NM_ROOT = path.dirname(THREE_ROOT);
const NM_ALLOW = ["/@trystero-p2p/", "/@noble/secp256k1/", "/@huggingface/transformers/dist/", "/kuromoji/build/", "/kuromoji/dict/"];
const VENDOR = path.join(__dirname, 'vendor');
const HAS_VENDOR = fs.existsSync(path.join(VENDOR, 'three', 'build', 'three.module.js'));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gz': 'application/gzip', '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  // Three.js と P2P ライブラリはローカルから配信(オフラインで動くように)
  // アプリ同梱版は vendor/ (tools/vendor.js が作る)、開発中は node_modules から
  let base = ROOT;
  if (HAS_VENDOR && p.startsWith('/vendor/three/examples/jsm/')) { base = path.join(VENDOR, 'three/addons'); p = p.slice('/vendor/three/examples/jsm'.length); }
  else if (HAS_VENDOR && p.startsWith('/vendor/')) { base = VENDOR; p = p.slice('/vendor'.length); }
  else if (p.startsWith('/vendor/three/')) { base = THREE_ROOT; p = p.slice('/vendor/three'.length); }
  else if (p.startsWith('/vendor/nm/')) {
    p = p.slice('/vendor/nm'.length);
    if (!NM_ALLOW.some(a => p.startsWith(a))) { res.writeHead(403); return res.end(); }
    base = NM_ROOT;
  }
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---- 最小限の WebSocket 実装 (RFC6455, テキストフレームのみ) ----
const rooms = new Map(); // code -> { clients:Set, hostId, mode, seed }
let nextId = 1;

function encodeFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

function send(client, obj) {
  if (!client.socket.destroyed) client.socket.write(encodeFrame(JSON.stringify(obj)));
}

function broadcast(room, obj, except) {
  const f = encodeFrame(JSON.stringify(obj));
  for (const c of room.clients) if (c !== except && !c.socket.destroyed) c.socket.write(f);
}

function roster(room) {
  return [...room.clients].map(c => ({ id: c.id, name: c.name }));
}

function leave(client) {
  const room = client.room;
  if (!room) return;
  room.clients.delete(client);
  client.room = null;
  if (room.clients.size === 0) { rooms.delete(client.roomCode); return; }
  if (room.hostId === client.id) room.hostId = [...room.clients][0].id;
  broadcast(room, { t: 'roster', players: roster(room), hostId: room.hostId, left: client.id });
}

function onMessage(client, msg) {
  let m; try { m = JSON.parse(msg); } catch { return; }
  if (m.t === 'join') {
    const code = String(m.room || 'LOBBY').toUpperCase().slice(0, 12);
    let room = rooms.get(code);
    if (!room) { room = { clients: new Set(), hostId: client.id, mode: m.mode, seed: (Math.random() * 1e9) | 0 }; rooms.set(code, room); }
    client.name = String(m.name || '名無しの魔導師').slice(0, 16);
    client.room = room; client.roomCode = code;
    room.clients.add(client);
    send(client, { t: 'welcome', id: client.id, hostId: room.hostId, mode: room.mode, seed: room.seed, floor: room.floor || 1, players: roster(room) });
    broadcast(room, { t: 'roster', players: roster(room), hostId: room.hostId, joined: client.id }, client);
    return;
  }
  const room = client.room;
  if (!room) return;
  m.from = client.id;
  if (m.t === 'floor' && client.id === room.hostId) { room.seed = m.seed; room.floor = m.floor; }
  if (m.to) { // 個別送信
    for (const c of room.clients) if (c.id === m.to) send(c, m);
  } else broadcast(room, m, client);
}

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket') return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const client = { id: nextId++, socket, room: null, name: '' };
  let buf = Buffer.alloc(0);
  let fragments = [];
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.slice(off, off + len);
      if (masked) { const mask = buf.slice(maskOff, maskOff + 4); payload = Buffer.from(payload.map((b, i) => b ^ mask[i & 3])); }
      buf = buf.slice(off + len);
      if (op === 0x8) { socket.end(); return; }
      if (op === 0x9) { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 0x1 || op === 0x0) {
        fragments.push(payload);
        if (fin) { const text = Buffer.concat(fragments).toString('utf8'); fragments = []; onMessage(client, text); }
      }
    }
  });
  socket.on('close', () => leave(client));
  socket.on('error', () => leave(client));
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) for (const n of list) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

// デスクトップ版(Electron)からも埋め込みで起動できるようにする
function start(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ port: server.address().port, lan: lanAddresses() }));
  });
}
module.exports = { start, lanAddresses };

if (require.main === module) {
  start().then(({ port, lan }) => {
    console.log(`詠唱迷宮 ARCANA VOX server: http://localhost:${port}`);
    for (const a of lan) console.log(`  LAN: http://${a}:${port}`);
  });
}
