// 紹介映像用: ブラウザから送られてきたコマ(JPEG)を連番で保存するだけの小さなサーバー。
//   node tools/capture-server.js <保存先> [ポート]
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'trailer-frames'), port = +(process.argv[3] || 8099);
fs.mkdirSync(dir, { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const q = new URL(req.url, 'http://x').searchParams, n = +(q.get('n') || 0);
  const file = (q.get('file') || '').replace(/[^\w.-]/g, '');   // ?file=bgm.wav のように名前を付ければ、その名で保存する(音楽など)
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => { fs.writeFileSync(path.join(dir, file || 'f' + String(n).padStart(5, '0') + '.jpg'), Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
}).listen(port, () => console.log('capture server on', port, '->', dir));
