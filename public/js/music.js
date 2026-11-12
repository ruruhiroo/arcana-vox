// 手続き的な BGM: 録音は使わず、その場で音を組み立てて鳴らす。状況(探索・交戦・守護者・聖域)で曲調が変わる。
//   探索 = 低い持続音と、遠い合唱、まばらな撥弦 / 交戦 = 低音の刻みと太鼓が加わる /
//   守護者 = 速い低音の反復、太鼓、合唱、金管の一撃、主題の旋律。激昂すると全体が一音上がって速くなる / 聖域 = 長調の鐘と和音
// 詠唱中は音を下げる(マイクが曲を拾って、声の聞き取りを邪魔しないように)
import { getAudioCtx, getMaster } from './audio.js';

const LEVELS = [0, 0.4, 0.75];
let bus = null, level = 1, duck = 1, timer = null;
let mood = 'explore', want = 'explore', opt = { floor: 1, phase2: false }, step = 0, nextT = 0, bar = 0;
const BPM = { explore: 54, combat: 96, boss: 112, sanct: 60 };
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
const deg = (scale, d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
// 和音の進行(音階の度数。0 = 主音)
const PROG = { explore: [0, 5, 2, 6], combat: [0, 3, 0, 4], boss: [0, 0, 5, 4], sanct: [0, 3, 5, 4] };
const ROOTS = [50, 48, 52, 50, 53, 49, 51, 50, 48, 46]; // 層ごとに調を変える(第1層 = ニ短調)

function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
let octx = null;
const AC = () => octx || getAudioCtx();
function osc(type, f, t, dur, detune = 0) { const c = AC(), o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t); o.stop(t + dur + 0.1); return o; }
function lp(freq, q = 0.7, type = 'lowpass') { const f = AC().createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function gain(v = 0) { const g = AC().createGain(); g.gain.value = v; return g; }
let nbuf = null;
function noiseSrc(t, dur) { const c = AC(); if (!nbuf) { nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = c.createBufferSource(); s.buffer = nbuf; s.loop = true; s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }

// ---- 楽器 ----
function pad(notes, t, dur, vol, cutoff = 700) {           // 弦のような和音
  const f = lp(cutoff, 0.5), g = gain(); f.connect(g); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.4)); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
  for (const n of notes) for (const d of [-7, 6]) osc('sawtooth', midi(n), t, dur + 1.2, d).connect(f);
}
function choir(n, t, dur, vol) {                            // 遠い合唱(「あ」の母音の響き)
  const g = gain(); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
  const c = AC(), vib = c.createOscillator(), vg = gain(4); vib.frequency.value = 4.6; vib.connect(vg); vib.start(t); vib.stop(t + dur + 1);
  for (const [ff, q, a] of [[720, 5, 1], [1150, 6, 0.6], [2700, 8, 0.22]]) {
    const b = lp(ff, q, 'bandpass'), bg = gain(a); b.connect(bg); bg.connect(g);
    for (const d of [-9, 8]) { const o = osc('sawtooth', midi(n), t, dur + 0.9, d); vg.connect(o.detune); o.connect(b); }
  }
}
function pluck(n, t, vol, dur = 1.6) {                      // 撥弦(竪琴)
  const g = gain(), f = lp(2400, 0.5); f.connect(g); g.connect(bus); env(g, t, 0.004, vol, dur);
  f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
  osc('triangle', midi(n), t, dur).connect(f); const o2 = osc('sine', midi(n + 12), t, dur * 0.5), g2 = gain(0.35); o2.connect(g2); g2.connect(f);
}
function bell(n, t, vol, dur = 3) {                         // 鐘
  for (const [m, a, d] of [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.2, 0.35]]) { const g = gain(); g.connect(bus); env(g, t, 0.003, vol * a, dur * d); osc('sine', midi(n) * m, t, dur * d).connect(g); }
}
function bass(n, t, dur, vol) {                             // 低弦の刻み
  const f = lp(260, 1.2), g = gain(); f.connect(g); g.connect(bus); env(g, t, 0.008, vol, dur);
  f.frequency.setValueAtTime(520, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
  osc('sawtooth', midi(n), t, dur).connect(f); osc('square', midi(n - 12), t, dur, 4).connect(f);
}
function drum(t, vol, f0 = 95, f1 = 42, dur = 0.42) {       // 太鼓
  const g = gain(); g.connect(bus); env(g, t, 0.003, vol, dur);
  const o = osc('sine', f0, t, dur); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7); o.connect(g);
  const ng = gain(), nf = lp(240, 0.6); nf.connect(ng); ng.connect(bus); env(ng, t, 0.002, vol * 0.5, 0.12); noiseSrc(t, 0.14).connect(nf);
}
function tick(t, vol, hp = 6500, dur = 0.05) { const g = gain(), f = lp(hp, 0.7, 'highpass'); f.connect(g); g.connect(bus); env(g, t, 0.001, vol, dur); noiseSrc(t, dur + 0.02).connect(f); }
function brass(notes, t, dur, vol) {                        // 金管の一撃
  const f = lp(400, 1.5), g = gain(); f.connect(g); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(1900, t + 0.12); f.frequency.exponentialRampToValueAtTime(500, t + dur);
  for (const n of notes) for (const d of [-6, 7]) osc('sawtooth', midi(n), t, dur, d).connect(f);
}
function lead(n, t, dur, vol) {                             // 主題の旋律
  const f = lp(1700, 2), g = gain(); f.connect(g); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  osc('square', midi(n), t, dur + 0.2, -4).connect(f); osc('sawtooth', midi(n), t, dur + 0.2, 5).connect(f);
}

// ---- 一拍(16分音符)ぶんを鳴らす ----
const BOSS_BASS = [0, 0, 7, 0, 3, 0, 7, 5, 0, 0, 7, 0, 10, 7, 3, 5];
const BOSS_DRUM = [1, 0, 0, .6, 0, 0, .8, 0, 1, 0, 0, .6, 0, .5, .8, .5];
// 主題: 2小節。[拍, 度数, 長さ(16分)]
const THEME = [[0, 4, 6], [6, 5, 2], [8, 7, 4], [12, 5, 4], [16, 4, 4], [20, 2, 4], [24, 3, 3], [27, 1, 5]];
function playStep(t) {
  const s = step % 16, spb = 60 / BPM[mood] / (mood === 'boss' && opt.phase2 ? 1.1 : 1), sx = spb / 4;
  const scale = mood === 'sanct' ? MAJOR : MINOR;
  const root = ROOTS[((opt.floor || 1) - 1) % ROOTS.length] + (mood === 'boss' && opt.phase2 ? 2 : 0) + (mood === 'sanct' ? 3 : 0);
  const cd = PROG[mood][bar % 4], ch = d => root + deg(scale, cd + d);
  const barLen = sx * 16;
  if (mood === 'explore') {
    if (s === 0) { pad([ch(0) - 12, ch(4) - 12, ch(2)], t, barLen, 0.045, 620); if (bar % 2 === 0) choir(ch(bar % 4 === 0 ? 4 : 2) + 12, t + barLen * 0.25, barLen * 1.6, 0.012); }
    if (s % 2 === 0 && Math.random() < 0.2) pluck(root + 12 + deg(scale, [0, 2, 4, 6, 7, 9][Math.floor(Math.random() * 6)]), t, 0.05 + Math.random() * 0.03, 2.2);
    if (s === 8 && bar % 4 === 3 && Math.random() < 0.6) bell(ch(0) + 24, t, 0.02, 4);
  } else if (mood === 'sanct') {
    if (s === 0) pad([ch(0) - 12, ch(2), ch(4)], t, barLen, 0.04, 900);
    if (s % 4 === 0) bell(ch([0, 2, 4, 2][s / 4]) + 12, t, 0.035, 2.6);
    if (s === 10 && bar % 2 === 1) pluck(ch(7) + 12, t, 0.04, 2.5);
  } else if (mood === 'combat') {
    if (s === 0) pad([ch(0) - 12, ch(4) - 12, ch(2)], t, barLen, 0.04, 800);
    if (s % 2 === 0) bass(ch(s % 8 === 4 ? 4 : 0) - 24, t, sx * 1.7, 0.16);
    if (s === 0 || s === 8) drum(t, 0.42); if (s === 6 || s === 14) drum(t, 0.26, 130, 60, 0.3);
    if (s % 4 === 2) tick(t, 0.04);
    if (s === 12 && bar % 2 === 1) pluck(ch(4) + 12, t, 0.06, 1.2);
  } else {    // 守護者
    if (s === 0) { pad([ch(0) - 12, ch(4) - 12, ch(2)], t, barLen, 0.045, 1000); choir(ch(4) + 12, t, barLen * 0.95, 0.016); if (bar % 4 === 2 || bar % 4 === 0) brass([ch(0), ch(2), ch(4)], t, sx * 6, 0.07); }
    bass(ch(0) - 24 + (BOSS_BASS[s] === 7 ? deg(scale, 4) : BOSS_BASS[s] === 3 ? deg(scale, 2) : BOSS_BASS[s] === 5 ? deg(scale, 3) : BOSS_BASS[s] === 10 ? deg(scale, 6) : 0), t, sx * 0.95, 0.15);
    if (BOSS_DRUM[s]) drum(t, 0.5 * BOSS_DRUM[s], BOSS_DRUM[s] === 1 ? 90 : 120, BOSS_DRUM[s] === 1 ? 40 : 58, BOSS_DRUM[s] === 1 ? 0.45 : 0.25);
    if (s === 4 || s === 12) tick(t, 0.09, 1800, 0.14);
    if (opt.phase2 || s % 2 === 0) tick(t, opt.phase2 ? 0.035 : 0.025);
    const ph = (bar % 2) * 16 + s;                                    // 主題は4小節ごとに2小節ぶん歌う
    if (bar % 4 >= 2) for (const [at, d, len] of THEME) if (at === ph) lead(root + 12 + deg(scale, d), t, sx * len * 0.92, 0.05);
  }
  step++; if (step % 16 === 0) bar++;
  return sx;
}

function pump() {
  const c = getAudioCtx(); if (!c || !bus) return;
  if (document.hidden || !level) { nextT = 0; return; }
  if (c.state !== 'running') return;
  if (!nextT || nextT < c.currentTime - 0.5) nextT = c.currentTime + 0.08;
  while (nextT < c.currentTime + 0.3) {
    if (want !== mood && (step % 4 === 0)) { mood = want; step = 0; bar = 0; }   // 曲調は拍の頭で切り替える
    nextT += playStep(nextT);
  }
}

export function startMusic() {
  const c = getAudioCtx(), m = getMaster(); if (!c || !m || bus) return;
  bus = c.createGain(); bus.gain.value = LEVELS[level] * duck; bus.connect(m);
  timer = setInterval(pump, 70);
}
// 音楽の音量 0〜1(設定画面の ％)
export function setMusicVolume(v) { level = v > 0 ? 1 : 0; LEVELS[1] = v * 0.9; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, 0.3); }
export function setMusicLevel(l) { level = l; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, 0.3); }
// mood: 'explore' | 'combat' | 'boss' | 'sanct'。o = { floor, phase2 }
export function setMusic(m, o = {}) { want = BPM[m] ? m : 'explore'; Object.assign(opt, o); }
export function setMusicDuck(on) { const d = on ? 0.3 : 1; if (d === duck) return; duck = d; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, on ? 0.08 : 0.6); }
export const musicState = () => ({ mood, want, step, bar, level, running: !!bus });
export const getMusicBus = () => bus; // 確かめ用(音が出ているかを測る)

// ---- 予告動画用: 曲を実時間より速く書き出す。timeline = [[秒, 曲調, {floor, phase2}], ...]。WAV(16bit ステレオ)の Blob を返す ----
export async function renderMusic(timeline, dur, sr = 44100) {
  const keep = { bus, mood, want, opt: { ...opt }, step, bar, nbuf };
  octx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr); nbuf = null;
  const g = octx.createGain(), comp = octx.createDynamicsCompressor(), conv = octx.createConvolver(), wet = octx.createGain();
  const len = sr * 2.2, ir = octx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  conv.buffer = ir; wet.gain.value = 0.26;
  g.gain.setValueAtTime(1.5, 0); g.gain.setValueAtTime(1.5, Math.max(0, dur - 3)); g.gain.linearRampToValueAtTime(0.0001, dur);
  g.connect(comp); g.connect(conv); conv.connect(wet); wet.connect(comp); comp.connect(octx.destination);
  bus = g; step = 0; bar = 0;
  let t = 0.02, ti = 0;
  while (t < dur - 0.3) {
    while (ti < timeline.length && timeline[ti][0] <= t + 0.001) { const [, m, o] = timeline[ti++]; if (m !== mood) { mood = m; step = 0; bar = 0; } Object.assign(opt, o || {}); }
    t += playStep(t);
  }
  const buf = await octx.startRendering();
  octx = null; ({ bus, mood, want, step, bar, nbuf } = keep); Object.assign(opt, keep.opt);
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4)), L = buf.getChannelData(0), Rr = buf.getChannelData(1);
  const str = (o, x) => { for (let i = 0; i < x.length; i++) out.setUint8(o + i, x.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, Rr[i])) * 32767, true); }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
