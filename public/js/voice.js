// 声で詠唱する: 音声認識と、NPC魔導師の読み上げ
// エンジンは3種類:
//  - whisper   : AI 音声認識(アプリ版。初回にモデルをダウンロードし、準備できたら自動で切り替え)
//  - vosk      : オフライン認識(デスクトップ版の標準)。言霊だけを文法に登録するので聞き取りが正確
//  - webspeech : Chrome/Edge の Web Speech API(ブラウザ版でモデル未配置のとき)
import { WORDS, CALL_WORDS } from './lexicon.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_APP = !!window.desktop?.isApp;
export const voiceSupported = !!navigator.mediaDevices?.getUserMedia || !!SR;
// ブラウザ版: Chrome/Edge の音声認識(長い文も聞き取れる)を使う。アプリ版: オフラインの Vosk
// Brave などは音声認識の窓口だけあって実際には使えない。その場合や Firefox では、アプリと同じ認識(Vosk → AI)を使う
const BRAVE = !!navigator.brave;
export let engine = (!IS_APP && SR && !BRAVE) ? 'webspeech' : 'vosk';
let webFailed = false;
const canAI = () => IS_APP || !!navigator.gpu; // AI 認識は GPU が使える時だけ (CPU だと遅すぎる)

let rec = null, active = false, wantActive = false, continuous = false;
let handlers = { interim: () => {}, final: () => {}, state: () => {} };

export function initVoice(h) {
  handlers = { ...handlers, ...h };
  // マイクは最初に詠唱しようとした時に初めて使う(起動直後に許可を求めない)
  if (engine === 'vosk') { loadVoskModel(); if (canAI()) loadWhisper(); return true; }
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
    // このブラウザでは Web の音声認識が使えない → 端末の中で動く認識に切り替える
    if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
      const resume = wantActive || continuous;
      wantActive = false; webFailed = true; try { rec.abort(); } catch {}
      engine = 'vosk'; loadVoskModel(); if (canAI()) loadWhisper();
      handlers.state('fallback');
      if (resume) startListening();
      return;
    }
    handlers.state('error:' + e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') wantActive = false;
  };
  return true;
}

let pttWanted = false;
export function startListening() {
  pttWanted = true;
  if (W.ready && engine === 'vosk' && !vosk.listening && !vosk.starting) engine = 'whisper'; // 録音準備中には切り替えない
  if (engine === 'whisper') { wStart(); return; }
  if (engine === 'vosk') { voskStart(); return; }
  if (!rec) return;
  wantActive = true;
  if (!active) { try { rec.start(); } catch {} }
}

export function stopListening() {
  pttWanted = false;
  if (continuous) return;
  if (engine === 'whisper') { wStop(); return; }
  if (engine === 'vosk') { voskStop(); return; }
  if (!rec) return;
  wantActive = false;
  try { rec.stop(); } catch {}
}

export function setContinuous(v) {
  continuous = v;
  if (W.ready && engine === 'vosk' && !vosk.listening && !vosk.starting) engine = 'whisper';
  if (engine === 'whisper') { if (v) wStart(); else wStop(true); return; }
  if (engine === 'vosk') { if (v) voskStart(); else voskStop(); return; }
  if (v) startListening(); else { wantActive = false; try { rec && rec.stop(); } catch {} }
}

// ---- Vosk (オフライン) ----
// 文法: 言霊の別名のうち一語のもの + 助詞 + [unk](それ以外の発話)。モデルに無い語は自動で無視される
const PARTICLES = ['に', 'の', 'よ', 'を', 'て', 'と'];
// モデルの語彙に一語として無い言霊は、語彙にある音の並びで表す(正規化で空白が消え別名と一致する)
const PHRASES = ['ライ テイ', 'セイ クリード', '我 に', 'われ に', '汝 に', '同胞 に', 'はら から に', '放 て', '今 こそ 放 て', 'いま こそ', '神聖'];
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
  if (SR && !BRAVE && !webFailed) { engine = 'webspeech'; initVoice(handlers); handlers.state('idle'); if (vosk.wanted || continuous) startListening(); }
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
      if (vosk.listening && t && t !== vosk.lastPartial && (vosk.voiced || 0) > 0.2) { vosk.lastPartial = t; handlers.interim(t); }
    });
    r.on('result', m => {
      const t = (vosk.voiced || 0) > 0.25 ? clean(m.result.text) || vosk.lastPartial : ''; // 人の声が無ければ物音として捨てる
      vosk.lastPartial = ''; vosk.voiced = 0;
      if (t) handlers.final([t]);
    });
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => {
      if (!vosk.listening) return;
      // 人の声らしさ(16kHz 相当に間引いて判定)
      const x = e.inputBuffer.getChannelData(0), k = Math.max(1, Math.round(ctx.sampleRate / 16000)), d = new Float32Array(Math.floor(x.length / k));
      let sum = 0; for (let i = 0; i < d.length; i++) { d[i] = x[i * k]; sum += d[i] * d[i]; }
      if (Math.sqrt(sum / d.length) > 0.012 && voicedness(d) > 0.45) vosk.voiced = (vosk.voiced || 0) + x.length / ctx.sampleRate;
      try { r.acceptWaveform(e.inputBuffer); } catch {}
    };
    src.connect(node); node.connect(ctx.destination);
    vosk.recognizer = r;
    return true;
  } catch (e) { failVosk(e); return false; }
}
const clean = s => (s || '').replace(/\[unk\]/g, '').replace(/\s+/g, ' ').trim();

function voskStart() {
  clearTimeout(vosk.stopTimer);
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
  if (!vosk.listening) { vosk.listening = true; vosk.voiced = 0; handlers.state('listening'); }
}
function voskStop() {
  vosk.wanted = false;
  clearTimeout(vosk.stopTimer);
  if (!vosk.listening) return;
  // 押し終わりの語尾を取りこぼさないよう少し遅らせて確定する
  vosk.stopTimer = setTimeout(() => {
    if (vosk.wanted || continuous) return;
    vosk.listening = false;
    try { vosk.recognizer.retrieveFinalResult(); } catch {}
    handlers.state('idle');
  }, 550);
}
// ---- AI 音声認識 (Whisper, アプリ版) ----
// 自由な文を聞き取れるので、詠唱文を丸ごと読み上げても認識できる。準備が済むまでは Vosk を使う
const W = { worker: null, ready: false, failed: false, ctx: null, rec: false, buf: [], n: 0, peak: 0,
  busy: false, id: 0, session: 0, request: 0, pending: new Set(), wanted: false, starting: false,
  sentAt: 0, silence: 0, speaking: false, pct: -1, voiced: 0, lastVoiced: 0 };
// 人の声らしさ: 声には高さ(周期)がある。ドアの音・物音・雑音には無い。
// 80〜400Hz の周期の強さ(自己相関)で判定する。1 に近いほど声らしい
function voicedness(x) {
  const n = x.length;
  let e0 = 0; for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 < 1e-6) return 0;
  let best = 0;
  for (let lag = 40; lag <= 200; lag += 2) {
    let c = 0, e1 = 0;
    for (let i = 0; i + lag < n; i += 2) { c += x[i] * x[i + lag]; e1 += x[i + lag] * x[i + lag]; }
    const r = c / Math.sqrt((e0 / 2) * e1 + 1e-9);
    if (r > best) best = r;
  }
  return best;
}
const W_RATE = 16000;
// 無音や雑音から出がちな決まり文句(誤認識)
const HALLU = /ご視聴|ありがとうございました|チャンネル登録|字幕|おやすみなさい|^[\s。、.…]*$/;
export const aiStatus = () => W.ready ? 'ready' : W.failed ? 'failed' : W.worker ? (W.pct >= 0 ? 'loading:' + W.pct : 'loading') : 'off';

function loadWhisper(cpu = false) {
  if (W.worker || !window.Worker) return;
  try { W.worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' }); }
  catch (e) { W.failed = true; return; }
  W.cpu = cpu;
  W.worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { W.pct = data.p; handlers.ai?.('loading:' + data.p + ':' + data.mb); }
    else if (data.type === 'ready') { W.ready = true; W.device = data.device; handlers.ai?.('ready:' + data.device); if (!vosk.listening && !vosk.starting && !vosk.wanted && engine === 'vosk' && !continuous) engine = 'whisper'; }
    else if (data.type === 'error') { console.warn('Whisper failed', data.msg); whisperDown('error'); }
    else if (data.type === 'result') onWhisperResult(data);
  };
  // 別スレッドそのものが落ちた時(メモリ不足・GPU の喪失など)。放っておくと「聞き取り中…」のまま戻らない
  W.worker.onerror = e => { console.warn('Whisper worker crashed', e?.message || e); whisperDown('crash'); };
  W.worker.postMessage({ type: 'load', cpu });
}
// 聞き取りの返事を待つのは WAIT_MS まで。過ぎたら打ち切って、唱え直せる状態に戻す
const WAIT_MS = 9000;
function watch() { clearTimeout(W.watch); W.watch = setTimeout(() => { W.timeouts = (W.timeouts || 0) + 1; console.warn('Whisper timeout', W.timeouts); releaseWait(); handlers.ai?.('timeout'); if (W.timeouts >= 2) whisperDown('slow'); }, WAIT_MS); }
function releaseWait() { clearTimeout(W.watch); W.pending.clear(); W.busy = false; if (!continuous && !W.rec) handlers.state('idle'); else if (continuous) handlers.state('listening'); }
// AI 認識が使えなくなった: いったん端末内の軽い認識(Vosk)に戻し、GPU で動かしていたなら CPU の軽いモデルで入れ直す
function whisperDown(why) {
  const wasGpu = !W.cpu, wasListening = W.rec || W.wanted || continuous;
  try { W.worker?.terminate(); } catch {}
  clearTimeout(W.watch); clearTimeout(W.stopTimer);
  W.worker = null; W.ready = false; W.rec = false; W.wanted = false; W.busy = false; W.pending.clear(); W.timeouts = 0; W.pct = -1; W.device = null;
  if (engine === 'whisper') engine = 'vosk';
  handlers.state('idle');
  if (wasGpu) { handlers.ai?.('retry-cpu'); loadWhisper(true); } else { W.failed = true; handlers.ai?.('failed'); }
  if (wasListening && (continuous || pttWanted)) startListening();
}
async function wMic() {
  if (W.ctx) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = W.ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => {
      if (!W.rec) return;
      const x = e.inputBuffer.getChannelData(0), r = ctx.sampleRate / W_RATE;
      const out = new Float32Array(Math.floor(x.length / r));
      let sum = 0;
      for (let i = 0; i < out.length; i++) { const v = x[Math.floor(i * r)]; out[i] = v; sum += v * v; }
      const rms = Math.sqrt(sum / Math.max(1, out.length));
      W.buf.push(out); W.n += out.length; W.peak = Math.max(W.peak, rms);
      // 人の声の区間だけを数える(物音は一瞬で、周期も無い)
      const voiced = rms > 0.012 && voicedness(out) > 0.45;
      if (voiced) { W.voiced += out.length / W_RATE; W.lastVoiced = W.n; }
      // 常時詠唱: 声が途切れて 0.8 秒たったら一区切り
      if (continuous) {
        if (voiced) { W.speaking = true; W.silence = 0; }
        else if (W.speaking && (W.silence += out.length / W_RATE) > 0.8) { W.speaking = false; W.silence = 0; sendWhisper('final'); }
        else if (!W.speaking && W.n > W_RATE * 1.5) { W.buf = []; W.n = 0; W.peak = 0; W.voiced = 0; W.lastVoiced = 0; W.sentAt = 0; } // 声の無い音は捨てる
      }
      // 話している途中も、区切りなく文字にしていく(途中経過)
      // 声が途切れた瞬間(句の切れ目・魔法の名を言い終えた所)にすぐ文字にする。話し続けている間は2.5秒ごと
      const pause = W.n - (W.lastVoiced || 0) > W_RATE * 0.28 && (W.lastVoiced || 0) > W.sentAt;
      if (!W.busy && W.voiced > 0.25 && (pause || W.n - W.sentAt > W_RATE * 2.5)) sendWhisper('interim');
    };
    src.connect(node); node.connect(ctx.destination);
    return true;
  } catch (e) { handlers.state('error:' + (e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture')); return false; }
}
function takeAudio(keep) {
  const a = new Float32Array(W.n); let o = 0;
  for (const b of W.buf) { a.set(b, o); o += b.length; }
  if (!keep) { W.buf = []; W.n = 0; W.sentAt = 0; W.lastVoiced = 0; }
  return a;
}
function sendWhisper(kind) {
  if (kind === 'interim') {
    W.busy = true; W.sentAt = W.n;
    const request = ++W.request; W.pending.add(request);
    W.worker.postMessage({ type: 'run', id: W.id, session: W.session, request, kind, audio: takeAudio(true) });
    return;
  }
  const peak = W.peak, voiced = W.voiced; W.peak = 0; W.voiced = 0;
  const audio = takeAudio(false);
  W.id++;
  if (peak < 0.015 || voiced < 0.3 || audio.length < W_RATE * 0.3) { if (!continuous) handlers.state('idle'); return; } // 声が無かった
  W.busy = true;
  const request = ++W.request; W.pending.add(request);
  handlers.state('thinking'); watch();
  W.worker.postMessage({ type: 'run', id: W.id, session: W.session, request, kind, audio }, [audio.buffer]);
}
function onWhisperResult({ id, session, request, kind, text }) {
  if (!W.pending.delete(request)) return; // 同じ返答を二度使わない
  W.busy = W.pending.size > 0;
  if (kind !== 'interim') { clearTimeout(W.watch); W.timeouts = 0; }
  if (session !== W.session) return; // 次の V 詠唱に古い結果を混ぜない
  const t = HALLU.test(text) || !/[ぁ-んァ-ヶ一-龯]/.test(text) ? '' : text;
  if (kind === 'interim') { if (id === W.id && t && (W.rec || continuous)) handlers.interim(t); return; }
  if (t) handlers.final([t]);
  if (!continuous && !W.rec) handlers.state('idle');
  else if (continuous) handlers.state('listening');
}
async function wStart() {
  clearTimeout(W.stopTimer);
  if (!W.wanted) W.session++;
  W.wanted = true;
  if (W.starting) return;
  W.starting = true;
  const ok = await wMic();
  W.starting = false;
  if (!ok || !W.wanted) { if (!ok) W.wanted = false; return; }
  W.ctx.resume();
  if (!W.rec || !continuous) { W.buf = []; W.n = 0; W.peak = 0; W.voiced = 0; W.lastVoiced = 0; W.sentAt = 0; W.speaking = false; W.silence = 0; W.id++; }
  W.rec = true; handlers.state('listening');
}
function wStop(force) {
  W.wanted = false;
  clearTimeout(W.stopTimer);
  if (!W.rec) return;
  // 語尾を取りこぼさないよう少しだけ録り続けてから確定
  W.stopTimer = setTimeout(() => { if (W.wanted) return; W.rec = false; if (W.n) sendWhisper('final'); else handlers.state('idle'); }, force ? 0 : 250);
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
