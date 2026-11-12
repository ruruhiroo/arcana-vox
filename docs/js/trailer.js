// 予告動画の撮影台本(開発用。ゲーム本体からは読み込まない)。
// ゲームを 1/30 秒ずつ進めては画面を取り込み、字幕を重ねて、撮影サーバー(tools/capture-server.js)へ送る。音楽は music.js で書き出して一緒に送る。
//   ブラウザの検証から:  (await import('/js/trailer.js')).run()
// 構成(ゲームの予告動画の定石に合わせる):
//   0〜4秒   つかみ: 題字から始めず、いちばん強い場面(守護者の大技と、こちらの魔法)
//   〜21秒   遊びの核: 声に出した言葉が魔法になる → 言霊の組み合わせ → 魔導書 → 封印の大扉
//   〜37秒   畳みかけ: 六体の守護者の大技を、音楽の小節に合わせて切り替える → 仲間と
//   〜45秒   結び: 一言と題名
import * as THREE from 'three';
import * as D from './dev.js';
import { openArenaDoor } from './arena-room.js';
import { Enemy } from './entities.js';
import { makeModel } from './glbmodels.js';
import { dragonDuration, SPECIALS } from './dragon-rules.js';
import { renderMusic } from './music.js';

const W = 1280, H = 720, FPS = 30;
const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
let n = 0, url = 'http://localhost:8099/';
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const fadeIO = (t, a = 0.18, b = 0.82) => smooth(t / a) * (1 - smooth((t - b) / (1 - b)));
const FONT = '"Shippori Mincho B1", serif';

// 音楽の拍に合わせた時間割。守護者の曲は 1小節 = 2.143秒、激昂すると 1.948秒
const BAR1 = 60 / 112 * 4, BAR2 = BAR1 / 1.1;
const T_CORE = BAR1 * 10, T_END = T_CORE + BAR2 * 8, T_ALL = T_END + 8.6;
let clock = 0;                                           // いま何秒めまで撮ったか
const framesUntil = t => { const f = Math.round(t * FPS) - Math.round(clock * FPS); clock = t; return f; };

async function send() {
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  await fetch(url + '?n=' + n++, { method: 'POST', body: blob });
}
function grabGame() {
  const g = window.G.renderer.domElement;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const s = Math.max(W / g.width, H / g.height), w = g.width * s, h = g.height * s;
  ctx.drawImage(g, (W - w) / 2, (H - h) / 2, w, h);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 46); ctx.fillRect(0, H - 46, W, 46);
}
function text(main, sub, alpha, y = H * 0.5, size = 44, gap = '  ') {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#eadfc4'; ctx.font = `500 ${size}px ${FONT}`;
  ctx.fillText([...main].join(gap), W / 2, y);
  const g = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0); g.addColorStop(0, 'rgba(205,180,124,0)'); g.addColorStop(0.5, 'rgba(205,180,124,.9)'); g.addColorStop(1, 'rgba(205,180,124,0)');
  ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillRect(W / 2 - 300, y + size * 0.72, 600, 1.5);
  if (sub) { ctx.shadowBlur = 10; ctx.fillStyle = '#c8b48a'; ctx.font = `400 ${Math.round(size * 0.42)}px ${FONT}`; ctx.fillText([...sub].join(' '), W / 2, y + size * 1.25); }
  ctx.restore();
}
function black(alpha) { if (alpha > 0.005) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`; ctx.fillRect(0, 0, W, H); } }
const caption = (s, a, y = H - 104) => text(s, '', a, y, 27, ' ');
// 左上の小さな見出し(いま何を見せているか)
function tagline(s, a) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#d8b46a'; ctx.fillRect(64, 86, 3, 30);
  ctx.fillStyle = '#f0e6cc'; ctx.font = `600 30px ${FONT}`; ctx.fillText(s, 80, 102);
  ctx.restore();
}
// 詠唱の聞き取り表示: 声に出した言葉が一文字ずつ現れる
function chantBox(full, shown, a, glow = 0) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = `600 31px ${FONT}`;
  const chars0 = [...full], tw = chars0.reduce((n, c) => n + ctx.measureText(c).width + 2, 0);
  const w = Math.min(W - 80, tw + 130), h = 74, x = (W - w) / 2, y = H - 190;
  ctx.fillStyle = 'rgba(8,5,12,.72)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = `rgba(216,180,106,${0.45 + glow * 0.55})`; ctx.lineWidth = 1.5; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  // マイク
  const mx = x + 44, my = y + h / 2;
  ctx.strokeStyle = ctx.fillStyle = glow > 0.5 ? '#ffd890' : '#d8b46a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(mx - 7, my - 18, 14, 24, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx, my - 2, 13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx, my + 11); ctx.lineTo(mx, my + 20); ctx.moveTo(mx - 8, my + 20); ctx.lineTo(mx + 8, my + 20); ctx.stroke();
  for (let k = 0; k < 3; k++) { ctx.globalAlpha = a * (0.25 + 0.5 * Math.abs(Math.sin(shown * 0.9 + k))); ctx.beginPath(); ctx.arc(mx, my - 6, 22 + k * 8, -0.3 * Math.PI, 0.3 * Math.PI); ctx.stroke(); }
  ctx.globalAlpha = a; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `600 31px ${FONT}`;
  const chars = [...full]; let cx = x + 96;
  chars.forEach((c, i) => { ctx.fillStyle = i < shown ? (glow > 0.5 ? '#ffe9b8' : '#f0e6cc') : 'rgba(240,230,204,.16)'; ctx.fillText(c, cx, my + 1); cx += ctx.measureText(c).width + 2; });
  ctx.restore();
}

// 一場面: frames コマのあいだ、each(i, t) で状態を決め → 1コマ進め → 取り込み → over(t, i) で字幕などを重ねる
async function shot(frames, each, over) {
  const G = window.G;
  G.debugHold = true;
  for (let i = 0; i < frames; i++) {
    const t = i / Math.max(1, frames - 1);
    each?.(i, t);
    G.player.hp = G.player.maxHp = 99999; G.player.mp = G.player.maxMp = 999;
    G.debugAdvance(1 / FPS);
    grabGame();
    over?.(t, i);
    await send();
  }
}
async function card(frames, draw) {
  for (let i = 0; i < frames; i++) { ctx.fillStyle = '#050406'; ctx.fillRect(0, 0, W, H); draw(i / Math.max(1, frames - 1), i); await send(); }
}
function look(G, from, to, pitch = 0.05) {
  G.player.pos.set(from.x, from.y ?? G.player.pos.y, from.z);
  G.player.yaw = Math.atan2(from.x - to.x, from.z - to.z); G.player.pitch = pitch;
}
const hideUi = () => { for (const id of ['banner', 'log', 'goals', 'meieiFx', 'chantBox', 'micState', 'tut', 'bossTitle']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } };
const boss = () => window.G.enemies.find(e => e.type === 'dragon' && e.alive);
let L = null;
function cast(words) { const G = window.G; G.player.castLock = 0; G.player.chanting = false; try { G.debugChant(L.expandChant(words)); } catch (e) { (window.__trLog ||= []).push(String(e).slice(0, 120)); } }
// 守護者に、指定の技を構えさせる(pre 秒ぶんは撮らずに進めておく)
function force(id, pre = 0) {
  const G = window.G, e = boss(), s = e.dragon;
  s.stage = 'windup'; s.move = id; s.origin = e.pos.toArray(); s.target = G.player.pos.toArray(); s.yaw = e.yaw; s.serial++; s.chain = 0; s.tempo = 1; s.remaining = dragonDuration(s); e.dragonHit = new Set();
  G.debugHold = true; if (pre > 0) { G.player.hp = G.player.maxHp = 99999; G.debugAdvance(pre); }
}
const facing = (G, b, dist, side = 0) => { const f = new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)), r = new THREE.Vector3(f.z, 0, -f.x); return b.pos.clone().addScaledVector(f, dist).addScaledVector(r, side); };

export async function run(opts = {}) {
  url = opts.url || url; n = opts.start || 0; clock = 0;
  const G = window.G;
  await document.fonts?.ready;
  L = await import('./lexicon.js');
  // ---- 音楽: 守護者の曲 → 激昂 → 静かな結び ----
  const wav = await renderMusic([[0, 'boss', { floor: 1, phase2: false }], [T_CORE, 'boss', { floor: 3, phase2: true }], [T_END, 'explore', { floor: 1, phase2: false }]], T_ALL);
  await fetch(url + '?file=bgm.wav', { method: 'POST', body: wav });

  await D.arena({ dist: 15 }); await D.floor1(); await D.arena({ dist: 14 });
  hideUi();
  const a = G.dungeon.arena, gate = a.gates[0], nx = gate.dx, nz = gate.dz;
  const out = k => new THREE.Vector3(gate.x + nx * k, gate.y, gate.z + nz * k);

  // ==== 1. つかみ(2小節): 竜が炎を吐きながら回る大技の中へ、分かれて追う魔弾を撃ち込む ====
  { const b = boss(); G.VM.setHeld('grimoire'); look(G, facing(G, b, 15, 2), b.pos, 0.2); force('inferno', 3.25);
    await shot(framesUntil(BAR1 * 2), (i) => { const bb = boss(); G.player.yaw = Math.atan2(G.player.pos.x - bb.pos.x, G.player.pos.z - bb.pos.z); G.player.pitch = 0.2;
      if (i === 12) cast('汝に 分裂 追尾 氷獄 穿槍'); if (i === 62) cast('汝に 分裂 雷霆 穿槍'); },
      (t) => { black(1 - smooth(t / 0.05)); }); }

  // ==== 2. 沈んだ学院の魔物(2小節) ====
  a.phase = 'dormant'; a.seenPhase = 'dormant';
  { const b = boss(); b.dragon.stage = 'idle'; b.dragon.remaining = 99; }
  G.VM.setHeld('grimoire');
  const lamp = new THREE.PointLight(0xffd8a8, 7, 22, 1.6); G.scene.add(lamp);
  const side = new THREE.Vector3(-nz, 0, nx), mobs = [];
  [['skeleton', -1.6, 10], ['ghoul', 1.5, 11], ['knight', -0.3, 13.5], ['lich', 2.6, 15], ['spider', -2.6, 14]].forEach(([type, sx, k], i) => {
    const e = new Enemy('tr' + i, type, out(k - 2).addScaledVector(side, sx), 1); e.aggro = false; G.enemies.push(e); mobs.push(e);
  });
  await shot(framesUntil(BAR1 * 4), (i, t) => { const from = out(19.6 - t * 3.4); look(G, from, out(9), 0.03); lamp.position.set(from.x - nx * 4, gate.y + 3.2, from.z - nz * 4); for (const e of mobs) e.aggro = false; },
    (t) => { black(1 - smooth(t / 0.06)); tagline('沈んだ「声の学院」', fadeIO(t, 0.1, 0.85)); caption('声を失ったものが、汝の詠唱に引き寄せられる。', fadeIO(t, 0.2, 0.85)); });

  // ==== 3. 遊びの核(2小節): 声に出した言葉が、魔法になる ====
  const CH = '仇なす汝に、燃ゆる紅蓮の焔よ、分かたれよ ――「ファイア」';
  await shot(framesUntil(BAR1 * 6), (i, t) => { const from = out(16.2 + t * 1.6); look(G, from, out(9), 0.03); lamp.position.set(from.x - nx * 4, gate.y + 3.2, from.z - nz * 4); if (i === 0) for (const e of mobs) e.aggro = true;
      if (i === 74) cast('汝に 分裂 紅蓮 穿槍'); if (i === 100) cast('汝に 分裂 紅蓮 穿槍'); },
    (t, i) => { tagline('声で、唱える', fadeIO(t, 0.05, 0.9)); chantBox(CH, Math.floor(i / 72 * [...CH].length), fadeIO(t, 0.04, 0.93), i >= 72 ? 1 : 0); });
  for (const e of mobs) { e.alive = false; e.hp = 0; if (e.root) e.root.visible = false; }

  // ==== 4. 言霊の組み合わせ(2小節): 分裂・追尾・連鎖 ====
  a.phase = 'active'; a.seenPhase = 'active'; a.activeAt = -99;
  { const b = boss(); b.dragon.stage = 'idle'; b.dragon.remaining = 99; look(G, facing(G, b, 15, -2), b.pos, 0.17); }
  const COMBO = [[4, '汝に 分裂 氷獄 穿槍', '分裂 × 氷獄'], [46, '汝に 追尾 深淵 穿槍', '追尾 × 深淵'], [88, '汝に 連鎖 雷霆 穿槍', '連鎖 × 雷霆']];
  await shot(framesUntil(BAR1 * 8), (i) => { const bb = boss(); bb.dragon.remaining = 99; G.player.yaw = Math.atan2(G.player.pos.x - bb.pos.x, G.player.pos.z - bb.pos.z) + 0.04 * Math.sin(i * 0.07); G.player.pitch = 0.17;
      for (const [f, w] of COMBO) if (i === f) cast(w); },
    (t, i) => { tagline('言霊を組み合わせる', fadeIO(t, 0.05, 0.9)); const c = COMBO.filter(c => i >= c[0]).pop(); if (c) text(c[2], '', Math.min(1, (i - c[0]) / 6) * (1 - smooth((i - c[0] - 30) / 10)), H - 150, 40, ' '); });

  // ==== 5. 魔導書(1小節): 頁をめくって呪文を選ぶ ====
  { const vu = G.VM.update; G.VM.update = (dt, o) => vu(dt, { ...o, reading: true });
    G.debugAdvance(0.9);
    await shot(framesUntil(BAR1 * 9), (i) => { boss().dragon.remaining = 99; if (i === 14) { G.VM.flip(1); G.page = (G.page + 1) % Math.max(1, 3); G.onPageChange(); } },
      (t) => { tagline('己の魔導書に、呪文を記す', fadeIO(t, 0.08, 0.88)); });
    G.VM.update = vu; G.debugAdvance(0.5); }

  // ==== 6. 封印の大扉(1小節) ====
  a.phase = 'dormant'; a.seenPhase = 'dormant'; G.VM.setHeld('none');
  G.debugAdvance(0.1); openArenaDoor(); G.debugAdvance(0.6);
  await shot(framesUntil(BAR1 * 10), (i, t) => { const from = out(7 - t * 4.5); look(G, from, out(-5), 0.07); lamp.position.set(from.x, gate.y + 3.4, from.z); },
    (t) => { caption('封印の大扉の先に、守護者が眠る。', fadeIO(t, 0.12, 0.85)); black(smooth((t - 0.9) / 0.1)); });
  G.scene.remove(lamp);

  // ==== 7. 畳みかけ(6小節): 六体の守護者の大技 ====
  const SHOW = { fire: 'eruption', ice: 'absolute', thunder: 'judgment', wind: 'tempest', holy: 'verdict', void: 'eclipse' };
  const TITLES = { fire: '紅蓮の守護者', ice: '氷獄の守護者', thunder: '雷霆の守護者', wind: '颶風の守護者', holy: '聖光の守護者', void: '深淵の守護者' };
  for (let k = 0; k < 6; k++) {
    if (k) await D.next();
    await D.arena({ dist: 15, side: k % 2 ? 3 : -3 });
    hideUi(); G.VM.setHeld('none');
    const b = boss(), el = b.dragon.element, id = SHOW[el], nm = b.name.replace(/[【】]|終章・/g, '');
    look(G, facing(G, b, id === 'absolute' ? 12 : 16, k % 2 ? 4 : -4), b.pos.clone().setY(b.pos.y + 2), 0.2);
    force(id, Math.max(0, SPECIALS[id].warn - 0.3));
    const p0 = G.player.pos.clone();
    await shot(framesUntil(T_CORE + BAR2 * (k + 1)), (i, t) => { const bb = boss(); const from = p0.clone().addScaledVector(new THREE.Vector3(Math.cos(bb.yaw), 0, -Math.sin(bb.yaw)), (k % 2 ? -1 : 1) * t * 2.2); look(G, from, bb.pos, 0.2); },
      (t) => { black(1 - smooth(t / 0.07)); text(nm, TITLES[el] + ' ― ' + SPECIALS[id].label, fadeIO(t, 0.12, 0.9), H - 150, 38); });
  }

  // ==== 8. 仲間と(2小節) ====
  { const b = boss(); b.dragon.stage = 'idle'; b.dragon.remaining = 99; G.VM.setHeld('grimoire');
    const me = facing(G, b, 17, 0); look(G, me, b.pos, 0.14);
    const allies = [];
    for (const [sx, col] of [[-2.6, 0x3a6ad0], [2.8, 0x3aa070]]) {
      const m = makeModel('mage'); if (!m) continue;
      const p = facing(G, b, 13.5, sx); m.position.copy(p); m.rotation.y = Math.atan2(p.x - b.pos.x, p.z - b.pos.z) + Math.PI;
      m.traverse(o => { if (o.isMesh && o.material.name === 'tint') { o.material = o.material.clone(); o.material.color.setHex(col); } });
      const ud = m.userData; if (ud.actions?.chant) { ud.cur?.stop(); ud.actions.chant.reset().play(); ud.cur = ud.actions.chant; }
      G.scene.add(m); allies.push(m);
    }
    await shot(framesUntil(T_END), (i) => { const bb = boss(); bb.dragon.remaining = 99; G.player.yaw = Math.atan2(G.player.pos.x - bb.pos.x, G.player.pos.z - bb.pos.z); G.player.pitch = 0.14;
        for (const m of allies) m.userData.mixer?.update(1 / FPS);
        if (i === 8) cast('汝に 分裂 聖光 穿槍'); if (i === 40) cast('汝に 分裂 追尾 紅蓮 穿槍'); if (i === 74) cast('汝に 分裂 颶風 穿槍'); },
      (t) => { black(1 - smooth(t / 0.06)); tagline('仲間と、声を重ねる', fadeIO(t, 0.06, 0.88)); caption('違う属性を続けて当てれば、術は連なる。', fadeIO(t, 0.15, 0.85)); black(smooth((t - 0.92) / 0.08)); });
    for (const m of allies) G.scene.remove(m); }

  // ==== 9. 結び ====
  await card(framesUntil(T_END + 3.0), t => { text('声で、唱えろ。', '', fadeIO(t, 0.2, 0.8), H * 0.5, 54); });
  await card(framesUntil(T_ALL), t => { text('詠唱迷宮', 'A R C A N A   V O X', smooth(t / 0.22) * (1 - smooth((t - 0.9) / 0.1)), H * 0.44, 68); ctx.save(); ctx.globalAlpha = smooth((t - 0.3) / 0.2) * (1 - smooth((t - 0.9) / 0.1)); ctx.textAlign = 'center'; ctx.fillStyle = '#a89a7a'; ctx.font = `400 20px ${FONT}`; ctx.fillText('声で詠唱する協力迷宮探索  ―  開 発 中', W / 2, H * 0.68); ctx.restore(); });
  G.debugHold = false;
  return { frames: n, seconds: +(n / FPS).toFixed(2), log: window.__trLog };
}
