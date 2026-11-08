// 呪文の発現: 弾・環・雨・壁・罠、ダメージ/回復/守護、粒子演出
import * as THREE from 'three';
import { G, rand, clamp } from './state.js';
import { ELEMENTS, compile, WORD_BY_ID } from './lexicon.js';
import { isWallAt, raycastGrid, CELL } from './dungeon.js';
import { glowSprite, runeCircleTex } from './textures.js';
import { sfx } from './audio.js';

const BASE = { fire: 20, ice: 17, thunder: 24, holy: 18, void: 19, wind: 13 };
let GLOW = null, RUNE = null;

// ---------- 粒子 ----------
const MAXP = 4000;
class Particles {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 3); this.size = new Float32Array(MAXP); this.alpha = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP); this.grav = new Float32Array(MAXP); this.s0 = new Float32Array(MAXP);
    this.n = 0; this.cursor = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowSprite() }, scale: { value: innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb*2.0, t.a*vA); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    this.geo = g;
  }
  emit(p, v, color, size, life, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAXP;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color(color); this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = size; this.s0[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = t; this.size[i] = this.s0[i] * (0.4 + 0.6 * t);
    }
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }
}

const tmp = new THREE.Vector3();
function rv(s) { return new THREE.Vector3(rand(-s, s), rand(-s, s), rand(-s, s)); }
function spellColor(spell) {
  if (spell.elements.length) return ELEMENTS[spell.elements[0]].color;
  if (spell.effects.includes('heal')) return 0x8dffb0;
  if (spell.effects.includes('ward')) return 0x8ac8ff;
  return 0xfff0a0;
}

export function initFX() {
  GLOW = glowSprite(); RUNE = runeCircleTex();
  G.particles = new Particles(); G.scene.add(G.particles.points);
  G.fx = FX;
}

function burst(pos, color, n = 30, { speed = 5, size = 0.5, life = 0.7, grav = 0, up = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const v = rv(1).normalize().multiplyScalar(speed * rand(0.3, 1)); v.y += up;
    G.particles.emit(pos, v, color, size * rand(0.6, 1.3), life * rand(0.6, 1.2), grav);
  }
}

function flash(pos, color, intensity = 30, dur = 0.25, dist = 14) {
  G.effects.push({ kind: 'flash', pos: pos.clone(), color, intensity, t: dur, dur, dist });
}

// ---- 灯火: 宙に浮かぶ光源 ----
G.lumens = [];
function spawnLumen(pos, color, { follow = null, dur = 90, power = 1 } = {}) {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff4e0 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  halo.scale.setScalar(0.5);
  grp.add(core, halo); grp.position.copy(pos); G.scene.add(grp);
  G.lumens.push({ grp, halo, color, follow, t: dur, dur, power, phase: Math.random() * 6, pos: grp.position });
  if (G.lumens.length > 6) killLumen(G.lumens[0]);
}
function killLumen(l) { G.scene.remove(l.grp); l.grp.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); G.lumens.splice(G.lumens.indexOf(l), 1); }
export function clearLumens() { while (G.lumens.length) killLumen(G.lumens[0]); }
function updateLumens(dt) {
  for (let i = G.lumens.length - 1; i >= 0; i--) {
    const l = G.lumens[i];
    l.t -= dt;
    if (l.t <= 0 || (l.follow && !l.follow.alive)) { burst(l.pos.clone(), l.color, 12, { speed: 1.5 }); killLumen(l); continue; }
    const bob = Math.sin(G.time * 2 + l.phase) * 0.12;
    if (l.follow) {
      // 術者の肩越しに漂う
      // 左上に浮かべる (右手側に持つ魔導書と重ならないように)。二つ目はさらに外側へ
      const f = l.follow, k = G.lumens.filter(o => o.follow === f).indexOf(l);
      const side = -(1.2 + k * 0.6), ahead = 1.2 - k * 0.2;
      const tx = f.pos.x + Math.cos(f.yaw) * side - Math.sin(f.yaw) * ahead, tz = f.pos.z - Math.sin(f.yaw) * side - Math.cos(f.yaw) * ahead;
      l.pos.x += (tx - l.pos.x) * Math.min(1, dt * 4); l.pos.z += (tz - l.pos.z) * Math.min(1, dt * 4);
      l.pos.y += (2.4 + bob - l.pos.y) * Math.min(1, dt * 4);
    } else l.pos.y = 2.6 + bob;
    const fade = Math.min(1, l.t / 3);
    l.halo.material.opacity = 0.6 * fade; l.halo.scale.setScalar((1 + Math.sin(G.time * 5 + l.phase) * 0.06) * (0.4 + 0.15 * l.power));
    if (Math.random() < dt * 4) G.particles.emit(l.pos.clone(), new THREE.Vector3(rand(-0.2, 0.2), rand(0.1, 0.5), rand(-0.2, 0.2)), l.color, 0.08, 1.2);
  }
}

function ring(pos, color, radius, dur = 0.5) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = 0.15; G.scene.add(m);
  G.effects.push({ kind: 'ring', mesh: m, t: dur, dur, radius });
}

function lightning(a, b, color) {
  const pts = []; const n = 10;
  for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i && i < n) p.add(rv(0.4)); pts.push(p); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
  G.scene.add(line); G.effects.push({ kind: 'line', mesh: line, t: 0.25, dur: 0.25 });
  flash(b, color, 25, 0.15);
}

// ---------- 対象判定 ----------
const hostile = (a, b) => a.team !== b.team;
function affects(spell, caster, t, kind) {
  if (spell.target === 'self') return t === caster;
  if (spell.target === 'ally') return !hostile(caster, t);
  if (spell.target === 'enemy') return hostile(caster, t);
  return kind === 'harm' ? hostile(caster, t) && t !== caster : !hostile(caster, t);
}
function allTargets() { return [...G.mages.filter(m => m.alive), ...G.enemies.filter(e => e.alive)]; }
function findById(id) { return G.mages.find(m => m.id === id) || G.enemies.find(e => e.id === id); }
const isLocalOwner = c => c && (c.isMage ? c.isLocal() : G.isHost);

// 呪文の効能 (数式)
function payload(spell) {
  const p = spell.power;
  const els = spell.elements;
  const dmg = els.length ? els.reduce((s, e) => s + BASE[e], 0) / els.length * p : 0;
  const holyB = els.includes('holy') ? 1.5 : 1;
  return {
    dmg,
    heal: spell.effects.includes('heal') ? 28 * p * holyB : 0,
    ward: spell.effects.includes('ward') ? 35 * p * holyB : 0,
    haste: spell.effects.includes('haste') ? 6 * (spell.eternal ? 1.6 : 1) * (els.includes('wind') ? 1.5 : 1) : 0,
  };
}

function applyPayload(spell, caster, t, pl, mult = 1, dir = null) {
  if (!t.alive) return false;
  let did = false;
  if (pl.dmg > 0 && affects(spell, caster, t, 'harm') && !(t.isMage && t.downed)) {
    FX.damage(t, pl.dmg * mult, spell.elements, caster, { dir, power: spell.power }); did = true;
  }
  if (affects(spell, caster, t, 'help') && t.isMage) {
    if (pl.heal) { FX.heal(t, pl.heal * mult, caster); did = true; }
    if (pl.ward) { FX.shield(t, pl.ward * mult, 10 * (spell.eternal ? 1.6 : 1), spell.elements.length ? spell.elements : null); did = true; }
    if (pl.haste) { t.status.haste = { t: pl.haste }; did = true; burst(t.pos.clone().setY(1), 0x9effc8, 20, { speed: 3 }); }
  } else if (affects(spell, caster, t, 'help') && !t.isMage && (pl.heal || pl.ward)) { // 敵を癒すことも出来る
    if (pl.heal) { t.hp = Math.min(t.maxHp, t.hp + pl.heal * mult); t.updateHpBar(); did = true; }
  }
  return did;
}

// ---------- 発現 ----------
export const FX = {
  burst, flash,
  spellFromIds(ids) { return compile(ids.map(id => WORD_BY_ID[id].text).join(' '), null); },

  // aim: { origin, dir, point, targetId }
  cast(caster, spell, aim) {
    const color = spellColor(spell);
    const local = isLocalOwner(caster);
    sfx.cast(spell.elements, caster.pos);
    if (spell.effects.includes('heal')) sfx.heal(caster.pos);
    if (spell.effects.includes('ward')) sfx.ward(caster.pos);
    const pureLight = spell.effects.includes('light') && !spell.elements.length && spell.effects.length === 1;
    if (!pureLight) {
      flash(caster.pos.clone().setY(1.5), color, 18, 0.3);
      burst(caster.pos.clone().setY(1.4), color, 25, { speed: 3, up: 1 });
    }
    const pl = payload(spell);
    const count = spell.dual ? 2 : 1;
    const dur = spell.eternal ? 1.6 : 1;
    const origin = new THREE.Vector3().fromArray(aim.origin), dir = new THREE.Vector3().fromArray(aim.dir).normalize();
    const point = new THREE.Vector3().fromArray(aim.point);

    // 灯火: 光源を生む。形(穿槍・天雨・刻印)があれば照準地点に灯し、無ければ対象(既定は自分)に付き従う
    if (spell.effects.includes('light')) {
      const lc = spell.elements.length ? ELEMENTS[spell.elements[0]].light : 0xfff0d0;
      const ldur = 90 * dur, lpow = spell.power;
      const placed = spell.rune || spell.form === 'lance' || spell.form === 'rain';
      let who = caster;
      if (spell.target === 'ally') who = G.mages.filter(m => m.alive && m !== caster && !hostile(caster, m)).sort((a, b) => a.pos.distanceTo(caster.pos) - b.pos.distanceTo(caster.pos))[0] || caster;
      for (let i = 0; i < count; i++) {
        if (placed) { const pp = point.clone().addScaledVector(dir, -0.6); if (i) pp.add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))); spawnLumen(pp, lc, { dur: ldur, power: lpow }); burst(pp, lc, 30, { speed: 3 }); }
        else spawnLumen(who.pos.clone().setY(2.3), lc, { follow: who, dur: ldur, power: lpow });
      }
      sfx.heal(caster.pos);
      if (!spell.elements.length && spell.effects.length === 1) return; // 純粋な灯火はここで完了
    }

    if (spell.rune) {
      for (let i = 0; i < count; i++) {
        const p = point.clone().add(i ? new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)) : new THREE.Vector3());
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: RUNE, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.copy(p).setY(0.04); G.scene.add(m);
        const helpOnly = pl.dmg === 0;
        G.runes.push({ pos: p, spell: { ...spell, rune: false, dual: false }, caster, mesh: m, life: 40 * dur, helpOnly, local });
      }
      return;
    }
    const form = spell.form;
    if (spell.target === 'self' && (form === 'lance' || !form)) { // 自分に向けた術
      if (local) applyPayload(spell, caster, caster, pl, count);
      burst(caster.pos.clone().setY(1), color, 30, { speed: 3 });
      return;
    }
    if (form === 'lance') {
      for (let i = 0; i < count; i++) {
        const d = dir.clone(); if (count > 1) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - 0.5) * 0.12);
        this.spawnProjectile({ caster, spell, pl, color, pos: origin.clone(), vel: d.multiplyScalar(26 * (spell.swift ? 1.8 : 1)), local });
      }
    } else if (form === 'nova') {
      for (let i = 0; i < count; i++) G.effects.push({ kind: 'delay', t: i * 0.45, fn: () => this.nova(caster, spell, pl, caster.pos.clone(), 4.5 * dur, color, local) });
    } else if (form === 'rain') {
      for (let i = 0; i < count; i++) {
        const p = point.clone().add(i ? new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)) : new THREE.Vector3());
        this.rain(caster, spell, pl, p, 4 * dur, color, local);
      }
    } else if (form === 'wall') {
      const yaw = Math.atan2(dir.x, dir.z);
      const c = caster.pos.clone().add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(2.6));
      this.wall(caster, spell, pl, c, yaw, count * 2.2, 7 * dur, color, local);
    } else { // 形なし: 直接作用
      let t = aim.targetId ? findById(aim.targetId) : null;
      if (!t) t = caster;
      for (let i = 0; i < count; i++) if (local) applyPayload(spell, caster, t, { ...pl, dmg: pl.dmg * 0.6 }, 1);
      if (t !== caster) { const a = caster.pos.clone().setY(1.5), b = t.pos.clone().setY(1.2); for (let k = 0; k < 20; k++) G.particles.emit(a.clone().lerp(b, k / 20), rv(0.3), color, 0.5, 0.5); }
      burst(t.pos.clone().setY(1), color, 30, { speed: 2.5, up: 1.5 });
      flash(t.pos.clone().setY(1.5), color, 20, 0.3);
    }
  },

  // 形なし詠唱の対象選択(術者側で決定してネットへ送る)
  pickDirectTarget(caster, spell, aimDir) {
    const pl = payload(spell);
    const harmful = pl.dmg > 0 && !(pl.heal || pl.ward || pl.haste);
    if (spell.target === 'self') return caster.id;
    if (spell.target === 'ally' || (!spell.target && !harmful)) {
      let best = null, worst = 2;
      for (const m of G.mages) {
        if (!m.alive || hostile(caster, m) || m.pos.distanceTo(caster.pos) > 25) continue;
        const r = m.downed ? -1 : m.hp / m.maxHp - (m === caster ? 0.05 : 0);
        if (r < worst) { worst = r; best = m; }
      }
      return (best || caster).id;
    }
    // 敵: 照準方向に最も近い者
    let best = null, bs = 0.85;
    for (const t of allTargets()) {
      if (!hostile(caster, t) || (t.isMage && t.downed)) continue;
      const v = t.pos.clone().sub(caster.pos); const d = v.length(); if (d > 30) continue;
      v.y = 0; const s = v.normalize().dot(new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize());
      if (s > bs) { bs = s; best = t; }
    }
    return best ? best.id : null;
  },

  spawnProjectile({ caster, spell, pl, color, pos, vel, local, team }) {
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.setScalar(0.9 * Math.min(1.8, spell.power));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const g = new THREE.Group(); g.add(core, inner); g.position.copy(pos); G.scene.add(g);
    G.projectiles.push({ caster, spell, pl, color, pos, vel, mesh: g, life: 2.2, age: 0, local, team: team || caster.team, radius: 0.35 });
  },

  nova(caster, spell, pl, center, radius, color, local) {
    ring(center, color, radius, 0.55);
    flash(center.clone().setY(1.2), color, 40, 0.35, radius * 3);
    for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2; const v = new THREE.Vector3(Math.cos(a), rand(0, 0.4), Math.sin(a)).multiplyScalar(radius * 2.2); G.particles.emit(center.clone().setY(0.6), v, color, 0.6, 0.5); }
    sfx.impact(spell.elements, center);
    if (!local) return;
    for (const t of allTargets()) {
      const d = t.pos.distanceTo(center);
      if (d <= radius + (t.radius || 0.4)) applyPayload(spell, caster, t, pl, 0.85, t.pos.clone().sub(center).setY(0).normalize());
    }
  },

  rain(caster, spell, pl, center, radius, color, local) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: RUNE, color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(center).setY(0.05); G.scene.add(m);
    const delay = spell.swift ? 0.45 : 0.9;
    G.effects.push({ kind: 'rainmark', mesh: m, t: delay + 1.6, dur: delay + 1.6 });
    for (let pulse = 0; pulse < 3; pulse++) {
      G.effects.push({ kind: 'delay', t: delay + pulse * 0.5, fn: () => {
        for (let i = 0; i < 60; i++) {
          const p = center.clone().add(new THREE.Vector3(rand(-radius, radius), 4.6, rand(-radius, radius)));
          G.particles.emit(p, new THREE.Vector3(rand(-0.5, 0.5), -18, rand(-0.5, 0.5)), color, 0.45, 0.28);
        }
        burst(center.clone().setY(0.3), color, 30, { speed: radius * 1.4, life: 0.4 });
        flash(center.clone().setY(2), color, 30, 0.2, radius * 3);
        sfx.impact(spell.elements, center);
        if (!local) return;
        for (const t of allTargets()) if (t.pos.distanceTo(center) <= radius) applyPayload(spell, caster, t, pl, 0.42, null);
      } });
    }
  },

  wall(caster, spell, pl, center, yaw, half, life, color, local) {
    const geo = new THREE.BoxGeometry(half * 2, 3, 0.35); geo.translate(0, 1.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.38, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(center).setY(0); mesh.rotation.y = yaw; G.scene.add(mesh);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    mesh.add(edge);
    const hp = 60 * spell.power * (spell.effects.includes('ward') ? 2 : 1);
    G.obstacles.push({ pos: center, cos: Math.cos(yaw), sin: -Math.sin(yaw), half, team: caster.team, caster, spell, pl, mesh, life, max: life, hp, local, tick: 0 });
    burst(center.clone().setY(1.5), color, 60, { speed: 2, up: 2 });
  },

  enemyBolt(enemy, from, dir) {
    const spell = { power: 1, elements: ['void'], effects: [], target: null };
    this.spawnProjectile({ caster: enemy, spell, pl: { dmg: enemy.dmg }, color: 0x9a3cff, pos: from, vel: dir.multiplyScalar(13), local: G.isHost, team: 'monster' });
  },

  // ---------- 効果の適用 (権限を持つクライアントのみ) ----------
  damage(t, amount, elements, src, opts = {}) {
    if (!t || !t.alive) return;
    if (t.isMage && t.kind === 'remote') { G.net?.send({ t: 'dmg', to: t.netId, amount, elements, src: src?.id, opts: { melee: opts.melee, dir: opts.dir?.toArray?.() } }); return; }
    if (!t.isMage && !G.isHost) { G.net?.send({ t: 'edmg', to: G.hostId, eid: t.id, amount, elements, src: src?.id, dir: opts.dir?.toArray?.(), power: opts.power }); return; }
    let a = amount;
    for (const e of elements) {
      if (t.T?.weak?.includes(e)) a *= 1.5;
      if (t.T?.resist?.includes(e)) a *= 0.6;
      if (e === 'holy' && t.undead) a *= 1.35;
    }
    if (elements.length) a /= Math.max(1, elements.length * 0.6); // 多属性の相性補正をならす
    if (t.isMage && t.downed) return;
    // 状態異常
    const pw = opts.power || 1;
    for (const e of elements) {
      if (e === 'fire') t.status.burn = { t: 3, dps: 4 * pw, src };
      if (e === 'ice') t.status.slow = { t: 3 * pw };
      if (e === 'thunder' && !t.isMage) t.stun = 0.35;
      if (e === 'wind' && opts.dir) { const k = new THREE.Vector3(...(Array.isArray(opts.dir) ? opts.dir : opts.dir.toArray())).multiplyScalar(11 * pw); if (t.knock) t.knock.add(k); else if (t.vel) t.pushV = k; }
      if (e === 'void' && src && src.alive && opts.silent !== true) FX.heal(src, a * 0.35, src, true);
    }
    // 守護
    if (t.isMage && t.shield > 0) {
      const ab = Math.min(t.shield, a); t.shield -= ab; a -= ab;
      if (t.shield <= 0) { t.shield = 0; t.shieldT = 0; }
      if (ab > 0 && !opts.silent) burst(t.pos.clone().setY(1), 0x88ccff, 10, { speed: 3 });
    } else if (t.isMage && t.chanting && a >= 12 && !opts.silent) {
      t.chantInterrupted = true; // 強打で詠唱が乱れる
      G.ui?.floatText(t.pos, '詠唱妨害!', '#ff6060');
    }
    if (a <= 0) return;
    t.hp -= a;
    if (!opts.silent) {
      G.ui?.floatText(t.pos, Math.round(a), t.isMage ? '#ff5050' : (elements.length ? '#' + new THREE.Color(ELEMENTS[elements[0]].color).getHexString() : '#ffffff'));
      burst(t.pos.clone().setY(1.1), 0x8a0a0a, 8, { speed: 2, grav: 9, size: 0.25 });
      if (t === G.player) G.ui?.hurt(a);
    }
    if (!t.isMage) { t.aggro = true; if (src && src.alive && (!t.target || Math.random() < 0.3)) t.target = src; t.updateHpBar(); }
    if (t.hp <= 0) FX.kill(t, src);
    else if (t.isMage && t.kind === 'player') G.net?.send({ t: 'hp', hp: t.hp });
  },

  heal(t, amount, src, silent) {
    if (!t || !t.alive || !t.isMage) return;
    if (t.kind === 'remote') { G.net?.send({ t: 'heal', to: t.netId, amount, src: src?.id }); return; }
    if (t.downed) {
      t.downed = false; t.hp = Math.max(25, amount); G.ui?.floatText(t.pos, '蘇生!', '#8dffb0');
      G.ui?.log(`${src?.name || '何者か'}が${t.name}を蘇生した`);
    } else t.hp = Math.min(t.maxHp, t.hp + amount);
    if (!silent) { G.ui?.floatText(t.pos, '+' + Math.round(amount), '#8dffb0'); for (let i = 0; i < 30; i++) G.particles.emit(t.pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 0.5), rand(-0.6, 0.6))), new THREE.Vector3(0, rand(1.5, 3), 0), 0x9dffb8, 0.35, 1.0); }
    if (t.kind === 'player') G.net?.send({ t: 'hp', hp: t.hp });
  },

  shield(t, amount, dur, thorns) {
    if (t.kind === 'remote') { G.net?.send({ t: 'shield', to: t.netId, amount, dur, thorns }); return; }
    t.shield = Math.max(t.shield, amount); t.shieldT = dur; t.thorns = thorns;
    G.ui?.floatText(t.pos, '守護', '#8ac8ff');
  },

  kill(t, src) {
    if (t.isMage) {
      if (G.mode === 'coop') { t.downed = true; t.hp = 0; t.downT = 45; t.setChant(''); G.ui?.log(`${t.name}が倒れた — 癒息で蘇生できる`); }
      else { t.alive = false; t.hp = 0; t.respawnT = 6; t.setChant(''); if (src && src.isMage) src.kills++; G.ui?.log(`${src?.name || '迷宮'}が${t.name}を討ち取った`); }
      if (t.kind === 'player') G.net?.send({ t: 'down', by: src?.id, pvp: G.mode === 'pvp' });
      return;
    }
    t.alive = false; t.hp = 0;
    burst(t.pos.clone().setY(1), t.type === 'slime' ? 0x6fff4a : 0xb0a080, 50, { speed: 4, grav: 6, size: 0.4, life: 1.2 });
    G.ui?.log(`${t.name}を倒した`);
    t.dispose();
    if (src && src.isMage) src.kills++;
    if (G.isHost) {
      G.onEnemyKilled?.(t);
      G.net?.send({ t: 'ekill', id: t.id });
    }
  },

  // ---------- 毎フレーム更新 ----------
  update(dt) {
    G.particles.update(dt);
    updateLumens(dt);
    // 弾
    for (let i = G.projectiles.length - 1; i >= 0; i--) {
      const p = G.projectiles[i];
      p.age += dt; p.life -= dt;
      const step = p.vel.clone().multiplyScalar(dt);
      let hit = null, end = p.life <= 0;
      const sub = 4;
      for (let s = 0; s < sub && !hit && !end; s++) {
        p.pos.addScaledVector(step, 1 / sub);
        if (isWallAt(p.pos.x, p.pos.z) || p.pos.y < 0 || p.pos.y > 5.2) { end = true; break; }
        for (const o of G.obstacles) {
          if (o.team === p.team) continue;
          const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
          const lx = dx * o.cos + dz * o.sin, lz = -dx * o.sin + dz * o.cos;
          if (Math.abs(lx) < o.half && Math.abs(lz) < 0.5 && p.pos.y < 3) { end = true; o.hp -= p.pl.dmg || 10; G.ui?.floatText(p.pos, '防壁', '#8ac8ff'); break; }
        }
        if (end) break;
        for (const t of allTargets()) {
          if (t === p.caster && p.age < 0.3) continue;
          if (t.isMage && t.downed && !p.pl.heal) continue;
          const c = t.pos.clone(); c.y = t.T?.fly ? 1.6 : 1.0;
          if (c.distanceTo(p.pos) > p.radius + (t.radius || 0.4) + 0.3) continue;
          const harmful = (p.pl.dmg || 0) > 0 && affects(p.spell, p.caster, t, 'harm');
          const helpful = (p.pl.heal || p.pl.ward || p.pl.haste) && affects(p.spell, p.caster, t, 'help');
          if (p.team === 'monster') { if (t.team !== 'monster') hit = t; }
          else if (harmful || helpful) hit = t;
          if (hit) break;
        }
      }
      // 尾を引く光
      p.mesh.position.copy(p.pos);
      for (let k = 0; k < 3; k++) G.particles.emit(p.pos.clone().add(rv(0.08)), rv(0.4), p.color, 0.5, 0.35);
      if (hit || end) {
        burst(p.pos, p.color, 40, { speed: 5 });
        flash(p.pos, p.color, 35, 0.25);
        sfx.impact(p.spell.elements, p.pos);
        if (hit && p.local) {
          if (p.team === 'monster') FX.damage(hit, p.pl.dmg, ['void'], p.caster, {});
          else {
            applyPayload(p.spell, p.caster, hit, p.pl, 1, p.vel.clone().setY(0).normalize());
            if (p.spell.elements.includes('thunder')) this.chain(p, hit);
          }
        }
        G.scene.remove(p.mesh); G.projectiles.splice(i, 1);
      }
    }
    // 罠
    for (let i = G.runes.length - 1; i >= 0; i--) {
      const r = G.runes[i]; r.life -= dt;
      r.mesh.rotation.z += dt * 0.6; r.mesh.material.opacity = 0.25 + 0.15 * Math.sin(G.time * 3);
      let trig = false;
      for (const t of allTargets()) {
        if (t.pos.distanceTo(r.pos) > 2.2) continue;
        if (r.helpOnly ? !hostile(r.caster, t) : hostile(r.caster, t)) { trig = true; break; }
      }
      if (trig || r.life <= 0) {
        if (trig) this.nova(r.caster, r.spell, payload(r.spell), r.pos.clone(), 3.5 * (r.spell.eternal ? 1.6 : 1), spellColor(r.spell), r.local);
        G.scene.remove(r.mesh); G.runes.splice(i, 1);
      }
    }
    // 壁
    for (let i = G.obstacles.length - 1; i >= 0; i--) {
      const o = G.obstacles[i]; o.life -= dt; o.tick -= dt;
      o.mesh.material.opacity = 0.25 + 0.15 * Math.sin(G.time * 5) * (o.life < 1.5 ? Math.random() : 1);
      if (o.local && o.pl.dmg > 0 && o.tick <= 0) {
        o.tick = 0.5;
        for (const t of allTargets()) {
          if (!hostile(o.caster, t)) continue;
          const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z;
          const lx = dx * o.cos + dz * o.sin, lz = -dx * o.sin + dz * o.cos;
          if (Math.abs(lx) < o.half + 0.6 && Math.abs(lz) < 1.3) FX.damage(t, o.pl.dmg * 0.3, o.spell.elements, o.caster, { silent: false, power: o.spell.power });
        }
      }
      if (o.life <= 0 || o.hp <= 0) { burst(o.pos.clone().setY(1.5), 0x88ccff, 40, { speed: 3 }); G.scene.remove(o.mesh); G.obstacles.splice(i, 1); }
    }
    // 一時的な演出
    for (let i = G.effects.length - 1; i >= 0; i--) {
      const e = G.effects[i]; e.t -= dt;
      if (e.kind === 'delay') { if (e.t <= 0) { e.fn(); G.effects.splice(i, 1); } continue; }
      const k = clamp(1 - e.t / e.dur, 0, 1);
      if (e.kind === 'ring') { e.mesh.scale.setScalar(0.3 + k * e.radius); e.mesh.material.opacity = 1 - k; }
      if (e.kind === 'line') e.mesh.material.opacity = 1 - k;
      if (e.kind === 'rainmark') { e.mesh.material.opacity = Math.min(0.7, k * 3) * (1 - Math.max(0, k - 0.8) * 5); e.mesh.rotation.z += dt; }
      if (e.t <= 0) { if (e.mesh) G.scene.remove(e.mesh); G.effects.splice(i, 1); }
    }
  },

  chain(p, first) {
    let from = first; const hitSet = new Set([first]);
    for (let j = 0; j < 2; j++) {
      let best = null, bd = 6.5;
      for (const t of allTargets()) {
        if (hitSet.has(t) || !hostile(p.caster, t)) continue;
        const d = t.pos.distanceTo(from.pos); if (d < bd) { bd = d; best = t; }
      }
      if (!best) break;
      lightning(from.pos.clone().setY(1.2), best.pos.clone().setY(1.2), p.color);
      FX.damage(best, p.pl.dmg * 0.5, p.spell.elements, p.caster, { power: p.spell.power });
      hitSet.add(best); from = best;
    }
  },
};

// 光源プール: 近い光源にだけ実ライトを割り当てる
export class LightPool {
  constructor(n = 10) {
    this.lights = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffaa66, 0, 16, 1.8); G.scene.add(l); this.lights.push(l); }
  }
  update(camPos, dt) {
    const cands = [];
    const d = G.dungeon;
    if (d?.torchObjs) for (const t of d.torchObjs) {
      const dist = t.light.distanceTo(camPos); if (dist > 34) continue;
      const fl = 0.8 + 0.2 * Math.sin(G.time * 13 + t.phase) * Math.sin(G.time * 7.3 + t.phase * 2) + Math.random() * 0.06;
      t.flame.scale.set(0.7 * fl, 1.0 * fl, 1); t.core.scale.set(0.3 * fl, 0.45 * fl, 1);
      cands.push({ pos: t.light, color: 0xff9a4a, intensity: 9 * fl, dist: 15, score: dist });
      if (Math.random() < dt * 3) G.particles.emit(t.light.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(rand(-0.2, 0.2), rand(0.6, 1.4), rand(-0.2, 0.2)), 0xff8030, 0.12, 1.2);
    }
    for (const p of G.projectiles) cands.push({ pos: p.pos, color: p.color, intensity: 12, dist: 10, score: p.pos.distanceTo(camPos) - 20 });
    for (const e of G.effects) if (e.kind === 'flash') { const k = e.t / e.dur; cands.push({ pos: e.pos, color: e.color, intensity: e.intensity * k, dist: e.dist, score: e.pos.distanceTo(camPos) - 30 }); }
    for (const l of G.lumens) { const k = Math.min(1, l.t / 3); cands.push({ pos: l.pos, color: l.color, intensity: (7 + 2 * l.power) * k, dist: 18 + 4 * l.power, score: l.pos.distanceTo(camPos) - 40 }); }
    if (G.portalObj) cands.push({ pos: G.portalObj.position.clone().setY(1.5), color: 0x8a6bff, intensity: 14, dist: 14, score: G.portalObj.position.distanceTo(camPos) - 5 });
    for (const pk of G.pickups) if (pk.kind === 'scroll' && pk.mesh) cands.push({ pos: pk.mesh.position, color: 0xffe6a0, intensity: 3, dist: 5, score: pk.mesh.position.distanceTo(camPos) + 5 });
    cands.sort((a, b) => a.score - b.score);
    this.lights.forEach((l, i) => {
      const c = cands[i];
      if (!c) { l.intensity = 0; return; }
      l.position.copy(c.pos); l.color.set(c.color); l.intensity = c.intensity; l.distance = c.dist;
    });
    for (let i = G.effects.length - 1; i >= 0; i--) if (G.effects[i].kind === 'flash' && G.effects[i].t <= 0) G.effects.splice(i, 1);
  }
}
