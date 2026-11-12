// 紹介映像の撮影台本(開発用。ゲーム本体からは読み込まない)。
// ゲームを 1/30 秒ずつ進めては画面を取り込み、字幕を重ねて、撮影サーバー(tools/capture-server.js)へ送る。
//   ブラウザの検証から:  (await import('/js/trailer.js')).run()
import * as THREE from 'three';
import * as D from './dev.js';
import { openArenaDoor } from './arena-room.js';
import { Enemy } from './entities.js';

const W = 1280, H = 720, FPS = 30;
const wait = ms => new Promise(r => setTimeout(r, ms));
const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
let n = 0, url = 'http://localhost:8099/';
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const fadeIO = (t, a = 0.18, b = 0.82) => smooth(t / a) * (1 - smooth((t - b) / (1 - b)));

async function send() {
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  await fetch(url + '?n=' + n++, { method: 'POST', body: blob });
}
// 画面を取り込む(上下に帯を付けて映画の画角にする)
function grabGame() {
  const g = window.G.renderer.domElement;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const s = Math.max(W / g.width, H / g.height), w = g.width * s, h = g.height * s;
  ctx.drawImage(g, (W - w) / 2, (H - h) / 2, w, h);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, H - 54, W, 54);
}
function text(main, sub, alpha, y = H * 0.5, size = 44) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#eadfc4'; ctx.font = `500 ${size}px "Shippori Mincho B1", serif`;
  const spaced = [...main].join('  ');
  ctx.fillText(spaced, W / 2, y);
  const g = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0); g.addColorStop(0, 'rgba(205,180,124,0)'); g.addColorStop(0.5, 'rgba(205,180,124,.9)'); g.addColorStop(1, 'rgba(205,180,124,0)');
  ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillRect(W / 2 - 300, y + size * 0.72, 600, 1.5);
  if (sub) { ctx.shadowBlur = 10; ctx.fillStyle = '#c8b48a'; ctx.font = `400 ${Math.round(size * 0.42)}px "Shippori Mincho B1", serif`; ctx.fillText([...sub].join(' '), W / 2, y + size * 1.25); }
  ctx.restore();
}
function black(alpha) { if (alpha > 0.005) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`; ctx.fillRect(0, 0, W, H); } }
const caption = (s, a) => text(s, '', a, H - 110, 26);

// 一場面: frames コマのあいだ、each(i, t) で状態を決め → 1コマ進め → 取り込み → over(t) で字幕などを重ねる
async function shot(frames, each, over) {
  const G = window.G;
  G.debugHold = true; // ここからは、1コマ = 1/30秒 で正確に進める
  for (let i = 0; i < frames; i++) {
    const t = i / Math.max(1, frames - 1);
    each?.(i, t);
    G.player.hp = G.player.maxHp = 99999;
    G.debugAdvance(1 / FPS);
    grabGame();
    over?.(t, i);
    await send();
  }
}
async function card(frames, draw) {
  for (let i = 0; i < frames; i++) { ctx.fillStyle = '#050406'; ctx.fillRect(0, 0, W, H); draw(i / Math.max(1, frames - 1)); await send(); }
}
function look(G, from, to, pitch = 0.05) {
  G.player.pos.set(from.x, from.y ?? G.player.pos.y, from.z);
  G.player.yaw = Math.atan2(from.x - to.x, from.z - to.z); G.player.pitch = pitch;
}
const hideUi = () => { for (const id of ['banner', 'log', 'goals', 'meieiFx', 'chantBox', 'micState', 'tut', 'bossTitle']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } };

export async function run(opts = {}) {
  url = opts.url || url; n = opts.start || 0;
  const G = window.G;
  await document.fonts?.ready;
  // ---- 題字 ----
  await card(75, t => { text('詠唱迷宮', 'A R C A N A   V O X', fadeIO(t), H * 0.46, 64); });
  await card(60, t => { text('禁じられた一語が、声の学院を沈めた。', '', fadeIO(t), H * 0.5, 30); });

  // ---- 魔物: 声を失ったものたち ----
  await D.arena({ dist: 15 });
  await D.floor1();
  await D.arena({ dist: 15 });
  hideUi();
  const boss = () => G.enemies.find(e => e.type === 'dragon' && e.alive);
  const a = G.dungeon.arena, gate = a.gates[0], nx = gate.dx, nz = gate.dz;
  const out = k => new THREE.Vector3(gate.x + nx * k, gate.y, gate.z + nz * k);
  a.phase = 'dormant'; a.seenPhase = 'dormant';
  G.VM.setHeld('none');
  const lamp = new THREE.PointLight(0xffd8a8, 7, 22, 1.6); G.scene.add(lamp);
  const mobs = [];
  const side = new THREE.Vector3(-nz, 0, nx);
  [['skeleton', -1.6, 9.5], ['ghoul', 1.4, 10.5], ['knight', -0.2, 13], ['lich', 2.6, 14.5]].forEach(([type, sx, k], i) => {
    const p = out(k).addScaledVector(side, sx);
    const e = new Enemy('tr' + i, type, p, 1); e.aggro = true; G.enemies.push(e); mobs.push(e);
  });
  await shot(105, (i, t) => {
    const from = out(20 - t * 2.5); look(G, from, out(10), 0.02 + 0.02 * Math.sin(t * 5));
    lamp.position.set(from.x - nx * 3, gate.y + 3.2, from.z - nz * 3);
  }, t => { black(1 - smooth(t / 0.12)); caption('声を失ったものが、汝の詠唱に引き寄せられる。', fadeIO(t, 0.2, 0.85)); black(smooth((t - 0.9) / 0.1)); });
  for (const e of mobs) { e.alive = false; e.hp = 0; if (e.root) e.root.visible = false; }

  // ---- 封印の大扉 ----
  await shot(50, (i, t) => { const from = out(11 - t * 5.5); look(G, from, out(0), 0.06); lamp.position.set(from.x, gate.y + 3.4, from.z); },
    t => { black(1 - smooth(t / 0.15)); });
  openArenaDoor();
  await shot(70, (i, t) => { const from = out(5.5 - t * 2.2); look(G, from, out(-4), 0.06); lamp.position.set(from.x, gate.y + 3.4, from.z); }, t => { caption('封印の大扉の向こうに、砕けた「沈黙」の一片を抱くものが眠る。', fadeIO(t, 0.15, 0.85)); });
  G.scene.remove(lamp);

  // ---- 守護者の登場 ----
  const b = boss();
  await shot(40, (i, t) => { const from = out(3.3 - t * 7.5); look(G, from, b.pos, 0.1 + 0.08 * t); });
  const name = b.name.replace(/[【】]/g, '');
  await shot(150, (i, t) => { const from = out(-4.2 - t * 1.2); look(G, from, b.pos, 0.2 + 0.05 * t); },
    t => { text(name, '紅蓮の守護者', fadeIO(Math.max(0, (t - 0.3) / 0.7), 0.2, 0.8), H * 0.72, 46); });

  // ---- 詠唱して戦う ----
  await combat(G, boss);

  // ---- 六つの守護者 ----
  const titles = { giant: '氷獄の守護者', beast: '雷霆の守護者', griffin: '颶風の守護者', sentinel: '聖光の守護者', reaper: '深淵の守護者' };
  for (let k = 0; k < 5; k++) {
    await D.next();
    const r = await D.arena({ dist: 15, side: 3 });
    hideUi(); G.VM.setHeld('none');
    const bb = boss(), nm = bb.name.replace(/[【】]/g, '');
    const p0 = G.player.pos.clone();
    await shot(62, (i, t) => { const from = p0.clone().add(new THREE.Vector3(-3 + t * 4, 0, -t * 2.5)); look(G, from, bb.pos, 0.2); },
      t => { black(1 - smooth(t / 0.14)); text(nm, titles[r.species] || '', fadeIO(t, 0.25, 0.85), H * 0.74, 40); black(smooth((t - 0.88) / 0.12)); });
  }

  // ---- 結び ----
  await card(50, t => { text('声で、唱えろ。', '', fadeIO(t), H * 0.5, 52); });
  await card(90, t => { text('詠唱迷宮', 'A R C A N A   V O X', smooth(t / 0.25), H * 0.46, 64); });
  return { frames: n };
}

// 詠唱して戦う場面
async function combat(G, boss) {
  G.VM.setHeld('grimoire');
  const L = await import('./lexicon.js');
  window.__trLog = [];
  const chants = { 10: '汝に 紅蓮 穿槍', 48: '汝に 分裂 氷獄 穿槍', 88: '汝に 追尾 深淵 穿槍', 128: '汝に 聖光 穿槍', 162: '汝に 分裂 追尾 雷霆 穿槍' };
  await shot(215, (i, t) => {
    const bb = boss(); if (!bb) { window.__trLog.push('no boss'); return; }
    G.player.yaw = Math.atan2(G.player.pos.x - bb.pos.x, G.player.pos.z - bb.pos.z) + 0.05 * Math.sin(i * 0.08); G.player.pitch = 0.16;
    if (bb.pos.distanceTo(G.player.pos) < 13) { const away = G.player.pos.clone().sub(bb.pos).setY(0).normalize(); G.player.pos.addScaledVector(away, 0.2); }
    if (chants[i]) {
      G.player.castLock = 0; G.player.chanting = false; G.player.mp = G.player.maxMp = 999;
      const before = G.projectiles.length;
      try { G.debugChant(L.expandChant(chants[i])); } catch (e) { window.__trLog.push(String(e.stack || e).slice(0, 200)); }
      window.__trLog.push(i + ': ' + before + '->' + G.projectiles.length + ' held=' + G.held + ' mp=' + Math.round(G.player.mp));
    }
  }, t => { caption('言霊を組み、声に出して唱えよ。', fadeIO(Math.min(1, t / 0.42), 0.15, 0.8)); caption('属性・出し方・修飾 ― 組み合わせは、汝の魔導書に。', fadeIO((t - 0.5) / 0.5, 0.15, 0.8)); });
}
// 戦闘の場面だけを撮り直す(コマ番号 start から上書き)
export async function retakeCombat(start = 550) {
  n = start;
  const G = window.G;
  await D.arena({ dist: 16, side: 0 });
  await D.floor1();
  await D.arena({ dist: 16, side: 0 });
  hideUi();
  const boss = () => G.enemies.find(e => e.type === 'dragon' && e.alive);
  await combat(G, boss);
  return { frames: n, log: window.__trLog };
}
