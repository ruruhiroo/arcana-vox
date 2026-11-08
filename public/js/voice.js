// 声で詠唱する: 音声認識と、NPC魔導師の読み上げ
// エンジンは2種類:
//  - vosk      : オフライン認識(デスクトップ版の標準)。言霊だけを文法に登録するので聞き取りが正確
//  - webspeech : Chrome/Edge の Web Speech API(ブラウザ版でモデル未配置のとき)
import { WORDS, CALL_WORDS } from './lexicon.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_APP = !!window.desktop?.isApp;
export const voiceSupported = !!navigator.mediaDevices?.getUserMedia || !!SR;
// ブラウザ版: Chrome/Edge の音声認識(長い文も聞き取れる)を使う。アプリ版: オフラインの Vosk
export let engine = (!IS_APP && SR) ? 'webspeech' : 'vosk';

let rec = null, active = false, wantActive = false, continuous = false;
let handlers = { interim: () => {}, final: () => {}, state: () => {} };

export function initVoice(h) {
  handlers = { ...handlers, ...h };
  // マイクは最初に詠唱しようとした時に初めて使う(起動直後に許可を求めない)
  if (engine === 'vosk') { loadVoskModel(); return true; }
  if (!SR) return false;
  rec = new SR();
  rec.lang = 'ja-JP';
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 3;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        // 候補の中から言霊を最も多く含むものを採用する
        const alts = [...r].map(a => a.transcript);
        handlers.final(alts);
      } else interim += r[0].transcript;
    }
    if (interim) handlers.interim(interim);
  };
  rec.onstart = () => { active = true; handlers.state('listening'); };
  rec.onend = () => {
    active = false;
    if (wantActive) { try { rec.start(); } catch {} } else handlers.state('idle');
  };
  rec.onerror = e => {
    if (e.error === 'aborted') return; // 自分で止めた時
    handlers.state('error:' + e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') wantActive = false;
  };
  return true;
}

export function startListening() {
  if (engine === 'vosk') { voskStart(); return; }
  if (!rec) return;
  wantActive = true;
  if (!active) { try { rec.start(); } catch {} }
}

export function stopListening() {
  if (continuous) return;
  if (engine === 'vosk') { voskStop(); return; }
  if (!rec) return;
  wantActive = false;
  try { rec.stop(); } catch {}
}

export function setContinuous(v) {
  continuous = v;
  if (engine === 'vosk') { if (v) voskStart(); else voskStop(); return; }
  if (v) startListening(); else { wantActive = false; try { rec && rec.stop(); } catch {} }
}

// ---- Vosk (オフライン) ----
// 文法: 言霊の別名のうち一語のもの + 助詞 + [unk](それ以外の発話)。モデルに無い語は自動で無視される
const PARTICLES = ['に', 'の', 'よ', 'を', 'て', 'と'];
// モデルの語彙に一語として無い言霊は、語彙にある音の並びで表す(正規化で空白が消え別名と一致する)
const PHRASES = ['ライ テイ', 'セイ クリード', '我 に', 'われ に', '汝 に', '同胞 に', 'はら から に', '放 て', '解き 放 て', '神聖'];
let vosk = { model: null, recognizer: null, ctx: null, listening: false, loading: false, failed: false, lastPartial: '' };

async function loadScript(src) {
  if (window.Vosk) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

// 辞書(音声モデル)は起動直後から裏で読み込む。マイクは最初に唱えようとした時に初めて使う
function loadVoskModel() {
  if (vosk.modelPromise) return vosk.modelPromise;
  handlers.state('loading');
  vosk.modelPromise = (async () => {
    await loadScript('voice/vosk.js');
    vosk.model = await window.Vosk.createModel('voice/model.tar.gz', -1);
    if (!vosk.recognizer) handlers.state('idle');
  })().catch(e => { failVosk(e); });
  return vosk.modelPromise;
}
function failVosk(e) {
  console.warn('Vosk init failed', e);
  vosk.failed = true;
  // ブラウザ版なら Web Speech に切り替える
  if (SR) { engine = 'webspeech'; initVoice(handlers); handlers.state('idle'); if (vosk.wanted || continuous) startListening(); }
  else handlers.state('error:' + (e?.name === 'NotAllowedError' ? 'not-allowed' : 'model'));
}
async function ensureMic() {
  if (vosk.recognizer) return true;
  await loadVoskModel();
  if (!vosk.model) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const ctx = vosk.ctx = new AudioContext();
    const words = new Set(PARTICLES);
    for (const w of WORDS) for (const a of w.alias) if (!/[a-z0-9]/i.test(a)) words.add(a);
    // 詠唱文の各節(業火・燃え・盛れ…)も聞き取れるようにする
    for (const w of WORDS) for (const a of w.vocab || []) words.add(a);
    for (const a of CALL_WORDS) words.add(a);
    const grammar = JSON.stringify([...words, ...PHRASES, '[unk]']);
    const r = new vosk.model.KaldiRecognizer(ctx.sampleRate, grammar);
    r.on('partialresult', m => {
      const t = clean(m.result.partial);
      if (vosk.listening && t && t !== vosk.lastPartial) { vosk.lastPartial = t; handlers.interim(t); }
    });
    r.on('result', m => {
      const t = clean(m.result.text) || vosk.lastPartial;
      vosk.lastPartial = '';
      if (t) handlers.final([t]);
    });
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => { if (vosk.listening) { try { r.acceptWaveform(e.inputBuffer); } catch {} } };
    src.connect(node); node.connect(ctx.destination);
    vosk.recognizer = r;
    return true;
  } catch (e) { failVosk(e); return false; }
}
const clean = s => (s || '').replace(/\[unk\]/g, '').replace(/\s+/g, ' ').trim();

function voskStart() {
  vosk.wanted = true;
  if (vosk.failed) return;
  if (!vosk.recognizer) {
    // 準備が済んだ時に、まだ押している(または常時詠唱なら)そのまま聞き始める
    if (!vosk.starting) { vosk.starting = true; handlers.state('loading'); ensureMic().then(ok => { vosk.starting = false; if (ok && (vosk.wanted || continuous)) beginListen(); else if (ok) handlers.state('idle'); }); }
    return;
  }
  beginListen();
}
function beginListen() {
  vosk.ctx?.resume();
  if (!vosk.listening) { vosk.listening = true; handlers.state('listening'); }
}
function voskStop() {
  vosk.wanted = false;
  if (!vosk.listening) return;
  // 押し終わりの語尾を取りこぼさないよう少し遅らせて確定する
  setTimeout(() => {
    vosk.listening = false;
    try { vosk.recognizer.retrieveFinalResult(); } catch {}
    handlers.state('idle');
  }, 550);
}
export const isContinuous = () => continuous;

// ---- NPC の詠唱読み上げ ----
let jaVoice = null;
let ttsEnabled = true;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  jaVoice = vs.find(v => v.lang === 'ja-JP' && /Google|Nanami|Ayumi|Haruka/i.test(v.name)) || vs.find(v => v.lang && v.lang.startsWith('ja')) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export function setTTS(v) { ttsEnabled = v; if (!v && 'speechSynthesis' in window) speechSynthesis.cancel(); }
export const ttsOn = () => ttsEnabled;

// 距離に応じた音量で読み上げ。戻り値は読み上げにかかるおおよその秒数
export function speakChant(text, { volume = 1, pitch = 1, rate = 1.15 } = {}) {
  const est = 0.5 + text.length * 0.11 / rate;
  if (!ttsEnabled || !('speechSynthesis' in window) || volume < 0.05) return est;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP'; if (jaVoice) u.voice = jaVoice;
  u.volume = Math.min(1, volume); u.pitch = pitch; u.rate = rate;
  speechSynthesis.speak(u);
  return est;
}
