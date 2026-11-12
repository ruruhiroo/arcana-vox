// 部屋の種類ごとの仕掛け。
//   (1) 場の力: その部屋にいる間だけ効く(鍛冶場は炉の熱で炎の術が強まる、書庫は魔力の消費が減る…)。
//       術を放った者・傷を受けた者が「いまいる部屋」で決まる。魔物の側には掛からない。
//   (2) 調べられる置物: 庭園の泉・錬金工房の大釜・鍛冶場の金床・天文室の天球儀・墓所の石棺。
// 置き場所(dungeon.js)と同じ考え方: 「なぜ、そこに在るか」が遊びにも表れるようにする。
import * as THREE from 'three';
import { G } from './state.js';
import { CELL, W } from './dungeon.js';
import { glowSprite } from './textures.js';

// el = 属性ごとの威力の倍率 / all = すべての術 / taken = 受ける傷 / cost = 魔力の消費 / regen = 魔力の戻り
export const AURAS = {
  forge: { name: '鍛冶場', note: '炉の熱 ― 炎の術 +25%・氷の術 −25%', el: { fire: 1.25, ice: 0.75 } },
  kitchen: { name: '厨房', note: '竈の火 ― 炎の術 +15%', el: { fire: 1.15 } },
  cellar: { name: '酒蔵', note: '地下の冷気 ― 氷の術 +25%・炎の術 −15%', el: { ice: 1.25, fire: 0.85 } },
  bath: { name: '浴場', note: '立ちこめる湯気 ― 雷の術 +25%・炎の術 −20%', el: { thunder: 1.25, fire: 0.8 } },
  garden: { name: '地下庭園', note: '生きた土と風 ― 風の術 +25%', el: { wind: 1.25 } },
  observatory: { name: '天文室', note: '星の導き ― 雷と風の術 +15%', el: { thunder: 1.15, wind: 1.15 } },
  crypt: { name: '墓所', note: '死者の眠り ― 聖の術 +25%・闇の術 −20%', el: { holy: 1.25, void: 0.8 } },
  shrine: { name: '祠', note: '祈りの名残 ― 聖の術 +15%', el: { holy: 1.15 } },
  prison: { name: '牢獄', note: '囚われた怨み ― 闇の術 +25%・聖の術 −20%', el: { void: 1.25, holy: 0.8 } },
  torture: { name: '拷問部屋', note: '染みついた怨み ― 闇の術 +25%・聖の術 −20%', el: { void: 1.25, holy: 0.8 } },
  ritual: { name: '祭祀場', note: '儀式の陣 ― すべての術 +20%。ただし受ける傷も +20%', all: 1.2, taken: 1.2 },
  library: { name: '書庫', note: '知の静けさ ― 術の魔力消費 −20%', cost: 0.8 },
  scriptorium: { name: '写本室', note: '写された言葉 ― 術の魔力消費 −20%', cost: 0.8 },
  mine: { name: '鉱坑', note: '魔晶の脈 ― 魔力の戻りが速い', regen: 1.6 },
};
// 調べられる置物: 置物の種類 → 仕掛け
const KINDS = {
  fountain: { hint: '泉の水を飲む', color: 0x8fd8ff, h: 1.5 },
  cauldron: { hint: '大釜で霊草を煮詰める(霊草 1)', color: 0x9effc8, h: 1.6 },
  anvil: { hint: '金床で魔導書の留め金を打ち直す(鉄屑 2)', color: 0xffb060, h: 1.3 },
  orrery: { hint: '天球儀を回す', color: 0xd8c8ff, h: 2.4 },
  sarcophagus: { hint: '石棺の蓋をずらす', color: 0xb070ff, h: 1.6 },
};
let H = null, cellRoom = null, cellOf = null, list = [], lastTheme = null, group = null;

export function initGimmicks(hooks) { H = hooks; }
function roomAt(pos) {
  const d = G.dungeon; if (!d) return null;
  if (cellOf !== d) { cellOf = d; cellRoom = new Map(); for (const rm of d.rooms || []) for (const [x, y] of rm.cells || []) cellRoom.set(y * W + x, rm); }
  return cellRoom.get(Math.floor(pos.z / CELL) * W + Math.floor(pos.x / CELL)) || null;
}
export const auraOf = pos => { const rm = pos && roomAt(pos); return (rm && rm.kind === 'room' && AURAS[rm.theme]) || null; };
// 術の威力: 放った者のいる部屋で決まる
export function spellMult(src, elements = []) {
  if (!src?.isMage) return 1;
  const a = auraOf(src.pos); let m = G.gimPower || 1;
  if (a) { m *= a.all || 1; let best = 1, worst = 1; for (const e of elements) { const k = a.el?.[e] || 1; if (k > best) best = k; if (k < worst) worst = k; } m *= best * worst; }
  return m;
}
export const takenMult = t => (t?.isMage && auraOf(t.pos)?.taken) || 1;
export const costMult = m => (m?.isMage && auraOf(m.pos)?.cost) || 1;

// 層を作った時: 調べられる置物を拾い出して、目印の光を灯す
export function buildGimmicks(d, scene) {
  clearGimmicks(scene);
  G.gimPower = 1; lastTheme = null;
  group = new THREE.Group(); scene.add(group);
  let n = 0;
  for (const o of d.decor || []) {
    const k = KINDS[o.type]; if (!k) continue;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: k.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    mark.position.set(o.pos.x, o.pos.y + k.h, o.pos.z); mark.scale.setScalar(0.7); group.add(mark);
    list.push({ id: 'gm' + n++, kind: o.type, pos: o.pos.clone(), used: false, mark });
  }
}
export function clearGimmicks(scene) { if (group) { scene.remove(group); group.traverse(o => o.material?.dispose?.()); } group = null; list = []; }
const near = p => { let best = null, bd = 2.9; for (const g of list) { if (g.used) continue; const d = Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z); if (d < bd && Math.abs(g.pos.y - p.pos.y) < 2.5) { bd = d; best = g; } } return best; };
export function gimmickHint(p, key) { const g = near(p); return g ? `${key}: ${KINDS[g.kind].hint}` : ''; }
function done(g) { g.used = true; if (g.mark) g.mark.visible = false; }

// 調べる。使えたら true
export function gimmickInteract(p) {
  const g = near(p); if (!g) return false;
  const ui = H.ui, inv = G.inv;
  if (g.kind === 'fountain') {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); p.mp = p.maxMp; done(g); H.sfx.learn?.();
    ui.log('泉の水を飲んだ ― 傷が癒え、魔力が満ちた', '#9fe4ff');
  } else if (g.kind === 'cauldron') {
    if (!(inv.herb > 0)) { ui.log('大釜は冷えている ― 霊草が一つ要る', '#a8a090'); return true; }
    inv.herb--; H.give('ether', 1); done(g); H.sfx.learn?.();
    ui.log('大釜で霊草を煮詰め、魔力薬を一つ得た', '#9effc8');
  } else if (g.kind === 'anvil') {
    if (!(inv.iron >= 2)) { ui.log('金床は使える ― 鉄屑が二つ要る', '#a8a090'); return true; }
    inv.iron -= 2; G.gimPower = (G.gimPower || 1) * 1.1; done(g); H.sfx.crumble?.(g.pos);
    ui.log('魔導書の留め金を打ち直した ― この層の間、術の威力 +10%', '#ffb060'); H.renderHotbar?.();
  } else if (g.kind === 'orrery') {
    G.explored?.fill(1); done(g); H.sfx.learn?.();
    ui.log('天球儀が回り、この層の姿を星図に映した', '#d8c8ff');
  } else if (g.kind === 'sarcophagus') {
    done(g);
    if (G.isHost || !G.net) openTomb(g); else G.net.send({ t: 'gim', to: G.hostId, id: g.id });
    G.net?.send({ t: 'gimUsed', id: g.id });
  }
  return true;
}
// 石棺: 副葬品が出るが、眠っていた者が起き上がる(部屋の主の側で起こす)
function openTomb(g) {
  H.ui.log('石棺の蓋がずれた ― 副葬品と、眠っていた者が現れる', '#d8b8ff'); H.sfx.crumble?.(g.pos);
  for (const m of ['bone', 'bone', 'shard']) H.spill(m, g.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6)));
  for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; H.spawn(`${g.id}_${i}_${G.floor}`, 'skeleton', g.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2))); }
}
export function gimmickNet(m) {
  const g = list.find(x => x.id === m.id); if (!g) return;
  if (m.t === 'gimUsed') done(g);
  else if (m.t === 'gim' && G.isHost) { done(g); openTomb(g); }
}

// 毎フレーム: 目印の明滅、場の力の表示、魔力の戻り
export function updateGimmicks(dt, p, time) {
  for (const g of list) if (!g.used && g.mark) { g.mark.material.opacity = 0.45 + Math.sin(time * 2.4 + g.pos.x) * 0.25; g.mark.position.y = g.pos.y + KINDS[g.kind].h + Math.sin(time * 1.3 + g.pos.z) * 0.08; }
  if (!p) return;
  const rm = roomAt(p.pos), theme = rm && rm.kind === 'room' ? rm.theme : null, a = theme && AURAS[theme];
  if (theme !== lastTheme) {
    lastTheme = theme;
    let el = document.getElementById('roomLabel');
    if (!el) { el = document.createElement('div'); el.id = 'roomLabel'; el.style.cssText = 'margin-top:6px;font-size:14px;letter-spacing:.08em;color:#d8c8a0;text-shadow:0 0 6px #000;max-width:340px;line-height:1.5;transition:opacity .6s'; document.getElementById('topLeft')?.insertBefore(el, document.getElementById('party')); }
    el.textContent = a ? `【${a.name}】${a.note}` : ''; el.style.opacity = a ? 1 : 0;
    if (a) H.ui.log(`【${a.name}】${a.note}`, '#e8d8a8');
  }
  if (a?.regen && p.alive && !p.downed && !p.chanting) p.mp = Math.min(p.maxMp, p.mp + dt * 2.5 * (a.regen - 1));
}
