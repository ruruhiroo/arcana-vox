// 魔導師と魔物: 見た目・状態・魔物AI
import * as THREE from 'three';
import { G, rand, clamp } from './state.js';
import { moveWithCollision, flowDir, lineOfSight, bfs, cellOf, settleY, CLIMB } from './dungeon.js';
import { textSprite, runeCircleTex, glowSprite } from './textures.js';
import { sfx } from './audio.js';
import { buildEnemyModel, animateEnemy } from './enemymodels.js';
import { compile } from './lexicon.js';
// 写本師が唱える呪文 (プレイヤーと同じ言霊)
import { WORD_BY_ID } from './lexicon.js';
const WORDS_TEXT = new Proxy({}, { get: (_, id) => WORD_BY_ID[id]?.text || '' });
const SCRIBE_SPELLS = ['汝に 紅蓮 穿槍 放て', '汝に 氷獄 天雨 放て', '汝に 雷霆 穿槍 放て', '汝に 深淵 穿槍 放て'];

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
      this.label = textSprite(name, { size: 30, color: '#e8dcc0' }); this.label.position.y = 2.15; this.label.visible = false; this.root.add(this.label); // 頭上の名前は出さない
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
  skeleton: { name: '骸骨兵', hp: 70, speed: 2.7, dmg: 10, range: 1.7, cd: 1.3, radius: 0.4, undead: true, weak: ['holy', 'thunder'], resist: ['void', 'ice'], drops: ['bone', 'bone', 'iron'] },
  slime:    { name: '粘獣', hp: 62, speed: 1.9, dmg: 8, range: 1.4, cd: 1.1, radius: 0.55, weak: ['fire'], resist: ['wind'], drops: ['herb', 'crystal'] },
  wraith:   { name: '怨霊', hp: 64, speed: 2.3, dmg: 12, range: 13, cd: 2.6, radius: 0.45, undead: true, ranged: true, fly: true, weak: ['holy', 'fire'], resist: ['void', 'ice'], drops: ['crystal', 'crystal'] },
  scribe:   { name: '堕ちた写本師', hp: 72, speed: 2.1, dmg: 8, range: 13, cd: 4.2, radius: 0.42, caster: true, weak: ['fire', 'thunder'], resist: ['void'], drops: ['scroll', 'crystal'] },
  golem:    { name: '石像兵', hp: 240, speed: 1.5, dmg: 22, range: 2.3, cd: 2.0, radius: 0.85, weak: ['thunder'], resist: ['fire', 'ice', 'wind'], drops: ['iron', 'iron', 'crystal', 'crystal'] },
};

// 種類ごとの縁取りの色 (暗がりでも輪郭と種類が分かるように)
export const ENEMY_RIM = { skeleton: 0xff5a3a, slime: 0x7dff4a, wraith: 0xb565ff, golem: 0xff9a2a, scribe: 0xff4a8a };
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
  group.traverse(o => { if (o.isMesh && o.userData.eye) list.push(o); });
  for (const o of list) {
    o.scale.multiplyScalar(1.3);
    const c = o.material.isMeshBasicMaterial ? o.material.color : o.material.emissive;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX || (GLOW_TEX = glowSprite()), color: c.clone(), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    s.scale.setScalar(0.22); s.position.copy(o.position); s.renderOrder = 5;
    o.parent.add(s);
  }
}

function enemyMesh(type, scale = 1) {
  const g = buildEnemyModel(type);
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
    if (T.caster) { this.chantLabel = textSprite('', { size: 30, color: '#ffb0c8', bg: 'rgba(40,0,20,0.55)', width: 1100, lines: 2 }); this.chantLabel.position.y = 2.6; this.root.add(this.chantLabel); }
    this.hpBar = textSprite('', { size: 26, color: '#ff8a7a', width: 512 }); this.hpBar.scale.multiplyScalar(0.5); this.hpBar.position.y = (T.fly ? 2.6 : 2.2) * (boss ? 1.8 : 1); this.root.add(this.hpBar);
    G.scene.add(this.root);
  }
  updateHpBar() {
    this.hitT = 0.18; // 被弾で縁取りが一瞬強く光る
    const n = 10, f = Math.ceil(clamp(this.hp / this.maxHp, 0, 1) * n);
    this.hpBar.userData.set(this.hp < this.maxHp ? `${'▮'.repeat(f)}${'▯'.repeat(n - f)}` : ''); // 名前は出さず、体力だけ
  }
  update(dt) {
    if (!this.alive) return;
    for (const k in this.status) {
      const s = this.status[k]; s.t -= dt;
      if (k === 'burn' && G.isHost) G.fx.damage(this, s.dps * dt, [], s.src, { silent: true });
      // 状態の見た目: 燃える炎・霜・聖痕の光・侵蝕の靄
      const fxc = { burn: 0xff7020, slow: 0x9fe4ff, frozen: 0xcfefff, stigma: 0xffe8a0, erosion: 0x8a40c0 }[k];
      if (fxc && Math.random() < dt * (k === 'burn' ? 22 : 9)) G.particles.emit(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.7)), new THREE.Vector3(0, k === 'burn' ? 1.6 : 0.4, 0), fxc, k === 'burn' ? 0.35 : 0.22, 0.7);
      if (s.t <= 0) delete this.status[k];
    }
    if (!this.alive) return;
    const T = this.T;
    if (G.isHost) this.think(dt);
    else { // 補間
      this.pos.lerp(this.netTarget, Math.min(1, dt * 10));
    }
    settleY(this.pos, dt); // 段差に沿う
    // 見た目のアニメーション
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI;
    const ud = this.body.userData, t = G.time, ph = this.phase, b = this.body;
    const moving = (this._lastX !== undefined) && Math.hypot(this.pos.x - this._lastX, this.pos.z - this._lastZ) > dt * 0.4;
    this._lastX = this.pos.x; this._lastZ = this.pos.z;
    this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    // 種類ごとの動き(体の揺れ・浮き) と、関節の動き(歩く・振る・漂う)
    if (this.type === 'skeleton') b.position.y = moving ? Math.abs(Math.sin(t * 9 + ph)) * 0.04 : 0;
    else if (this.type === 'slime') b.position.y = moving ? Math.abs(Math.sin(t * 5 + ph)) * 0.22 : 0;
    else if (this.type === 'wraith') { b.position.y = 0.25 + Math.sin(t * 2 + ph) * 0.18; b.rotation.z = Math.sin(t * 1.3 + ph) * 0.06; b.rotation.x = moving ? 0.18 : 0; if (Math.random() < dt * 14) G.particles.emit(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6)), new THREE.Vector3(0, -0.3, 0), 0x3a2050, 0.5, 1.2); }
    else if (this.type === 'golem') { b.rotation.z = Math.sin(t * 1.4 + ph) * 0.04; b.position.y = moving ? -Math.abs(Math.sin(t * 3.2 + ph)) * 0.06 : 0; }
    animateEnemy(ud, t, ph, moving, this.attackAnim, dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.rimU.strength.value = (this.type === 'golem' ? 0.4 : 0.8) + Math.sin(t * 3 + ph) * 0.12 + this.hitT * 14;
    if (this.sigil) this.sigil.rotation.z += dt * 0.6;
  }
  think(dt) {
    const T = this.T;
    if (this.stun > 0) { this.stun -= dt; return; }
    // 目標選択
    if (this.target && G.inSanctuary?.(this.target.pos)) { this.target = null; this.aggro = false; }
    if (!this.target || !this.target.alive || this.target.downed || Math.random() < dt * 0.5) {
      let best = null, bd = this.aggro ? 26 : this.keen ? 21 : 15; // 協力探索の魔物は遠くから気づく
      for (const m of G.mages) {
        if (!m.alive || m.downed || G.inSanctuary?.(m.pos)) continue; // 聖域の中の者は狙えない
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
      if (T.caster) {
        if (this.chant) {
          this.chant.t += dt;
          const words = this.chant.words, k = Math.min(words.length, Math.floor(this.chant.t / this.chant.dur * words.length) + 1);
          const text = words.slice(0, k).join(' ');
          if (text !== this.chant.shown) { this.chant.shown = text; this.chantLabel.userData.set(`「${text}」`); G.hearChant?.(this, text); }
          if (this.chant.t >= this.chant.dur) this.finishChant(tp);
        } else if (los && d < T.range) {
          this.cd -= dt;
          if (this.cd <= 0) this.beginChant();
        }
        // 近づかれたら下がり、遠ければ寄る
        if (d < 6) move.set(this.pos.x - tp.x, 0, this.pos.z - tp.z).normalize();
        else if (!los || d > T.range) { const dir = this.target.flow ? flowDir(this.target.flow, this.pos) : null; if (dir) move.copy(dir); }
        if (this.chant) move.multiplyScalar(0.3);
      } else if (inRange) {
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
    moveWithCollision(this.pos, dx, dz, this.radius, this.team, CLIMB); // 魔物は高台をよじ登って追ってくる
    this.vel.set(dx / dt, 0, dz / dt);
  }
  beginChant() {
    const text = this.nextSpell || SCRIBE_SPELLS[Math.floor(Math.random() * SCRIBE_SPELLS.length)];
    this.nextSpell = null;
    const spell = compile(text, null);
    const words = spell.words.map(id => WORDS_TEXT[id]);
    this.chant = { spell, words, t: 0, dur: 1.4 + words.length * 0.55, shown: '' };
    sfx.chantStart?.();
  }
  finishChant(tp) {
    const c = this.chant; this.chant = null; this.cd = this.T.cd * rand(0.8, 1.2);
    this.chantLabel?.userData.set('');
    if (!this.alive || !this.target) return;
    const spell = c.spell; spell.power *= this.bossKind ? 0.9 : 0.6;
    const from = this.pos.clone().setY(this.pos.y + 1.5), to = this.target.pos.clone().setY(this.target.pos.y + 1);
    const aim = { origin: from.toArray(), dir: to.clone().sub(from).normalize().toArray(), point: this.target.pos.toArray(), targetId: this.target.id };
    G.fx.cast(this, spell, aim);
    G.net?.send({ t: 'ecast', id: this.id, words: spell.words, aim });
  }
  // 強打で詠唱が途切れる (写本師)
  interrupt() {
    if (!this.chant) return false;
    this.chant = null; this.chantLabel?.userData.set(''); this.stun = 0.9; this.cd = 1.5;
    G.ui?.floatText(this.pos, '詠唱妨害!', '#ffd76a');
    return true;
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
    m._fc = cx + ',' + cz; m.flow = bfs(G.dungeon.grid, cx, cz, G.dungeon.hgt, CLIMB);
  }
}
