// 魔導師と魔物: 見た目・状態・魔物AI
import * as THREE from 'three';
import { G, rand, clamp } from './state.js';
import { moveWithCollision, flowDir, lineOfSight, bfs, cellOf } from './dungeon.js';
import { textSprite, runeCircleTex, glowSprite } from './textures.js';
import { sfx } from './audio.js';

let RUNE_TEX = null, GLOW_TEX = null;

// ---------- 魔導師 ----------
function mageMesh(color) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.4, metalness: 0.8 });
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.18 + 0.32 * Math.pow(1 - t, 1.6) + 0.04 * Math.sin(t * 9), t * 1.45)); }
  const robe = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), cloth); robe.castShadow = true;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 20), trim); belt.rotation.x = Math.PI / 2; belt.position.y = 0.95;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth); shoulders.position.y = 1.38; shoulders.scale.set(1.2, 0.6, 0.9);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.75), cloth);
  hood.position.y = 1.62; hood.rotation.x = -0.35; hood.castShadow = true;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: 0x050405, roughness: 1 }));
  face.position.set(0, 1.6, -0.06);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat); e1.position.set(-0.05, 1.62, -0.19);
  const e2 = e1.clone(); e2.position.x = 0.05;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.6, 8), cloth); arm.position.set(0.3, 1.15, -0.1); arm.rotation.x = -0.6;
  const staff = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.7 }));
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, roughness: 0.1 }));
  crystal.position.y = 0.98; crystal.scale.y = 1.6;
  staff.add(shaft, crystal); staff.position.set(0.38, 0.95, -0.25); staff.rotation.x = -0.15;
  g.add(robe, belt, shoulders, hood, face, e1, e2, arm, staff);
  g.userData = { staff, crystal, eyeMat };
  return g;
}

export class Mage {
  constructor({ id, name, kind, team, color = 0x2a3a6a, pos }) {
    Object.assign(this, { id, name, kind, team, color });
    this.pos = pos.clone(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.maxHp = 100; this.hp = 100; this.maxMp = 100; this.mp = 100;
    this.shield = 0; this.shieldT = 0; this.thorns = null;
    this.status = {}; this.radius = 0.4; this.alive = true; this.downed = false; this.downT = 0;
    this.chantText = ''; this.chantTimer = 0; this.chanting = false; this.chantInterrupted = false;
    this.castLock = 0; this.kills = 0; this.isMage = true;
    if (!RUNE_TEX) { RUNE_TEX = runeCircleTex(); GLOW_TEX = glowSprite(); }
    this.root = new THREE.Group();
    if (kind !== 'player') {
      this.model = mageMesh(color); this.root.add(this.model);
      this.label = textSprite(name, { size: 30, color: '#e8dcc0' }); this.label.position.y = 2.15; this.root.add(this.label);
      this.chantLabel = textSprite('', { size: 34, color: '#fff2b0', bg: 'rgba(20,10,40,0.55)', width: 1100, lines: 3 }); this.chantLabel.position.y = 2.9; this.root.add(this.chantLabel);
    }
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: RUNE_TEX, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.circle.rotation.x = -Math.PI / 2; this.circle.position.y = 0.03;
    this.root.add(this.circle);
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.shieldMesh.position.y = 1; this.root.add(this.shieldMesh);
    this.root.position.copy(this.pos);
    G.scene.add(this.root);
  }
  get speedMul() { let m = 1; if (this.status.slow) m *= 0.55; if (this.status.haste) m *= 1.6; if (this.chanting) m *= 0.55; return m; }
  setChant(text, words = 0) {
    this.chantText = text;
    if (this.chantLabel) this.chantLabel.userData.set(text ? `「${text}」` : '');
    this.chanting = !!text;
    this.chantWords = words;
  }
  update(dt) {
    for (const k in this.status) {
      const s = this.status[k]; s.t -= dt;
      if (k === 'burn' && s.t > 0 && this.isLocal()) G.fx.damage(this, s.dps * dt, [], s.src, { silent: true });
      if (s.t <= 0) delete this.status[k];
    }
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) { this.shield = 0; this.thorns = null; } }
    this.shieldMesh.material.opacity = this.shield > 0 ? 0.12 + 0.05 * Math.sin(G.time * 6) : 0;
    this.shieldMesh.visible = this.shield > 0 && this.kind !== 'player';
    if (!this.chanting && this.alive && !this.downed) this.mp = Math.min(this.maxMp, this.mp + dt * 7 * (this.regenMul || 1));
    this.castLock = Math.max(0, this.castLock - dt);
    // 詠唱中は足元に魔法陣
    const target = this.chanting ? Math.min(1, 0.35 + (this.chantWords || 1) * 0.15) : 0;
    const op = this.circle.material.opacity;
    this.circle.material.opacity = op + (target * 0.85 - op) * Math.min(1, dt * 6);
    this.circle.rotation.z += dt * (0.5 + (this.chantWords || 0) * 0.4);
    const sc = 0.6 + (this.chantWords || 1) * 0.25; this.circle.scale.setScalar(sc);
    this.root.position.copy(this.pos);
    if (this.model) {
      this.model.rotation.y = this.yaw + Math.PI;
      const st = this.model.userData.staff;
      st.rotation.x = this.chanting ? -0.9 + Math.sin(G.time * 8) * 0.05 : -0.15;
      this.model.userData.crystal.material.emissiveIntensity = this.chanting ? 4 + Math.sin(G.time * 12) * 1.5 : 2;
      if (this.downed) { this.model.rotation.x = -1.4; this.model.position.y = 0.25; } else { this.model.rotation.x = 0; this.model.position.y = Math.abs(Math.sin(G.time * 7)) * this.vel.length() * 0.012; }
      this.root.visible = this.alive;
    }
  }
  isLocal() { return this.kind === 'player' || this.kind === 'bot'; }
  dispose() { G.scene.remove(this.root); }
}

// ---------- 魔物 ----------
export const ENEMY_TYPES = {
  skeleton: { name: '骸骨兵', hp: 45, speed: 2.7, dmg: 10, range: 1.7, cd: 1.3, radius: 0.4, undead: true, weak: ['holy', 'thunder'], resist: ['void', 'ice'], drops: ['bone', 'bone', 'iron'] },
  slime:    { name: '粘獣', hp: 38, speed: 1.9, dmg: 8, range: 1.4, cd: 1.1, radius: 0.55, weak: ['fire'], resist: ['wind'], drops: ['herb', 'crystal'] },
  wraith:   { name: '怨霊', hp: 42, speed: 2.3, dmg: 12, range: 13, cd: 2.6, radius: 0.45, undead: true, ranged: true, fly: true, weak: ['holy', 'fire'], resist: ['void', 'ice'], drops: ['crystal', 'crystal'] },
  golem:    { name: '石像兵', hp: 170, speed: 1.5, dmg: 22, range: 2.3, cd: 2.0, radius: 0.85, weak: ['thunder'], resist: ['fire', 'ice', 'wind'], drops: ['iron', 'iron', 'crystal', 'crystal'] },
};

// 種類ごとの縁取りの色 (暗がりでも輪郭と種類が分かるように)
export const ENEMY_RIM = { skeleton: 0xff5a3a, slime: 0x7dff4a, wraith: 0xb565ff, golem: 0xff9a2a };
// 標準材質に「視線と直交する面ほど光る」縁取りを足す
function addRim(group, U) {
  group.traverse(o => {
    if (!o.isMesh || !o.material || !(o.material.isMeshStandardMaterial)) return;
    const m = o.material = o.material.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.rimColor = U.color; sh.uniforms.rimStrength = U.strength;
      sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimF = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\n  totalEmissiveRadiance += rimColor * pow(rimF, 2.2) * rimStrength;');
    };
    m.customProgramCacheKey = () => 'enemy-rim';
  });
}
// 目や核(光る小物)を大きくし、光の滲みを足す
function addEyeGlow(group) {
  const list = [];
  group.traverse(o => { if (o.isMesh && (o.material.isMeshBasicMaterial || (o.material.emissiveIntensity || 0) > 1.5)) list.push(o); });
  for (const o of list) {
    o.scale.multiplyScalar(1.6);
    const c = o.material.isMeshBasicMaterial ? o.material.color : o.material.emissive;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX || (GLOW_TEX = glowSprite()), color: c.clone(), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    s.scale.setScalar(o.geometry.boundingSphere ? 0.3 : 0.3); s.position.copy(o.position); s.renderOrder = 5;
    o.parent.add(s);
  }
}

function enemyMesh(type, scale = 1) {
  const g = new THREE.Group();
  if (type === 'skeleton') {
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.75 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x5a4434, roughness: 0.5, metalness: 0.7 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), bone); skull.position.y = 1.62; skull.scale.set(1, 1.1, 1.15);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.14), bone); jaw.position.set(0, 1.47, -0.05);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), bone); spine.position.y = 1.1;
    g.add(skull, jaw, spine);
    for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.17 - i * 0.015, 0.015, 5, 14, Math.PI * 1.4), bone); rib.position.y = 1.35 - i * 0.09; rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI * 0.8; g.add(rib); }
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12), bone); pelvis.position.y = 0.78; pelvis.rotation.x = Math.PI / 2; g.add(pelvis);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.78, 6), bone); leg.position.set(s * 0.1, 0.39, 0); g.add(leg);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.65, 6), bone); arm.position.set(s * 0.24, 1.15, -0.1); arm.rotation.x = -0.5; g.add(arm);
    }
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.02), rust); sword.position.set(0.28, 1.0, -0.45); sword.rotation.x = -1.1; g.add(sword);
    g.userData.weapon = sword;
    const eye = new THREE.MeshBasicMaterial({ color: 0xff3010 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eye); e.position.set(s * 0.06, 1.65, -0.17); g.add(e); }
  } else if (type === 'slime') {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x4fbf3a, emissive: 0x0c3a08, roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.82 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 18), mat); body.position.y = 0.5; body.scale.set(1, 0.8, 1);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbaff60 })); core.position.y = 0.5;
    g.add(body, core); g.userData.body = body;
  } else if (type === 'wraith') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x15101e, roughness: 1, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.05 + 0.45 * Math.sin(t * Math.PI * 0.9) * (1 - t * 0.3), t * 1.6)); }
    const cloak = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat); cloak.rotation.x = Math.PI; cloak.position.y = 2.0;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat); hood.position.y = 1.95;
    const eye = new THREE.MeshBasicMaterial({ color: 0xc060ff });
    g.add(cloak, hood);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eye); e.position.set(s * 0.07, 1.95, -0.21); g.add(e); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX || glowSprite(), color: 0x7030c0, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.scale.set(2.2, 2.6, 1); glow.position.y = 1.3; g.add(glow);
  } else if (type === 'golem') {
    const stone = new THREE.MeshStandardMaterial({ color: 0x6b645a, roughness: 0.95, flatShading: true });
    const lava = new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff4a00, emissiveIntensity: 2.2 });
    const rock = (r, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
    rock(0.6, 0, 1.5, 0, 1.2, 1, 0.9); rock(0.32, 0, 2.25, -0.1);
    const armL = rock(0.3, -0.8, 1.3, 0, 0.8, 1.6, 0.8), armR = rock(0.3, 0.8, 1.3, 0, 0.8, 1.6, 0.8);
    rock(0.3, -0.35, 0.45, 0, 0.9, 1.4, 0.9); rock(0.3, 0.35, 0.45, 0, 0.9, 1.4, 0.9);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), lava); core.position.set(0, 1.55, -0.5); g.add(core);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.04), lava); e.position.set(s * 0.12, 2.3, -0.38); g.add(e); }
    g.userData.arms = [armL, armR];
  }
  addEyeGlow(g);
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Enemy {
  constructor(id, type, pos, floor, boss = false) {
    const T = ENEMY_TYPES[type];
    this.id = id; this.type = type; this.T = T; this.boss = boss;
    const scale = 1 + 0.18 * (floor - 1);
    this.maxHp = Math.round(T.hp * scale * (boss ? 2.6 : 1)); this.hp = this.maxHp;
    this.dmg = T.dmg * (1 + 0.1 * (floor - 1)) * (boss ? 1.4 : 1);
    this.radius = T.radius * (boss ? 1.5 : 1);
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.knock = new THREE.Vector3();
    this.netTarget = pos.clone();
    this.yaw = Math.random() * 6; this.team = 'monster'; this.alive = true; this.status = {};
    this.cd = rand(0.5, 1.5); this.target = null; this.aggro = false; this.stun = 0; this.attackAnim = 0;
    this.undead = !!T.undead; this.isMage = false; this.name = (boss ? '【主】' : '') + T.name;
    this.phase = Math.random() * 6.28;
    this.body = enemyMesh(type, boss ? 1.8 : 1);
    this.root = new THREE.Group(); this.root.add(this.body);
    this.rimU = { color: { value: new THREE.Color(ENEMY_RIM[type] || 0xffffff) }, strength: { value: 0.9 } };
    addRim(this.body, this.rimU);
    this.hitT = 0;
    if (boss) {
      // 主: 足元に赤い紋章
      const sig = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: RUNE_TEX || (RUNE_TEX = runeCircleTex()), color: 0xff3a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
      sig.rotation.x = -Math.PI / 2; sig.position.y = 0.06; this.root.add(sig); this.sigil = sig;
    }
    this.root.position.copy(pos);
    this.hpBar = textSprite('', { size: 26, color: '#ff8a7a', width: 512 }); this.hpBar.scale.multiplyScalar(0.5); this.hpBar.position.y = (T.fly ? 2.6 : 2.2) * (boss ? 1.8 : 1); this.root.add(this.hpBar);
    G.scene.add(this.root);
  }
  updateHpBar() {
    this.hitT = 0.18; // 被弾で縁取りが一瞬強く光る
    const n = 10, f = Math.ceil(clamp(this.hp / this.maxHp, 0, 1) * n);
    this.hpBar.userData.set(this.hp < this.maxHp ? `${this.name} ${'▮'.repeat(f)}${'▯'.repeat(n - f)}` : '');
  }
  update(dt) {
    if (!this.alive) return;
    for (const k in this.status) {
      const s = this.status[k]; s.t -= dt;
      if (k === 'burn' && G.isHost) G.fx.damage(this, s.dps * dt, [], s.src, { silent: true });
      if (s.t <= 0) delete this.status[k];
    }
    if (!this.alive) return;
    const T = this.T;
    if (G.isHost) this.think(dt);
    else { // 補間
      this.pos.lerp(this.netTarget, Math.min(1, dt * 10));
    }
    // 見た目のアニメーション
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI;
    const ud = this.body.userData, t = G.time, ph = this.phase, b = this.body;
    const moving = (this._lastX !== undefined) && Math.hypot(this.pos.x - this._lastX, this.pos.z - this._lastZ) > dt * 0.4;
    this._lastX = this.pos.x; this._lastZ = this.pos.z;
    this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    // 種類ごとの動き
    if (this.type === 'skeleton') { // カタカタ揺れる
      b.rotation.z = Math.sin(t * 17 + ph) * 0.025 + (moving ? Math.sin(t * 8 + ph) * 0.06 : 0);
      b.position.y = moving ? Math.abs(Math.sin(t * 8 + ph)) * 0.06 : Math.abs(Math.sin(t * 13 + ph)) * 0.01;
    } else if (this.type === 'slime') { // 弾む
      const hop = moving ? Math.abs(Math.sin(t * 5 + ph)) : 0;
      b.position.y = hop * 0.3;
      if (ud.body) { const s = 1 + Math.sin(t * 6 + ph) * 0.08 + (moving ? (0.5 - hop) * 0.15 : 0); ud.body.scale.set(s, 0.8 / s, s); }
    } else if (this.type === 'wraith') { // 漂う
      b.position.y = 0.25 + Math.sin(t * 2 + ph) * 0.18;
      b.rotation.z = Math.sin(t * 1.3 + ph) * 0.08; b.rotation.x = moving ? 0.15 : 0;
    } else if (this.type === 'golem') { // 重く揺れる
      b.rotation.z = Math.sin(t * 1.4 + ph) * 0.05;
      b.position.y = moving ? -Math.abs(Math.sin(t * 2.6 + ph)) * 0.08 : 0;
    }
    this.hitT = Math.max(0, this.hitT - dt);
    this.rimU.strength.value = (this.type === 'golem' ? 0.4 : 0.8) + Math.sin(t * 3 + ph) * 0.12 + this.hitT * 14;
    if (this.sigil) this.sigil.rotation.z += dt * 0.6;
    if (this.type === 'skeleton' && ud.weapon) ud.weapon.rotation.x = -1.1 + this.attackAnim * 1.8;
    if (this.type === 'golem' && ud.arms) { ud.arms[1].rotation.x = -this.attackAnim * 2; ud.arms[0].rotation.x = Math.sin(G.time * 2) * 0.1; }
  }
  think(dt) {
    const T = this.T;
    if (this.stun > 0) { this.stun -= dt; return; }
    // 目標選択
    if (!this.target || !this.target.alive || this.target.downed || Math.random() < dt * 0.5) {
      let best = null, bd = this.aggro ? 26 : 15;
      for (const m of G.mages) {
        if (!m.alive || m.downed) continue;
        const d = m.pos.distanceTo(this.pos);
        if (d < bd && (this.aggro || lineOfSight(this.pos, m.pos))) { bd = d; best = m; }
      }
      if (best && !this.aggro) sfx.growl(this.pos);
      this.target = best; if (best) this.aggro = true;
    }
    let sp = T.speed * (this.status.slow ? 0.5 : 1);
    const move = new THREE.Vector3();
    if (this.target) {
      const tp = this.target.pos;
      const d = tp.distanceTo(this.pos);
      const los = lineOfSight(this.pos, tp);
      this.yaw = Math.atan2(-(tp.x - this.pos.x), -(tp.z - this.pos.z));
      const inRange = d < T.range + this.target.radius && (los || !T.ranged);
      if (inRange) {
        if (T.ranged && d < 5) move.set(this.pos.x - tp.x, 0, this.pos.z - tp.z).normalize().multiplyScalar(0.6);
        this.cd -= dt;
        if (this.cd <= 0) { this.cd = T.cd * rand(0.85, 1.2); this.attack(); }
      } else {
        let dir = null;
        if (los && d < 8) dir = new THREE.Vector3(tp.x - this.pos.x, 0, tp.z - this.pos.z).normalize();
        else if (this.target.flow) dir = flowDir(this.target.flow, this.pos);
        if (dir) move.copy(dir);
      }
    }
    // 群れの分離
    for (const o of G.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = dx * dx + dz * dz, min = this.radius + o.radius;
      if (dd < min * min && dd > 1e-4) { const k = (min - Math.sqrt(dd)) * 2; move.x += dx * k; move.z += dz * k; }
    }
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    const dx = move.x * sp * dt + this.knock.x * dt, dz = move.z * sp * dt + this.knock.z * dt;
    moveWithCollision(this.pos, dx, dz, this.radius, this.team);
    this.vel.set(dx / dt, 0, dz / dt);
  }
  attack() {
    const t = this.target; if (!t) return;
    this.attackAnim = 1;
    if (this.T.ranged) {
      const from = this.pos.clone(); from.y = 1.6;
      const to = t.pos.clone(); to.y = 1.1;
      G.fx.enemyBolt(this, from, to.sub(from).normalize());
    } else {
      G.fx.damage(t, this.dmg * rand(0.85, 1.15), [], this, { melee: true });
      sfx.hit(t.pos);
      if (t.thorns && t.shield > 0) G.fx.damage(this, 12, t.thorns, t, {});
    }
  }
  dispose() { G.scene.remove(this.root); }
}

// 各魔導師への流れ場を定期更新(魔物の経路探索用)
let flowTimer = 0;
export function updateFlows(dt) {
  flowTimer -= dt; if (flowTimer > 0) return; flowTimer = 0.4;
  for (const m of G.mages) {
    const [cx, cz] = cellOf(m.pos);
    if (m._fc === cx + ',' + cz && m.flow) continue;
    m._fc = cx + ',' + cz; m.flow = bfs(G.dungeon.grid, cx, cz);
  }
}
