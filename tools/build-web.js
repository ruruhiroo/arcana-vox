// Web 公開用の静的ファイル一式を docs/ に作る (GitHub Pages などにそのまま置ける)
// public/ の中身 + Three.js と P2P ライブラリを vendor/ 以下に写す。サーバーは要らない。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs'); // GitHub Pages の「/docs から公開」でそのまま使える
const NM = path.join(ROOT, 'node_modules');

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), OUT);

// Three.js 本体と使っているアドオンだけ
const THREE = path.join(NM, 'three');
fs.mkdirSync(path.join(OUT, 'vendor/three/build'), { recursive: true });
fs.copyFileSync(path.join(THREE, 'build/three.module.js'), path.join(OUT, 'vendor/three/build/three.module.js'));
for (const dir of ['postprocessing', 'shaders', 'geometries']) {
  copyDir(path.join(THREE, 'examples/jsm', dir), path.join(OUT, 'vendor/three/examples/jsm', dir));
}

// P2P (trystero / nostr) のライブラリ
const noMaps = s => !s.endsWith('.map') && !s.endsWith('.d.ts') && !s.endsWith('.d.mts');
copyDir(path.join(NM, '@trystero-p2p'), path.join(OUT, 'vendor/nm/@trystero-p2p'), noMaps);
copyDir(path.join(NM, '@noble/secp256k1'), path.join(OUT, 'vendor/nm/@noble/secp256k1'), noMaps);

// GitHub Pages に「Jekyll で加工しないで」と伝える
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(OUT);
console.log(`docs/ を作成: ${n} ファイル, ${(bytes / 1048576).toFixed(1)} MB`);
