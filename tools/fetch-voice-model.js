// オフライン音声認識用の日本語モデル(Vosk 公式, 約48MB)を取得して
// public/voice/model.tar.gz に配置する。初回セットアップ時に一度だけ実行: npm run setup-voice
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const URL = 'https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.zip';
const NAME = 'vosk-model-small-ja-0.22';
// Windows では Git の GNU tar ではなく zip を扱える標準の bsdtar を使う
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const outDir =path.join(__dirname, '..', 'public', 'voice');
const out = path.join(outDir, 'model.tar.gz');

(async () => {
  if (fs.existsSync(out)) { console.log('already present:', out); return; }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vosk-'));
  const zip = path.join(work, 'model.zip');
  console.log('downloading', URL);
  const res = await fetch(URL);
  if (!res.ok) throw new Error('download failed: ' + res.status);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  console.log('extracting…');
  execFileSync(TAR, ['-xf', zip, '-C', work]);
  fs.renameSync(path.join(work, NAME), path.join(work, 'model'));
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(TAR, ['-czf', out, '-C', work, 'model']);
  fs.rmSync(work, { recursive: true, force: true });
  console.log('done:', out, (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
})().catch(e => { console.error(e); process.exit(1); });
