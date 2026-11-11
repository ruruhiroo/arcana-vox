// 仲間と騒げる迷宮の仕掛け。人数が多いほど条件が厳しくなり、ひとりでも解ける形を残す
//   重石の床   : 床の石板をすべて同時に踏む(人が足りなければ、道具を落として重しにする)
//   合唱の封印 : 封印の円の中で、仲間と声を合わせて4秒以内に術を放つ(ひとりなら15秒のうちに二度)
//   刻の燭台   : 一つ灯すと時が動き出す。時が尽きる前にすべてを灯す(どの属性の術でも灯る)
//   呪いの宝珠 : 宝珠を遠くの封印台まで運ぶ。持つと足が重く、時が尽きると爆ぜる。仲間に渡すと時が延びる
import * as THREE from 'three';
import { G } from './state.js';
import { glowSprite } from './textures.js';

let H = null;       // main から: ui, sfx, addPickup(id, kind, pos, data), damage(mage, n)
let gims = [];
export const coopProgress=()=>gims.map((g,i)=>g.done?i:-1).filter(i=>i>=0);
export function restoreCoopProgress(ids=[]){for(const i of ids)if(gims[i])gims[i].done=true;}
const casts = [];   // 最近の詠唱 { id, t }

export function initCoop(hooks) { H = hooks; }
export const partySize = () => Math.max(1, G.net?.players?.size || 1);

let MT = null;
function mats() {
  if (MT) return MT;
  MT = {
    stone: new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.6, roughness: 0.5 }),
  };
  return MT;
}
const sprite = (color, s, op = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); m.scale.setScalar(s); return m; };
const runeMat = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const rewardId = e => `cg${G.floor}_${e.i}`;

// ---------------- 床に作る ----------------
export function buildCoop(d, scene) {
  clearCoop(scene);
  casts.length = 0;
  const n = partySize(), m = mats();
  (d.coopEvents || []).forEach((ev, i) => {
    const e = { ...ev, i, done: false, objs: [], hinted: false };
    const add = o => { scene.add(o); e.objs.push(o); return o; };
    if (ev.type === 'plates') {
      // 人数ぶん(最低2・最大4)の石板
      e.spots = ev.spots.slice(0, Math.min(ev.spots.length, Math.max(2, n)));
      e.plates = e.spots.map(p => {
        const g = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.1, 6), m.stone); slab.position.y = 0.05;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 6), runeMat(0xffc860)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.11;
        const glow = sprite(0xffc860, 1.4, 0); glow.position.y = 0.5;
        g.add(slab, ring, glow); g.position.copy(p); add(g);
        return { g, ring, glow, slab, on: false };
      });
      e.allT = 0;
    } else if (ev.type === 'chorus') {
      e.need = n > 1 ? Math.min(n, 3) : 2;  // ひとりなら続けざまに二度
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.25, 48), runeMat(0x9ab0ff)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      const inner = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.3, 6), runeMat(0x9ab0ff)); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.04;
      const seal = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.06, 64, 8, 2, 3), new THREE.MeshStandardMaterial({ color: 0x4a5aa0, emissive: 0x3a4ad0, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3 }));
      seal.position.y = 1.6;
      const glow = sprite(0x8aa0ff, 2.2, 0.5); glow.position.y = 1.6;
      g.add(ring, inner, seal, glow); g.position.copy(ev.pos); add(g);
      e.ring = ring; e.seal = seal; e.glow = glow;
    } else if (ev.type === 'relay') {
      const k = Math.min(ev.spots.length, n > 1 ? 3 + n : 3);
      e.spots = ev.spots.slice(0, k);
      e.limit = Math.round(10 + 3.2 * k + (n > 1 ? 0 : 4));
      e.lit = e.spots.map(() => false); e.timer = 0;
      e.bowls = e.spots.map(p => {
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6), m.iron); post.position.y = 0.65;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.18, 0.22, 10, 1, true), m.iron); bowl.position.y = 1.38; bowl.material.side = THREE.DoubleSide;
        const rune = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 24), runeMat(0xc0a0ff)); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.03;
        const flame = sprite(0xc0a0ff, 1.1, 0); flame.position.y = 1.75;
        g.add(post, bowl, rune, flame); g.position.copy(p); add(g);
        (d.solids ||= []).push({ x: p.x, z: p.z, r: 0.3 });
        return { g, flame, rune };
      });
    } else if (ev.type === 'orb') {
      const ped = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 8), m.dark); col.position.y = 0.55;
      const cup = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 16), m.iron); cup.rotation.x = Math.PI / 2; cup.position.y = 1.12;
      ped.add(col, cup); ped.position.copy(ev.pos); add(ped);
      (d.solids ||= []).push({ x: ev.pos.x, z: ev.pos.z, r: 0.45 });
      const orb = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: 0x3a0a4a, emissive: 0xa020ff, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true }));
      const aura = sprite(0xb040ff, 1.3, 0.8);
      orb.add(core, aura); add(orb);
      e.orb = orb; e.core = core; e.home = ev.pos.clone().setY(ev.pos.y + 1.35);
      orb.position.copy(e.home);
      const alt = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.2, 12), m.stone); base.position.y = 0.1;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32), runeMat(0xffd27a)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.22;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3;
      alt.add(base, ring, beam); alt.position.copy(ev.target); add(alt);
      e.altRing = ring; e.holder = null; e.time = 0;
      // 時間: 封印台までの距離から(人数が多いほど、渡し合いで延ばす前提で少し短い)
      e.limit = Math.round(Math.min(45, Math.max(18, flat(ev.pos, ev.target) * 0.55 + 8)) - (n > 1 ? 3 : 0));
    }
    gims.push(e);
  });
}
export function clearCoop(scene) {
  for (const e of gims) for (const o of e.objs) scene.remove(o);
  for (const e of gims) if (e.type === 'orb' && e.holder) { const h = mageById(e.holder); if (h) delete h.status.orb; }
  gims = [];
}
const mageById = id => G.mages.find(m => m.id === id);

function reward(e, pos, text) {
  e.done = true;
  H.ui.banner(text[0], text[1], 4);
  H.sfx.learn?.();
  G.fx?.burst(pos.clone().setY(pos.y + 1), 0xffd27a, 70, { speed: 3, up: 2.5 });
  H.addPickup(rewardId(e), 'chest', pos.clone(), { rich: true });
}

// ---------------- 解けた時(自分でも仲間からの知らせでも同じ) ----------------
function solvePlates(e, local) {
  if (e.done) return;
  const c = e.spots.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / e.spots.length);
  reward(e, c, ['重石の床が沈んだ', '石板がすべて踏まれ、床の下から宝箱がせり上がった']);
  for (const p of e.plates) { p.ring.material.opacity = 0.9; p.glow.material.opacity = 0.6; }
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'done' });
}
function solveChorus(e, local) {
  if (e.done) return;
  e.seal.visible = false; e.glow.material.color.setHex(0xffe8a0);
  reward(e, e.pos, ['封印が解けた', '重なった声が封印を砕いた — 宝箱が現れた']);
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'done' });
}
function lightRelay(e, k, local) {
  if (e.done || e.lit[k]) return;
  const first = !e.lit.some(Boolean);
  e.lit[k] = true;
  const b = e.bowls[k]; b.flame.material.opacity = 1; b.rune.material.opacity = 0.8;
  G.fx?.burst(b.g.position.clone().setY(1.6), 0xc0a0ff, 28, { speed: 2, up: 1.5 });
  H.sfx.stage?.(e.lit.filter(Boolean).length);
  if (first) { e.timer = e.limit; H.ui.banner('刻の燭台', `時が動き出した — ${e.limit}秒のうちに燭台をすべて灯せ (${e.lit.length}基)`, 3); }
  const n = e.lit.filter(Boolean).length;
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'lit', k });
  if (n >= e.lit.length) {
    const c = e.spots.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / e.spots.length);
    reward(e, c, ['刻の燭台がすべて灯った', '刻が止まり、宝箱が姿を現した']);
  } else H.ui.log(`燭台が灯った (${n}/${e.lit.length}) — 残り ${Math.ceil(e.timer)}秒`, '#d0b0ff');
}
function resetRelay(e) {
  e.lit = e.lit.map(() => false); e.timer = 0;
  for (const b of e.bowls) { b.flame.material.opacity = 0; b.rune.material.opacity = 0.25; }
  H.ui.log('刻が尽きた — 燭台の火がすべて消えた(もう一度挑める)', '#ff9a8a');
  H.sfx.fizzle?.(e.spots[0]);
}
function setHolder(e, id, local, addTime = 0) {
  const prev = e.holder ? mageById(e.holder) : null;
  if (prev) delete prev.status.orb;
  e.holder = id;
  if (id) {
    const h = mageById(id);
    if (h) h.status.orb = { t: 999 };
    if (!prev) e.time = e.limit; else e.time = Math.min(e.limit, e.time + addTime);
    if (h === G.player) H.ui.banner('呪いの宝珠', `封印台(金の光の柱)まで運べ — ${Math.ceil(e.time)}秒で爆ぜる。仲間のそばで調べると渡せる(渡すと時が延びる)`, 4);
    else if (h) H.ui.log(`${h.name}が宝珠を持った — 残り ${Math.ceil(e.time)}秒`, '#d0a0ff');
  }
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'hold', id: id || null, add: addTime });
}
function solveOrb(e, local) {
  if (e.done) return;
  setHolder(e, null, false);
  e.orb.position.copy(e.target).setY(e.target.y + 1.2);
  reward(e, e.target.clone().add(new THREE.Vector3(1.6, 0, 0)), ['宝珠を封じた', '呪いの宝珠が封印台に収まり、褒美が現れた']);
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'done' });
}
function boomOrb(e, local) {
  const h = e.holder ? mageById(e.holder) : null;
  const at = (h ? h.pos : e.home).clone();
  G.fx?.burst(at.clone().setY(at.y + 1.2), 0xb040ff, 120, { speed: 7, up: 2 });
  G.fx?.flash?.(at.clone().setY(at.y + 1.2), 0xb040ff, 40, 0.4, 14);
  H.sfx.crumble?.(at);
  G.shake = Math.max(G.shake || 0, 0.5);
  // 自分の体にだけ傷を付ける(それぞれの端末が自分のぶんを計算する)
  const p = G.player;
  if (p.alive && !p.downed) {
    const dd = flat(p.pos, at);
    if (h === p) H.damage(p, 32);
    else if (dd < 4) H.damage(p, 14);
  }
  H.ui.banner('宝珠が爆ぜた', '呪いの宝珠は台座へ戻った — もう一度運べる', 3);
  setHolder(e, null, false);
  e.orb.position.copy(e.home);
  if (local) G.net?.send({ t: 'coop', i: e.i, a: 'boom' });
}

// ---------------- 毎フレーム ----------------
export function updateCoop(dt, p) {
  const t = G.time;
  for (const e of gims) {
    const anchor = e.pos || e.spots?.[0];
    if (!e.hinted && !e.done && anchor && flat(p.pos, anchor) < 8) {
      e.hinted = true;
      const n = partySize();
      const tip = {
        plates: n > 1 ? `重石の床 — 石板が${e.spots?.length}枚。全員で同時に踏め` : `重石の床 — 石板が${e.spots?.length}枚。人が足りなければ、道具を落として重しにできる`,
        chorus: n > 1 ? `合唱の封印 — 円の中で ${e.need}人が声を合わせ、同時に術を放て(4秒以内)` : '合唱の封印 — 円の中で、15秒のうちに二度 術を放て',
        relay: `刻の燭台 — ${e.spots?.length}基。一つ灯すと${e.limit}秒の刻が動き出す。どの属性の術でも灯る`,
        orb: '呪いの宝珠 — 金の光の柱(封印台)まで運べ。時が尽きれば爆ぜる',
      }[e.type];
      if (tip) H.ui.log(tip, '#e8d8b0');
    }
    if (e.type === 'plates' && !e.done) {
      let all = true;
      for (const pl of e.plates) {
        const c = pl.g.position;
        const on = G.mages.some(m => m.alive && !m.downed && flat(m.pos, c) < 0.85) || G.pickups.some(k => k.kind === 'loot' && flat(k.pos, c) < 0.9);
        if (on !== pl.on) { pl.on = on; if (on) H.sfx.step?.(c); }
        pl.ring.material.opacity += ((on ? 0.85 : 0.2) - pl.ring.material.opacity) * Math.min(1, dt * 8);
        pl.glow.material.opacity = on ? 0.45 : 0;
        pl.slab.position.y = on ? 0.0 : 0.05;
        all = all && on;
      }
      e.allT = all ? e.allT + dt : 0;
      if (e.allT > 0.6) solvePlates(e, true);
    }
    if (e.type === 'chorus' && !e.done) {
      e.seal.rotation.y += dt * 1.2; e.seal.rotation.x = Math.sin(t) * 0.3;
      const inside = casts.filter(c => { const m = mageById(c.id); return m && flat(m.pos, e.pos) < 2.4; });
      const n = partySize();
      if (n > 1) { const ids = new Set(inside.filter(c => t - c.t < 4).map(c => c.id)); if (ids.size >= e.need) solveChorus(e, true); }
      else if (inside.filter(c => c.id === p.id && t - c.t < 15).length >= 2) solveChorus(e, true);
      e.ring.material.opacity = 0.25 + 0.1 * Math.sin(t * 3) + (inside.some(c => t - c.t < 2.5) ? 0.4 : 0);
    }
    if (e.type === 'relay' && !e.done) {
      for (const b of e.bowls) if (b.flame.material.opacity > 0) b.flame.scale.setScalar(1.0 + Math.sin(t * 12 + b.g.position.x) * 0.12);
      for (const pr of G.projectiles) {
        if (!pr.local || !pr.caster?.isMage || pr.team === 'monster') continue;
        e.bowls.forEach((b, k) => { if (!e.lit[k] && flat(pr.pos, b.g.position) < 0.9 && pr.pos.y - b.g.position.y < 2.6) lightRelay(e, k, true); });
      }
      if (e.timer > 0) {
        const before = Math.ceil(e.timer);
        e.timer -= dt;
        if (Math.ceil(e.timer) !== before && [10, 5, 3, 2, 1].includes(Math.ceil(e.timer))) H.ui.log(`刻の燭台 — 残り ${Math.ceil(e.timer)}秒`, '#ff9a8a');
        if (e.timer <= 0) resetRelay(e);
      }
    }
    if (e.type === 'orb' && !e.done) {
      e.core.rotation.y += dt * 2; e.core.rotation.x += dt * 1.3;
      e.altRing.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.5);
      const h = e.holder ? mageById(e.holder) : null;
      if (e.holder && !h) { setHolder(e, null, false); e.orb.position.copy(e.home); }
      if (h) {
        e.orb.position.lerp(h.pos.clone().setY(h.pos.y + 2.4), Math.min(1, dt * 10));
        e.time -= dt;
        e.core.material.emissiveIntensity = 1.2 + (e.time < 6 ? Math.abs(Math.sin(t * (14 - e.time))) * 2 : 0);
        if (h === G.player) {
          const left = Math.ceil(e.time);
          if (left !== e.lastSaid && [15, 10, 5, 3, 2, 1].includes(left)) { e.lastSaid = left; H.ui.log(`宝珠が脈打つ — 残り ${left}秒`, '#e0a0ff'); }
          if (flat(h.pos, e.target) < 2.0) solveOrb(e, true);
          else if (e.time <= 0) boomOrb(e, true);
          else if (!h.alive || h.downed) boomOrb(e, true);
        }
      } else e.orb.position.y = e.home.y + Math.sin(t * 2) * 0.08;
    }
  }
}

// 術が着弾した: 刻の燭台はどの属性の術でも灯る
export function coopImpact(pos, spell, local) {
  if (!local) return;
  for (const e of gims) if (e.type === 'relay' && !e.done) e.bowls.forEach((b, k) => { if (!e.lit[k] && b.g.position.distanceTo(pos) < 2.0) lightRelay(e, k, true); });
}
// 誰かが術を放った(自分も仲間も)
export function coopCast(id) { casts.push({ id, t: G.time }); while (casts.length && G.time - casts[0].t > 16) casts.shift(); }

// ---------------- 調べる ----------------
function nearOrb(p) {
  for (const e of gims) {
    if (e.type !== 'orb' || e.done) continue;
    if (!e.holder && flat(p.pos, e.pos) < 2.2) return { e, act: 'take' };
    if (e.holder === p.id) {
      const mate = G.mages.find(m => m !== p && m.alive && !m.downed && m.kind !== 'enemy' && m.team === p.team && flat(m.pos, p.pos) < 2.0);
      if (mate) return { e, act: 'pass', mate };
    }
  }
  return null;
}
export function coopHint(p, key) {
  const o = nearOrb(p);
  if (!o) return '';
  return o.act === 'take' ? `${key}: 呪いの宝珠を手に取る(時が尽きると爆ぜる)` : `${key}: 宝珠を${o.mate.name}に渡す(時が延びる)`;
}
export function coopInteract(p) {
  const o = nearOrb(p);
  if (!o) return false;
  if (o.act === 'take') setHolder(o.e, p.id, true);
  else { setHolder(o.e, o.mate.id, true, 6); H.sfx.ward?.(p.pos); }
  return true;
}

// 仲間の端末からの知らせ
export function coopNet(m) {
  const e = gims[m.i]; if (!e) return;
  if (m.a === 'done') { if (e.type === 'plates') solvePlates(e, false); else if (e.type === 'chorus') solveChorus(e, false); else if (e.type === 'orb') solveOrb(e, false); }
  else if (m.a === 'lit') lightRelay(e, m.k, false);
  else if (m.a === 'hold') setHolder(e, m.id, false, m.add || 0);
  else if (m.a === 'boom') boomOrb(e, false);
}
// 宝珠を持っている間は足が重い
export const orbSlow = mage => mage.status?.orb ? 0.72 : 1;
export const debugGimmicks = () => gims; // 確かめる用
