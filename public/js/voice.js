// 声で詠唱する: 音声認識と、NPC魔導師の読み上げ
// エンジンは2種類:
//  - vosk      : オフライン認識(デスクトップ版の標準)。言霊だけを文法に登録するので聞き取りが正確
//  - webspeech : Chrome/Edge の Web Speech API(ブラウザ版でモデル未配置のとき)
import { WORDS } from './lexicon.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_APP = !!window.desktop?.isApp;
export const voiceSupported = !!navigator.mediaDevices?.getUserMedia || !!SR;
// 言霊に絞った文法で認識できる Vosk を常に優先し、使えなければ Web Speech に切り替える
export let engine = 'vosk';

let rec = null, active = false, wantActive = false, continuous = false;
let handlers = { interim: () => {}, final: () => {}, state: () => {} };

export function initVoice(h) {
  handlers = { ...handlers, ...h };
  if (engine === 'vosk') { initVosk(); return true; }
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
  rec.onerror = e => { handlers.state('error:' + e.error); if (e.error === 'not-allowed') wantActive = false; };
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

async function initVosk() {
  if (vosk.loading || vosk.model) return;
  vosk.loading = true;
  handlers.state('loading');
  try {
    await loadScript('voice/vosk.js');
    vosk.model = await window.Vosk.createModel('voice/model.tar.gz', -1);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const ctx = vosk.ctx = new AudioContext();
    const words = new Set(PARTICLES);
    for (const w of WORDS) for (const a of w.alias) if (!/[a-z0-9]/i.test(a)) words.add(a);
    // 詠唱文の各節(業火・燃え・盛れ…)も聞き取れるようにする
    for (const w of WORDS) for (const a of w.vocab || []) words.add(a);
    const grammar = JSON.stringify([...words, ...PHRASES, '[unk]']);
    const r = vosk.recognizer = new vosk.model.KaldiRecognizer(ctx.sampleRate, grammar);
    r.on('partialresult', m => {
      const t = clean(m.result.partial);
      if (vosk.listening && t && t !== vosk.lastPartial) { vosk.lastPartial = t; handlers.interim(t); }
    });
    r.on('result', m => {
      const t = clean(m.result.text);
      vosk.lastPartial = '';
      if (t) handlers.final([t]);
    });
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => { if (vosk.listening) { try { r.acceptWaveform(e.inputBuffer); } catch {} } };
    src.connect(node); node.connect(ctx.destination);
    vosk.loading = false;
    handlers.state(continuous ? 'listening' : 'idle');
    if (continuous) voskStart();
  } catch (e) {
    console.warn('Vosk init failed', e);
    vosk.loading = false; vosk.failed = true;
    // ブラウザ版なら Web Speech に切り替える
    if (SR) { engine = 'webspeech'; initVoice(handlers); handlers.state('idle'); }
    else handlers.state('error:' + (e?.name === 'NotAllowedError' ? 'not-allowed' : 'model'));
  }
}
const clean = s => (s || '').replace(/\[unk\]/g, '').replace(/\s+/g, ' ').trim();

function voskStart() {
  if (!vosk.model) { if (!vosk.loading && !vosk.failed) initVosk(); return; }
  vosk.ctx?.resume();
  if (!vosk.listening) { vosk.listening = true; handlers.state('listening'); }
}
function voskStop() {
  if (!vosk.listening) return;
  // 押し終わりの語尾を取りこぼさないよう少し遅らせて確定する
  setTimeout(() => {
    vosk.listening = false;
    try { vosk.recognizer.retrieveFinalResult(); } catch {}
    handlers.state('idle');
  }, 250);
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
