// WebAudio による手続き的効果音・環境音 (3D定位つき)
let ctx = null, master = null, sfxBus = null, musicIn = null, noiseBuf = null, listenerPos = { x: 0, z: 0 };
let sfxVol = 1, ambGain = null;
// 効果音(魔法・魔物・足音)の音量 0〜1
export function setSfxVolume(v) { sfxVol = v; if (sfxBus) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
// 環境音の音量 0〜1(設定画面の ％)。M キーの切り替えは、この値を 0 / 40% / 100% に動かす
export function setAmbienceVolume(v) { ambGain = v * 0.7; ambLevel = v > 0 ? 1 : 0; if (ambBus) ambBus.gain.setTargetAtTime(ambGain, ctx.currentTime, 0.2); }

export const getAudioCtx = () => ctx;
export const getMaster = () => master;
export const getMusicIn = () => musicIn;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.7 * masterVol;
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(master);
  const comp = ctx.createDynamicsCompressor();
  // 石造りの残響
  const conv = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  master.connect(comp); master.connect(conv); conv.connect(wet); wet.connect(comp); comp.connect(ctx.destination);
  // 音楽の出口: 全体の音量には従うが、効果音の圧縮は通さない
  musicIn = ctx.createGain(); musicIn.gain.value = 0.7 * masterVol;
  const mcomp = ctx.createDynamicsCompressor(); mcomp.threshold.value = -12; mcomp.knee.value = 18; mcomp.ratio.value = 2.5; mcomp.attack.value = 0.03; mcomp.release.value = 0.35;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 2800; air.gain.value = 5;   // 高い側を少し持ち上げて、こもりを取る
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 260; mud.Q.value = 0.8; mud.gain.value = -5;   // 低い側の濁りを少し削る
  const send = ctx.createGain(); send.gain.value = 0.16;
  const rumble = ctx.createBiquadFilter(); rumble.type = 'highpass'; rumble.frequency.value = 42;   // 聞こえない超低音は、濁りと圧縮の元になるだけなので切る
  musicIn.connect(rumble); rumble.connect(mud); mud.connect(air); air.connect(mcomp); mcomp.connect(ctx.destination);
  air.connect(send); send.connect(conv);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  ambience();
}

export function setListener(x, z, yaw) {
  listenerPos = { x, z };
  if (!ctx) return;
  const l = ctx.listener;
  if (l.positionX) { l.positionX.value = x; l.positionZ.value = z; l.positionY.value = 1.6; l.forwardX.value = -Math.sin(yaw); l.forwardZ.value = -Math.cos(yaw); l.forwardY.value = 0; l.upY.value = 1; }
}

function out(pos) {
  if (!pos) return sfxBus;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.2;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z; }
  p.connect(sfxBus); return p;
}

function noise(dur, { freq = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.01, pos, sweep } = {}) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out(pos)); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, to, pos, attack = 0.005 } = {}) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out(pos)); o.start(t); o.stop(t + dur + 0.05);
}

// 環境音の音量段階 (M キーで切替)
const AMB_LEVELS = [0, 0.3, 0.7];
let ambBus = null, ambLevel = 1;
export function setAmbience(level) {
  ambLevel = level;
  if (ambBus) ambBus.gain.setTargetAtTime(AMB_LEVELS[ambLevel], ctx.currentTime, 0.2);
}
export function cycleAmbience() {
  setAmbience((ambLevel + 2) % 3); // 小 → OFF → 中 → 小
  return ambLevel;
}
let masterVol = 0.8;
export function setMasterVolume(v) {
  masterVol = v;
  if (master) master.gain.setTargetAtTime(0.7 * v, ctx.currentTime, 0.05);
  if (musicIn) musicIn.gain.setTargetAtTime(0.7 * v, ctx.currentTime, 0.05);
}

function ambience() {
  // 低いうなりと遠い滴り — 控えめな専用バスに流す
  ambBus = ctx.createGain(); ambBus.gain.value = ambGain ?? AMB_LEVELS[ambLevel]; ambBus.connect(master);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o1.frequency.value = 55; o2.frequency.value = 55.4; o1.type = o2.type = 'sine';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
  g.gain.value = 0.07; o1.connect(f); o2.connect(f); f.connect(g); g.connect(ambBus); o1.start(); o2.start();
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0.01; wind.connect(wf); wf.connect(wg); wg.connect(ambBus); wind.start();
  setInterval(() => {
    if (!ambLevel || Math.random() > 0.35) return;
    tone(1800 + Math.random() * 900, 0.25, { gain: 0.02 * (ambGain ?? AMB_LEVELS[ambLevel]), to: 600, pos: { x: listenerPos.x + (Math.random() - 0.5) * 30, z: listenerPos.z + (Math.random() - 0.5) * 30, y: 3 } });
  }, 3000);
  // 炎のはぜる音: 近くの松明・かがり火から、ぱちぱちと聞こえる(ザーという風の代わり)
  const crackle = () => {
    setTimeout(crackle, 50 + Math.random() * 260);
    const lv = ambGain ?? AMB_LEVELS[ambLevel]; if (!lv || ctx.state !== 'running') return;
    const d = globalThis.G?.dungeon; if (!d) return;
    let best = null, bd = 14 * 14;
    for (const list of [d.torches, d.braziers]) for (const s of list || []) { const p = s.pos || s, q = (p.x - listenerPos.x) ** 2 + (p.z - listenerPos.z) ** 2; if (q < bd) { bd = q; best = p; } }
    if (!best) return;
    const pos = { x: best.x, y: 2, z: best.z }, big = Math.random() < 0.15;
    noise(big ? 0.07 : 0.025, { freq: big ? 900 + Math.random() * 600 : 2200 + Math.random() * 2600, type: 'bandpass', q: 1.5, gain: (big ? 0.5 : 0.28) * lv * (0.5 + Math.random() * 0.5), attack: 0.002, pos });
    if (big) tone(110 + Math.random() * 50, 0.09, { gain: 0.1 * lv, to: 55, pos });
  };
  crackle();
}

const ELEM_SND = {
  fire: p => { noise(0.9, { freq: 600, sweep: 2500, gain: 0.5, pos: p }); tone(90, 0.5, { type: 'sawtooth', gain: 0.15, to: 40, pos: p }); },
  ice: p => { tone(2400, 0.4, { type: 'triangle', gain: 0.15, to: 3400, pos: p }); noise(0.5, { freq: 5000, type: 'highpass', gain: 0.25, pos: p }); },
  thunder: p => { noise(0.6, { freq: 3000, type: 'bandpass', q: 0.4, gain: 0.7, pos: p }); tone(60, 0.8, { type: 'square', gain: 0.2, to: 30, pos: p }); },
  holy: p => { [523, 659, 784].forEach((f, i) => tone(f, 1.0, { type: 'sine', gain: 0.12, pos: p, attack: 0.02 + i * 0.03 })); },
  void: p => { tone(140, 0.9, { type: 'sawtooth', gain: 0.2, to: 50, pos: p }); noise(0.8, { freq: 300, gain: 0.3, pos: p }); },
  wind: p => { noise(0.8, { freq: 800, type: 'bandpass', q: 1.5, gain: 0.5, sweep: 2400, pos: p }); },
};

export const sfx = {
  dragonWing(pos) { if (!ctx) return; noise(.55, { freq: 350, sweep: 1200, gain: .25, pos }); },
  dragonLand(pos) { if (!ctx) return; noise(.55, { freq: 180, sweep: 70, gain: .4, pos }); tone(50, .45, { type: 'sine', gain: .2, to: 28, pos }); },
  dragonCharge(pos, move) { if (!ctx) return; tone(move === 'meteor' ? 110 : 52, 1.4, { type: 'sawtooth', gain: .16, to: move === 'meteor' ? 210 : 38, attack: .18, pos }); noise(.8, { freq: move === 'breath' ? 700 : 180, sweep: 450, gain: .2, pos }); },
  dragonFire(pos) { if (!ctx) return; noise(1.8, { freq: 1800, sweep: 380, gain: .65, pos }); tone(48, 1.6, { type: 'sawtooth', gain: .18, to: 27, pos }); },
  dragonTail(pos) { if (!ctx) return; noise(1.3, { freq: 220, sweep: 1600, gain: .45, pos }); tone(65, .8, { type: 'sawtooth', gain: .14, to: 35, pos }); },
  cast(elements, pos) { if (!ctx) return; if (!elements.length) tone(880, 0.5, { type: 'sine', gain: 0.15, to: 1320, pos }); elements.forEach(e => ELEM_SND[e]?.(pos)); },
  impact(elements, pos) { if (!ctx) return; noise(0.5, { freq: 900, gain: 0.5, pos, sweep: 150 }); tone(70, 0.35, { gain: 0.25, to: 35, pos }); },
  heal(pos) { if (!ctx) return; [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.6, { gain: 0.08, pos }), i * 60)); },
  ward(pos) { if (!ctx) return; tone(330, 0.8, { type: 'triangle', gain: 0.15, to: 440, pos }); },
  hit(pos) { if (!ctx) return; noise(0.15, { freq: 1800, gain: 0.4, pos }); tone(180, 0.15, { type: 'square', gain: 0.12, to: 80, pos }); },
  hurt() { if (!ctx) return; tone(120, 0.3, { type: 'sawtooth', gain: 0.25, to: 60 }); noise(0.2, { freq: 600, gain: 0.3 }); },
  fizzle(pos) { if (!ctx) return; noise(0.4, { freq: 2000, type: 'highpass', gain: 0.2, pos }); tone(300, 0.3, { gain: 0.1, to: 120, pos }); },
  pickup() { if (!ctx) return; tone(990, 0.15, { gain: 0.15 }); setTimeout(() => tone(1480, 0.2, { gain: 0.12 }), 80); },
  learn() { if (!ctx) return; [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.8, { type: 'triangle', gain: 0.1 }), i * 110)); },
  step(pos) { if (!ctx) return; noise(0.08, { freq: 350, gain: 0.08, pos }); },
  // 一節を唱え切るたびに上がっていく和音
  stage(n) { if (!ctx) return; const f = 330 * Math.pow(2, (n * 3) / 12); tone(f, 0.9, { type: 'triangle', gain: 0.09, attack: 0.01 }); tone(f * 1.5, 0.7, { type: 'sine', gain: 0.05, attack: 0.02 }); },
  meiei() { if (!ctx) return; [261, 329, 392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 1.6, { type: 'triangle', gain: 0.1 }), i * 45)); noise(1.2, { freq: 300, sweep: 5000, gain: 0.25 }); },
  crumble(pos) { if (!ctx) return; noise(1.4, { freq: 220, gain: 0.7, pos, sweep: 60 }); tone(55, 1.0, { type: 'sawtooth', gain: 0.25, to: 30, pos }); setTimeout(() => noise(0.8, { freq: 1200, type: 'bandpass', q: 0.6, gain: 0.25, pos }), 180); },
  bell(pos) { if (!ctx) return; [98, 196, 293, 392].forEach((f, i) => tone(f, 3.5 - i * 0.5, { type: 'sine', gain: 0.22 / (i + 1), pos, attack: 0.005 })); noise(0.3, { freq: 2500, type: 'bandpass', gain: 0.2, pos }); },
  chantStart() { if (!ctx) return; tone(220, 1.2, { type: 'sine', gain: 0.06, to: 330, attack: 0.3 }); },
  portal() { if (!ctx) return; tone(110, 2.5, { type: 'sine', gain: 0.25, to: 880, attack: 0.5 }); noise(2.5, { freq: 200, sweep: 4000, gain: 0.25 }); },
  growl(pos) { if (!ctx) return; tone(70 + Math.random() * 40, 0.6, { type: 'sawtooth', gain: 0.12, to: 50, pos }); },
};
