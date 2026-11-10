// アプリ同梱用に、使う外部ライブラリを vendor/ に写す (npm run dist の前に自動で走る)
// electron-builder は node_modules 内の examples/ などを既定で除外するため、
// Three.js のアドオンは vendor/three/addons/ という名前で置く
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'vendor');

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter); else fs.copyFileSync(s, d);
  }
}
const noJunk = s => !/\.(map|d\.ts|d\.mts)$/.test(s);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'three/build'), { recursive: true });
fs.copyFileSync(path.join(NM, 'three/build/three.module.js'), path.join(OUT, 'three/build/three.module.js'));
for (const d of ['postprocessing', 'shaders', 'geometries', 'loaders', 'utils', 'environments']) copyDir(path.join(NM, 'three/examples/jsm', d), path.join(OUT, 'three/addons', d));
copyDir(path.join(NM, '@trystero-p2p'), path.join(OUT, 'nm/@trystero-p2p'), noJunk);
copyDir(path.join(NM, '@noble/secp256k1'), path.join(OUT, 'nm/@noble/secp256k1'), noJunk);
// AI 音声認識 (Whisper): ライブラリ本体と、実行に使う wasm
const HF = path.join(NM, '@huggingface/transformers/dist'), HF_OUT = path.join(OUT, 'nm/@huggingface/transformers/dist');
fs.mkdirSync(HF_OUT, { recursive: true });
for (const f of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) fs.copyFileSync(path.join(HF, f), path.join(HF_OUT, f));
// 読みの辞書 (聞き取った漢字をひらがなに分解する)
copyDir(path.join(NM, 'kuromoji/build'), path.join(OUT, 'nm/kuromoji/build'));
copyDir(path.join(NM, 'kuromoji/dict'), path.join(OUT, 'nm/kuromoji/dict'));
console.log('vendor/ を作成しました');
