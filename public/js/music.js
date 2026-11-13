// 手続き的な BGM: 録音は使わず、その場で音を組み立てて鳴らす。管弦楽の響き(弦・金管・合唱・ティンパニ)で、暗く重い。
//   探索 = 低弦の持続音と震える弦、遠い角笛、ティンパニの遠鳴り、高い不協和の倍音、合唱
//   交戦 = 低弦の刻みとティンパニ、金管の一撃 / 聖域 = 穏やかな弦と合唱(ここだけは安らぐ)
//   守護者 = 六体それぞれに専用の曲(速さ・拍子・音階・主題・楽器の組み合わせが違う)。激昂すると半音上がって速くなり、打楽器が増える
// 詠唱中は音を下げる(マイクが曲を拾って、声の聞き取りを邪魔しないように)
import { getAudioCtx, getMaster, getMusicIn } from './audio.js';

const LEVELS = [0, 0.4, 0.75];
let bus = null, level = 1, duck = 1, timer = null;
let mood = 'explore', want = 'explore', opt = { floor: 1, phase2: false, el: 'fire', final: false }, step = 0, nextT = 0, bar = 0, playing = '';
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const SC = {
  minor: [0, 2, 3, 5, 7, 8, 10], phryg: [0, 1, 3, 5, 7, 8, 10], phrygDom: [0, 1, 4, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11],
};
const deg = (scale, d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const ROOTS = [50, 48, 52, 49, 53, 47, 51, 50, 48, 46]; // 層ごとに調を変える
const rnd = () => Math.random();

let octx = null;
const AC = () => octx || getAudioCtx();
function osc(type, f, t, dur, detune = 0) { const c = AC(), o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t); o.stop(t + dur + 0.1); return o; }
function lp(freq, q = 0.7, type = 'lowpass') { const f = AC().createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function gain(v = 0) { const g = AC().createGain(); g.gain.value = v; return g; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function swell(g, t, dur, vol, a = 0.35, r = 0.9) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(dur * a, 1.6)); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + r); }
let nbuf = null;
function noiseSrc(t, dur) { const c = AC(); if (!nbuf) { nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = c.createBufferSource(); s.buffer = nbuf; s.loop = true; s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }

// ---- 楽器(管弦楽) ----
// 弦の合奏。trem > 0 で弓を震わせる(不安な響き)
function strings(notes, t, dur, vol, { cutoff = 1100, trem = 0, a = 0.35 } = {}) {
  vol *= cutoff < 700 ? 0.5 : 1.9;   // 低い持続音は控えめに、中高域の弦は前へ
  const f = lp(cutoff * 2.4, 0.5), g = gain(); f.connect(g); g.connect(bus); swell(g, t, dur, vol, a);
  if (trem) { const c = AC(), l = c.createOscillator(), lg = gain(vol * trem); l.frequency.value = 8.5 + rnd(); l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + dur + 1.2); }
  for (const n of notes) for (const d of [-8, 8]) osc('sawtooth', midi(n), t, dur + 1, d).connect(f);
}
// 低弦の短い刻み(コントラバス・チェロ)
function lowStr(n, t, dur, vol) {
  const f = lp(600, 1.0), g = gain(); f.connect(g); g.connect(bus); env(g, t, 0.01, vol * 0.42, dur);
  f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(420, t + dur);
  osc('sawtooth', midi(n), t, dur).connect(f); osc('sawtooth', midi(n - 12), t, dur, 5).connect(f);
}
// 金管: 強い一撃(brass)と、ふくらむ長い音(horn)
function brass(notes, t, dur, vol) {
  vol *= 1.3;
  const f = lp(400, 1.5), g = gain(); f.connect(g); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(3200, t + 0.1); f.frequency.exponentialRampToValueAtTime(800, t + dur);
  for (const n of notes) for (const d of [-6, 7]) osc('sawtooth', midi(n), t, dur, d).connect(f);
}
function horn(notes, t, dur, vol) {
  vol *= notes[0] < 44 ? 0.7 : 1.3;   // 低い持続は控えめに、旋律の角笛は前へ
  const f = lp(300, 1.2), g = gain(); f.connect(g); g.connect(bus); swell(g, t, dur, vol, 0.5, 0.5);
  f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(1900, t + dur * 0.55); f.frequency.linearRampToValueAtTime(600, t + dur + 0.4);
  for (const n of notes) for (const d of [-5, 5]) osc('sawtooth', midi(n), t, dur + 0.5, d).connect(f);
}
// 合唱(「あ」の母音)
function choir(n, t, dur, vol) {
  vol *= 2.2;
  const g = gain(); g.connect(bus); swell(g, t, dur, vol, 0.35, 0.8);
  const c = AC(), vib = c.createOscillator(), vg = gain(4); vib.frequency.value = 4.6; vib.connect(vg); vib.start(t); vib.stop(t + dur + 1);
  for (const [ff, q, a] of [[720, 5, 1], [1150, 6, 0.6], [2700, 8, 0.22]]) {
    const b = lp(ff, q, 'bandpass'), bg = gain(a); b.connect(bg); bg.connect(g);
    for (const d of [-9, 8]) { const o = osc('sawtooth', midi(n), t, dur + 0.9, d); vg.connect(o.detune); o.connect(b); }
  }
}
// ティンパニ・大太鼓
function timp(t, vol, n = 38, dur = 0.5) {
  vol *= 0.45;
  const f0 = midi(n), g = gain(); g.connect(bus); env(g, t, 0.003, vol, dur);
  const o = osc('sine', f0 * 1.5, t, dur); o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.06); o.connect(g);
  const o2 = osc('triangle', f0 * 1.5, t, dur * 0.5), g2 = gain(); g2.connect(bus); env(g2, t, 0.003, vol * 0.3, dur * 0.4); o2.connect(g2);
  const ng = gain(), nf = lp(900, 0.6); nf.connect(ng); ng.connect(bus); env(ng, t, 0.002, vol * 1.1, 0.09); noiseSrc(t, 0.12).connect(nf);   // 皮を叩く音(輪郭)
}
// 弓の背で弦を叩く乾いた音・小太鼓
function tick(t, vol, hp = 6500, dur = 0.05) { const g = gain(), f = lp(hp, 0.7, 'highpass'); f.connect(g); g.connect(bus); env(g, t, 0.001, vol, dur); noiseSrc(t, dur + 0.02).connect(f); }
// 銅鑼・シンバルのうねり
function tam(t, dur, vol) { const g = gain(), f = lp(900, 0.4, 'bandpass'); f.connect(g); g.connect(bus); swell(g, t, dur, vol, 0.6, 1.2); f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + dur); noiseSrc(t, dur + 1.3).connect(f); }
// 高い倍音の不協和(弦のハーモニクス。半音でぶつけて、うなりを作る)
function eerie(n, t, dur, vol) { for (const k of [0, 1]) { const g = gain(); g.connect(bus); swell(g, t, dur, vol, 0.5, 1.5); osc('sine', midi(n + k), t, dur + 1.6, k * 7).connect(g); } }
// 笛(木管)
function flute(n, t, dur, vol) {
  const g = gain(); g.connect(bus); swell(g, t, dur, vol, 0.15, 0.25);
  const c = AC(), vib = c.createOscillator(), vg = gain(6); vib.frequency.value = 5.2; vib.connect(vg); vib.start(t); vib.stop(t + dur + 0.4);
  const o = osc('sine', midi(n), t, dur + 0.3); vg.connect(o.detune); o.connect(g);
  const o2 = osc('triangle', midi(n), t, dur + 0.3, 3), g2 = gain(0.25); o2.connect(g2); g2.connect(g);
}
// パイプオルガン
function organ(notes, t, dur, vol) {
  const g = gain(), f = lp(3400, 0.5); f.connect(g); g.connect(bus); swell(g, t, dur, vol, 0.08, 0.5);
  for (const n of notes) for (const [m, a] of [[1, 1], [2, 0.5], [3, 0.22], [4, 0.2]]) { const o = osc(m === 1 ? 'square' : 'sine', midi(n) * m, t, dur + 0.5), og = gain(a); o.connect(og); og.connect(f); }
}
// 大聖堂の鐘(聖堂騎像の曲だけで鳴る)
function bell(n, t, vol, dur = 4) { for (const [m, a, d] of [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.35], [0.5, 0.4, 1]]) { const g = gain(); g.connect(bus); env(g, t, 0.004, vol * a, dur * d); osc('sine', midi(n) * m, t, dur * d).connect(g); } }
// 主旋律(金管の独奏)
function lead(n, t, dur, vol) {
  vol *= 1.6;
  const f = lp(2400, 1.6), g = gain(); f.connect(g); g.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(2100, t + 0.08);
  osc('sawtooth', midi(n), t, dur + 0.2, -5).connect(f); osc('sawtooth', midi(n), t, dur + 0.2, 6).connect(f);
}
// 弦の速い分散和音
function arp(n, t, dur, vol) { const f = lp(1900, 0.8), g = gain(); f.connect(g); g.connect(bus); env(g, t, 0.012, vol, dur); osc('sawtooth', midi(n), t, dur, -6).connect(f); osc('sawtooth', midi(n), t, dur, 6).connect(f); }

// ---- 守護者ごとの曲 ----
//   bpm, spb = 1小節の拍(16分)の数, scale, prog = 和音の度数の進行, shift = 小節ごとの移調(半音), g = 音量の釣り合い
//   bass = 低弦の刻み(度数。null は休み), drum = ティンパニの強さ, lead = 主題 [拍, 度数, 長さ] を 2小節ぶん, leadBy = 主題を歌う楽器
const BOSS = {
  // 炎鱗竜ヴォルグ: 金管が吠え、ティンパニが叩きつける。フリギア・ドミナントの灼けた旋律
  fire: { bpm: 120, spb: 16, scale: SC.phrygDom, prog: [0, 0, 1, 0], g: 1,
    bass: [0, 0, 4, 0, 0, 0, 5, 4, 0, 0, 4, 0, 1, 0, 6, 4], drum: [1, 0, 0, .5, 0, 0, .8, 0, 1, 0, .5, 0, .8, 0, .6, .6],
    lead: [[0, 7, 3], [3, 8, 1], [4, 7, 4], [8, 5, 4], [12, 4, 4], [16, 7, 3], [19, 8, 1], [20, 9, 4], [24, 8, 2], [26, 7, 2], [28, 5, 4]],
    bar(t, s, ch, bl, p2) { if (s === 0) { horn([ch(0) - 12, ch(4) - 12, ch(0)], t, bl * 0.9, 0.05); strings([ch(0), ch(2), ch(4)], t, bl, 0.03, { trem: 0.4, cutoff: 1500 }); } if (s === 6 || s === 14) brass([ch(0), ch(2), ch(4)], t, 0.28, 0.07); if (p2 && s % 2) tick(t, 0.03); } },
  // 氷冠巨人ニヴァリス: 遅く重い。地を揺らす大太鼓、低い金管の持続、凍った高音が降りてくる。主題は合唱
  ice: { bpm: 80, spb: 16, scale: SC.minor, prog: [0, 5, 3, 4], g: 1.15, leadBy: 'choir',
    bass: [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, 4, null], drum: [1.3, 0, 0, 0, 0, 0, 0, 0, 1.1, 0, 0, 0, 0, 0, .5, 0],
    lead: [[0, 4, 8], [8, 5, 8], [16, 2, 8], [24, 1, 8]],
    bar(t, s, ch, bl, p2) { if (s === 0) { horn([ch(0) - 24, ch(0) - 12], t, bl * 0.95, 0.07); strings([ch(0) - 12, ch(2), ch(4)], t, bl, 0.035, { cutoff: 800 }); } if (s % 2 === 0) { const g = gain(); g.connect(bus); env(g, t, 0.004, 0.022, 1.4); osc('sine', midi(ch([7, 4, 2, 0, 4, 2, 0, -3][s / 2]) + 24), t, 1.5).connect(g); } if (s === 4 || s === 12) tick(t, 0.07, 3000, 0.2); if (p2 && (s === 6 || s === 10)) timp(t, 0.35, 34); } },
  // 雷角獣ヴァジュラ: 速い三連の疾走。小太鼓の連打と、不意に落ちる金管の一撃
  thunder: { bpm: 138, spb: 12, scale: SC.harm, prog: [0, 3, 0, 4], g: 0.95,
    bass: [0, null, 0, 0, null, 0, 4, null, 4, 0, null, 2], drum: [1, 0, 0, .5, 0, 0, .9, 0, 0, .5, 0, .5],
    lead: [[0, 7, 2], [2, 9, 1], [3, 7, 3], [6, 4, 3], [9, 5, 3], [12, 7, 2], [14, 9, 1], [15, 11, 3], [18, 9, 3], [21, 7, 3]],
    bar(t, s, ch, bl, p2) { if (s === 0) strings([ch(0), ch(2), ch(4)], t, bl, 0.03, { trem: 0.5, cutoff: 1700 }); tick(t, s % 3 === 0 ? 0.06 : 0.025, 2600, 0.06); if ((s === 5 || s === 10) && rnd() < 0.55) brass([ch(0) - 12, ch(4) - 12, ch(0)], t, 0.22, 0.08); if (p2 && s === 0) tam(t, bl * 0.8, 0.02); } },
  // 嵐翼グリフォン: 三拍子。渦を巻く弦の分散和音の上を、笛が長く歌う
  wind: { bpm: 126, spb: 12, scale: SC.dorian, prog: [0, 6, 5, 4], g: 1.05, leadBy: 'flute',
    bass: [0, null, null, null, 4, null, null, null, 2, null, null, null], drum: [.8, 0, 0, 0, 0, 0, 0, 0, .4, 0, 0, 0],
    lead: [[0, 9, 6], [6, 7, 6], [12, 8, 6], [18, 4, 6]],
    bar(t, s, ch, bl, p2, sx) { if (s === 0) { strings([ch(0) - 12, ch(4) - 12], t, bl, 0.035, { cutoff: 900 }); horn([ch(0) - 12], t, bl * 0.9, 0.035); } const a = [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7][s]; arp(ch(a) - 12, t, sx * 1.6, 0.05); if (p2) arp(ch(a), t + sx * 0.5, sx, 0.026); } },
  // 聖堂騎像アウレリア: 荘厳で冷たい。パイプオルガンと合唱、大聖堂の鐘。裁きの行進
  holy: { bpm: 96, spb: 16, scale: SC.dorian, prog: [0, 3, 6, 4], g: 1.25,
    bass: [0, null, null, null, 4, null, null, null, 2, null, null, null, 4, null, null, null], drum: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .7, 0, .9, 0, 0, 0],
    lead: [[0, 4, 4], [4, 5, 4], [8, 7, 6], [14, 5, 2], [16, 4, 4], [20, 2, 4], [24, 3, 8]],
    bar(t, s, ch, bl, p2) { if (s === 0) { organ([ch(0) - 12, ch(0), ch(2), ch(4)], t, bl * 0.96, 0.034); choir(ch(4), t, bl * 0.9, 0.02); strings([ch(2), ch(4)], t, bl, 0.016, { cutoff: 1200 }); if (bar % 2 === 0) bell(ch(0) - 12, t, 0.05, 5); } if (p2 && s % 4 === 2) timp(t, 0.3, 41); } },
  // 深淵の死神ノクス: 遅く、半音ずつ沈んでいく低音(嘆きの低音)。心臓の鼓動、半音でぶつかる合唱、三全音の角笛
  void: { bpm: 66, spb: 16, scale: SC.locrian, prog: [0, 0, 0, 0], shift: [0, -1, -2, -3], g: 1.9, leadBy: 'horn',
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], drum: [.9, 0, 0, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lead: [[8, 4, 4], [12, 3, 4], [24, 6, 6]],
    bar(t, s, ch, bl, p2) { if (s === 0) { strings([ch(0) - 24, ch(0) - 12], t, bl, 0.03, { cutoff: 600 }); strings([ch(0), ch(3)], t, bl, 0.012, { trem: 0.6, cutoff: 1400 }); choir(ch(2), t, bl * 0.95, 0.018); choir(ch(2) + 1, t + 0.3, bl * 0.9, 0.013); eerie(ch(0) + 36, t, bl, 0.009); } if (s === 8 && bar % 2) tam(t, bl * 0.5, 0.03); if (p2 && (s === 8 || s === 11)) timp(t, s === 8 ? 0.3 : 0.45, 33, 0.6); } },
};

// ---- 一拍ぶんを鳴らす。返り値 = その拍の長さ(秒) ----
function playStep(t) {
  const fl = ((opt.floor || 1) - 1) % ROOTS.length;
  if (mood === 'boss') {
    const B = BOSS[opt.el] || BOSS.fire, p2 = !!opt.phase2, s = step % B.spb, sx = 60 / (B.bpm * (opt.final ? 1.12 : 1) * (p2 ? 1.1 : 1)) / 4, bl = sx * B.spb;
    const root = ROOTS[fl] - 2 + (p2 ? 1 : 0) + (B.shift ? B.shift[bar % B.shift.length] : 0), cd = B.prog[bar % B.prog.length];
    const ch = d => root + deg(B.scale, cd + d);
    const keep = bus; if (B.g !== 1) { bus = AC().createGain(); bus.gain.value = B.g; bus.connect(keep); }   // 曲ごとの音量の釣り合い
    B.bar(t, s, ch, bl, p2, sx);
    const b = B.bass[s]; if (b !== null && b !== undefined) lowStr(ch(b) - 24, t, B.bpm < 90 ? sx * 3.5 : sx * 0.95, 0.17);
    if (B.drum[s]) timp(t, 0.42 * B.drum[s], B.drum[s] >= 1 ? 36 : 43, B.drum[s] >= 1 ? 0.55 : 0.3);
    const ph = (bar % 2) * B.spb + s;                                              // 主題は4小節のうち後ろの2小節で歌う(激昂したら毎回)
    if (p2 || bar % 4 >= 2) for (const [at, d, len] of B.lead) if (at === ph) {
      const n = root + 12 + deg(B.scale, d), du = sx * len * 0.92;
      if (B.leadBy === 'choir') choir(n, t, du, 0.03); else if (B.leadBy === 'flute') flute(n - 12, t, du, 0.07); else if (B.leadBy === 'horn') horn([n - 12], t, du, 0.06); else { lead(n, t, du, 0.05); if (p2) lead(n - 12, t, du, 0.03); }
    }
    bus = keep; step++; if (step % B.spb === 0) bar++;
    return sx;
  }
  const s = step % 16, bpm = { explore: 50, combat: 104, sanct: 56 }[mood] || 50, sx = 60 / bpm / 4, bl = sx * 16;
  const scale = mood === 'sanct' ? SC.major : SC.phryg, root = ROOTS[fl] + (mood === 'sanct' ? 3 : -2);
  const cd = (mood === 'sanct' ? [0, 3, 5, 4] : [0, 1, 0, 6])[bar % 4], ch = d => root + deg(scale, cd + d);
  if (mood === 'explore') {
    if (s === 0) {
      strings([ch(0) - 24, ch(0) - 12], t, bl, 0.032, { cutoff: 520 });                                    // 低弦の持続
      strings([ch(0), ch(2), ch(4)], t, bl, 0.03, { trem: 0.55, cutoff: 1500 });                         // 震える弦
      if (bar % 2 === 0 && rnd() < 0.6) choir(ch(2) - 12, t + bl * 0.2, bl * 1.5, 0.01);                  // 低い声の唸り(高い声は使わない)
      if (rnd() < 0.4) lowStr(ch(1) - 24, t + bl * 0.3, bl * 0.5, 0.05);                                 // 半音ずれた低弦が、ときどき軋む
      if (rnd() < 0.15) tam(t, bl * 0.9, 0.018);
    }
    if (s === 8 && rnd() < 0.3) { horn([ch(0)], t, sx * 5, 0.03); horn([ch(bar % 2 ? 3 : 4)], t + sx * 5, sx * 8, 0.028); }   // 遠い角笛
    if (s === 12 && rnd() < 0.3) for (let k = 0; k < 3; k++) timp(t + k * sx * (1.4 - k * 0.3), 0.08 + k * 0.05, 34);        // ティンパニの遠鳴り
  } else if (mood === 'sanct') {
    if (s === 0) { strings([ch(0) - 12, ch(2), ch(4), ch(6)], t, bl, 0.035, { cutoff: 1000, a: 0.5 }); if (bar % 2 === 0) choir(ch(4), t, bl * 1.6, 0.009); }
    if (s === 4 && bar % 4 === 1) { horn([ch(4) - 12], t, sx * 6, 0.03); horn([ch(2) - 12], t + sx * 6, sx * 6, 0.028); }   // 笛ではなく、低い角笛
  } else {    // 交戦
    if (s === 0) { strings([ch(0), ch(2), ch(4)], t, bl, 0.028, { trem: 0.6, cutoff: 1600 }); if (bar % 2 === 0) brass([ch(0) - 12, ch(4) - 12, ch(0)], t, sx * 5, 0.06); }
    if (s % 2 === 0) lowStr(ch([0, 0, 2, 0, 4, 0, 2, 1][s / 2]) - 24, t, sx * 1.6, 0.17);
    if (s === 0 || s === 8) timp(t, 0.42, 36); if (s === 6 || s === 14) timp(t, 0.24, 43, 0.3);
    tick(t, s % 4 === 2 ? 0.045 : 0.018, 2800, 0.05);
  }
  step++; if (step % 16 === 0) bar++;
  return sx;
}
const keyOf = (m, el) => m === 'boss' ? 'boss:' + el : m;

function pump() {
  const c = getAudioCtx(); if (!c || !bus) return;
  if (document.hidden || !level) { nextT = 0; return; }
  if (c.state !== 'running') return;
  if (!nextT || nextT < c.currentTime + 0.02) nextT = c.currentTime + 0.1;
  while (nextT < c.currentTime + 0.6) {
    if (keyOf(want, opt.el) !== playing && step % 4 === 0) { mood = want; playing = keyOf(want, opt.el); step = 0; bar = 0; }   // 曲は拍の頭で切り替える
    nextT += playStep(nextT);
  }
}

export function startMusic() {
  const c = getAudioCtx(), m = getMusicIn() || getMaster(); if (!c || !m || bus) return;
  bus = c.createGain(); bus.gain.value = LEVELS[level] * duck; bus.connect(m);
  timer = setInterval(pump, 70);
}
// 音楽の音量 0〜1(設定画面の ％)
export function setMusicVolume(v) { level = v > 0 ? 1 : 0; LEVELS[1] = v * 1.4; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, 0.3); }
export function setMusicLevel(l) { level = l; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, 0.3); }
// mood: 'explore' | 'combat' | 'boss' | 'sanct'。o = { floor, phase2, el(守護者の属性), final }
export function setMusic(m, o = {}) { want = ['explore', 'combat', 'boss', 'sanct'].includes(m) ? m : 'explore'; Object.assign(opt, o); }
export function setMusicDuck(on) { const d = on ? 0.45 : 1; if (d === duck) return; duck = d; if (bus) bus.gain.setTargetAtTime(LEVELS[level] * duck, getAudioCtx().currentTime, on ? 0.08 : 0.6); }
export const musicState = () => ({ mood, want, step, bar, level, el: opt.el, playing, running: !!bus });
export const getMusicBus = () => bus; // 確かめ用(音が出ているかを測る)

// ---- 予告動画用: 曲を実時間より速く書き出す。timeline = [[秒, 曲調, {floor, phase2, el}], ...]。WAV(16bit ステレオ)の Blob を返す ----
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
  let t = 0.02, ti = 0, cur = '';
  while (t < dur - 0.3) {
    while (ti < timeline.length && timeline[ti][0] <= t + 0.001) { const [, m, o] = timeline[ti++]; mood = m; Object.assign(opt, o || {}); if (keyOf(mood, opt.el) !== cur) { cur = keyOf(mood, opt.el); step = 0; bar = 0; } }
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
