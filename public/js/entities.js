// 魔導師と魔物: 見た目・状態・魔物AI
import * as THREE from 'three';
import { G, rand, clamp } from './state.js';
import { moveWithCollision, flowDir, lineOfSight, bfs, cellOf, settleY, CLIMB, FINAL_FLOOR, findFreePosition } from './dungeon.js';
import { textSprite, runeCircleTex, glowSprite } from './textures.js';
import { sfx } from './audio.js';
import { buildEnemyModel, animateEnemy } from './enemymodels.js';
import { buildGuardian, animateGuardian } from './guardian-model.js';
import { dragonElement, DRAGON_PROFILES } from './dragon-profiles.js';
import { makeModel, animateGlb, dieGlb, playGlb } from './glbmodels.js';
import { compile, withCallName } from './lexicon.js';
// 写本師が唱える呪文 (プレイヤーと同じ言霊)
import { WORD_BY_ID } from './lexicon.js';
const WORDS_TEXT = new Proxy({}, { get: (_, id) => WORD_BY_ID[id]?.text || '' });
const SCRIBE_SPELLS = ['汝に 紅蓮 穿槍', '汝に 氷獄 天雨', '汝に 雷霆 穿槍', '汝に 深淵 穿槍'].map(withCallName);

let RUNE_TEX = null, GLOW_TEX = null;

// ---------- 魔導師 ----------
function mageMesh(color) {
  // Blender で彫った魔導師(models/mage.glb)があればそれを使い、衣と杖の結晶を持ち主の色に染める
  const forged = makeModel('mage');
  if (forged) {
    let crystal = null;
    forged.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.name === 'tint') o.material.color.set(color).lerp(new THREE.Color(0xffffff), 0.25);
      if (o.material.name === 'pupil') { o.material.color.set(0x120c18); o.material.roughness = 0.55; o.material.metalness = 0; o.material.envMapIntensity = 0; }   // 黒目は光を拾わせない
      if (o.material.name === 'glint') { o.material.emissiveIntensity = 0; o.material.color.set(0x9a9eaa); o.material.roughness = 0.8; }
      if (o.material.name === 'eye') { o.material.emissive.set(0xffffff); o.material.emissiveIntensity = 0.22; o.material.color.set(0xe8e8ee); o.material.roughness = 0.7; }   // 白目は、暗がりでも見える程度にだけ光らせる
      if (o.material.name === 'crystal') { o.material.color.set(color); o.material.emissive.set(color); crystal = o; }
    });
    forged.userData.crystal = crystal;
    forged.userData.forged = true;
    return forged;
  }
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
  get speedMul() { let m = 1; if (this.status.slow) m *= 0.55; if (this.status.haste) m *= 1.6; if (this.chanting && this.kind !== 'player') m *= 0.55; if (this.status.tiny) m *= 1.25; if (this.status.giant) m *= 0.8; if (this.status.orb) m *= 0.72; return m; } // 自分の詠唱の遅さは main 側(言霊が聞き取れてから)
  setChant(text, words = 0) {
    this.chantText = text;
    if (this.chantLabel) this.chantLabel.userData.set(text ? `「${text}」` : '');
    this.chanting = !!text;
    this.chantWords = words;
  }
  update(dt) {
    for (const k in this.status) {
      const s = this.status[k]; s.t -= dt;
      if ((k === 'burn' || k === 'poison') && s.t > 0 && this.isLocal()) G.fx.damage(this, s.dps * dt, [], s.src, { silent: true });
      if (s.t <= 0) delete this.status[k];
    }
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) { this.shield = 0; this.thorns = null; } }
    this.shieldMesh.material.opacity = this.shield > 0 ? 0.12 + 0.05 * Math.sin(G.time * 6) : 0;
    this.shieldMesh.visible = this.shield > 0 && this.kind !== 'player';
    if (!this.chanting && this.alive && !this.downed) this.mp = Math.min(this.maxMp, this.mp + dt * (this.kind === 'player' ? 2.5 : 6) * (this.regenMul || 1));
    if (this.status.manaflow && this.alive) this.mp = Math.min(this.maxMp, this.mp + dt * this.status.manaflow.rate); // 魔力薬
    this.castLock = Math.max(0, this.castLock - dt);
    // 詠唱中は足元に魔法陣
    const target = this.chanting ? Math.min(1, 0.35 + (this.chantWords || 1) * 0.15) : 0;
    const op = this.circle.material.opacity;
    this.circle.material.opacity = op + (target * 0.85 - op) * Math.min(1, dt * 6);
    this.circle.rotation.z += dt * (0.5 + (this.chantWords || 0) * 0.4);
    const sc = 0.6 + (this.chantWords || 1) * 0.25; this.circle.scale.setScalar(sc);
    this.root.position.copy(this.pos);
    if (this.model) {
      this.model.rotation.y = this.yaw; // 顔(-Z)を視線の向きへ
      const ud = this.model.userData;
      if (ud.crystal) ud.crystal.material.emissiveIntensity = this.chanting ? 4 + Math.sin(G.time * 12) * 1.5 : 2;
      if (ud.forged) {
        // 倒れる / 詠唱の構え / 術を放つ / 歩く / 立つ
        const cast = this.castLock > 0 && !this.chanting;
        if (cast && !ud.wasCast && ud.actions.attack) { ud.cur = null; ud.atkT = ud.actions.attack.getClip().duration * 0.9; }
        ud.wasCast = cast; ud.atkT = Math.max(0, (ud.atkT || 0) - dt);
        playGlb(ud, this.downed ? 'die' : ud.atkT > 0 ? 'attack' : this.chanting ? 'chant' : this.vel.length() > 0.4 ? 'walk' : 'idle', dt, this.downed ? 0.1 : 0.2);
      } else {
        ud.staff.rotation.x = this.chanting ? -0.9 + Math.sin(G.time * 8) * 0.05 : -0.15;
        if (this.downed) { this.model.rotation.x = -1.4; this.model.position.y = 0.25; } else { this.model.rotation.x = 0; this.model.position.y = Math.abs(Math.sin(G.time * 7)) * this.vel.length() * 0.012; }
      }
      this.root.visible = this.alive;
    }
  }
  isLocal() { return this.kind === 'player' || this.kind === 'bot'; }
  dispose() { G.scene.remove(this.root); }
}

// 倒れた魔物の後始末(毎フレーム)
export function updateDying(dt) {
  if (!G.dying) return;
  for (let i = G.dying.length - 1; i >= 0; i--) {
    const d = G.dying[i];
    d.t -= dt;
    d.e.body.userData.mixer?.update(dt);
    if (d.e.rimU) d.e.rimU.strength.value = Math.max(0, d.e.rimU.strength.value - dt * 0.3); // 縁取りも消えていく
    if (d.t < 0.6) d.e.root.position.y -= dt * 0.8; // 床に沈む
    if (d.t <= 0) { d.e.dispose(); G.dying.splice(i, 1); }
  }
}
export function clearDying() { for (const d of G.dying || []) d.e.dispose(); G.dying = []; }

// 途中で現れる魔物 (呼び出し・召喚)
export function spawnEnemy(id, type, pos, floor, summoner = null) {
  if (G.enemies.some(e => e.id === id)) return null;
  const free=findFreePosition(pos,ENEMY_TYPES[type]?.radius||.4,{occupied:[...G.enemies,...G.mages].filter(e=>e.alive),maxDistance:12});
  if(!free)return null;
  const e = new Enemy(id, type, free, floor);
  e.summoner = summoner; e.aggro = true;
  G.enemies.push(e);
  G.fx?.burst?.(pos.clone().setY(0.5), 0x60ff9a, 40, { speed: 3, up: 2 });
  return e;
}

// ---------- 魔物 ----------
export const ENEMY_TYPES = {
  dragon: { name: '詠灰竜ヴォルグ', hp: 230, speed: 2, dmg: 24, range: 24, cd: 8, radius: 1.8, h: 10.5, weak: [], resist: [], drops: ['crystal', 'iron', 'scroll'] },
  skeleton: { name: '骸骨兵', hp: 70, speed: 2.7, dmg: 10, range: 1.7, cd: 1.3, radius: 0.4, undead: true, weak: ['holy', 'thunder'], resist: ['void', 'ice'], drops: ['bone', 'bone', 'iron'] },
  slime:    { name: '粘獣', hp: 62, speed: 1.9, dmg: 8, range: 1.4, cd: 1.1, radius: 0.55, weak: ['fire'], resist: ['wind'], drops: ['herb', 'crystal'] },
  wraith:   { name: '怨霊', hp: 64, speed: 2.3, dmg: 12, range: 13, cd: 2.6, radius: 0.45, undead: true, ranged: true, fly: true, weak: ['holy', 'fire'], resist: ['void', 'ice'], drops: ['crystal', 'crystal'] },
  scribe:   { name: '堕ちた写本師', hp: 72, speed: 2.1, dmg: 8, range: 13, cd: 4.2, radius: 0.42, caster: true, weak: ['fire', 'thunder'], resist: ['void'], drops: ['scroll', 'crystal'] },
  // 追加の魔物 (層が深くなるほど出やすい)
  ghoul:    { name: '屍食鬼', hp: 55, speed: 3.7, dmg: 9, range: 1.5, cd: 0.9, radius: 0.4, undead: true, weak: ['fire', 'holy'], resist: ['void'], drops: ['bone', 'herb'], h: 1.9 },
  bat:      { name: '吸血大蝙蝠', hp: 32, speed: 4.4, dmg: 6, range: 1.5, cd: 1.0, radius: 0.35, fly: true, flyH: 1.5, swoop: true, drain: true, weak: ['wind', 'thunder'], resist: [], drops: ['herb'], h: 2.2 },
  spider:   { name: '洞窟大蜘蛛', hp: 85, speed: 3.4, dmg: 11, range: 1.9, cd: 1.4, radius: 0.7, leap: true, web: true, weak: ['fire'], resist: ['ice'], drops: ['crystal', 'herb'], h: 1.4 },
  imp:      { name: '炎小鬼', hp: 50, speed: 3.0, dmg: 10, range: 12, cd: 2.4, radius: 0.35, ranged: true, bolt: 'fire', weak: ['ice', 'holy'], resist: ['fire'], drops: ['crystal'], h: 1.5 },
  knight:   { name: '亡霊騎士', hp: 180, speed: 2.3, dmg: 18, range: 2.1, cd: 1.6, radius: 0.5, undead: true, guard: true, weak: ['holy', 'thunder'], resist: ['ice', 'wind', 'void'], drops: ['iron', 'iron', 'crystal'], h: 2.4 },
  ogre:     { name: '岩喰い鬼', hp: 320, speed: 1.9, dmg: 26, range: 2.7, cd: 2.4, radius: 0.9, slam: true, weak: ['ice', 'fire'], resist: ['wind'], drops: ['iron', 'herb', 'herb'], h: 3.1 },
  lich:     { name: '屍術師', hp: 160, speed: 1.8, dmg: 14, range: 14, cd: 3.2, radius: 0.5, undead: true, ranged: true, bolt: 'void', summon: true, weak: ['holy', 'fire'], resist: ['void', 'ice'], drops: ['scroll', 'crystal', 'crystal'], h: 2.6 },
  golem:    { name: '石像兵', hp: 240, speed: 1.5, dmg: 22, range: 2.3, cd: 2.0, radius: 0.85, weak: ['thunder'], resist: ['fire', 'ice', 'wind'], drops: ['iron', 'iron', 'crystal', 'crystal'] },
};

// ---- 近接の振り方 ----
// wind = 振りかぶってから武器が届くまでの秒 / rec = 振った後の硬直の秒 / dmg = 傷の倍率 / reach = 届く距離の足し前 / arc = 当たる向きの幅(正面から左右へ、ラジアン)
// 傷は「振り始め」ではなく、武器が届いた瞬間(wind 秒後)に、その時まだ届く所にいる者だけが受ける。振りかぶりの終わり際は向きを変えられないので、横へ動けば避けられる
export const SWINGS = {
  light: { label: '小振り',     wind: 0.36, rec: 0.38, dmg: 0.7,  reach: 0.1,  arc: 0.95, track: 0.8,  w: 3, cd: 0.4,  pose: 'jab' },
  heavy: { label: '大振り',     wind: 0.95, rec: 1.1,  dmg: 1.7,  reach: 0.3,  arc: 0.7,  track: 0.6,  w: 2, cd: 0.9,  pose: 'over', push: 7, shake: 0.28, thud: true, growl: true },
  sweep: { label: '薙ぎ払い',   wind: 0.62, rec: 0.75, dmg: 1.0,  reach: 0.4,  arc: 1.5,  track: 0.7,  w: 2, cd: 0.8,  pose: 'sweep', all: true, push: 3.5 },
  lunge: { label: '踏み込み突き', wind: 0.55, rec: 0.85, dmg: 1.25, reach: 0.55, arc: 0.45, track: 0.55, w: 2, cd: 0.85, pose: 'lunge', step: 11 },
  slam:  { label: '叩きつけ',   wind: 0.85, rec: 1.2,  dmg: 1.0,  reach: 0,    arc: 9,    track: 1,    w: 3, cd: 1,    pose: 'over', radial: 3.2, push: 9, shake: 0.35, thud: true, growl: true },
};
// 種類ごとに使える振り方(無い種類は小振りと大振り)
const SWING_SET = {
  skeleton: ['light', 'heavy', 'sweep', 'lunge'], knight: ['light', 'heavy', 'sweep', 'lunge'], ghoul: ['light', 'light', 'sweep', 'lunge'],
  ogre: ['slam', 'sweep', 'heavy'], golem: ['heavy', 'sweep', 'light'], slime: ['light', 'lunge'], bat: ['light', 'lunge'], spider: ['light', 'heavy'],
};
// 模型の攻撃の動きの中で、武器が届く瞬間の位置(0〜1)
const ATK_FRAC = { skeleton: 0.58, ghoul: 0.55, knight: 0.55, ogre: 0.62, golem: 0.62 };
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// 振り方ごとの体の動き: [前後の傾き, ひねり, 横の傾き, 前への踏み出し(m), 沈み(m)] を「振りかぶり」と「届いた瞬間」で持つ
const SWING_POSE = {
  jab:   { wind: [0.07, 0.12, 0, 0.05, 0],      hit: [-0.16, -0.14, 0, -0.16, -0.02] },
  over:  { wind: [0.26, 0, 0, 0.14, 0.05],      hit: [-0.42, 0, 0, -0.3, -0.12] },
  sweep: { wind: [-0.06, 0.75, -0.2, 0.05, -0.04], hit: [-0.14, -0.85, 0.24, -0.14, -0.06] },
  lunge: { wind: [-0.14, 0.1, 0, 0.24, -0.09],  hit: [-0.3, -0.06, 0, -0.6, -0.05] },
};
// 今の体の動き(振りかぶり → 届く直前に一気に振り抜く → 硬直の間は振り抜いた姿勢のまま → ゆっくり戻る)
export function swingPose(s, out = [0, 0, 0, 0, 0]) {
  const V = s.V, P0 = SWING_POSE[V.pose] || SWING_POSE.jab, p = s.t / V.wind;
  if (p < 1) {
    const a = smooth(Math.min(1, p / 0.78)), k = p < 0.78 ? 0 : Math.pow((p - 0.78) / 0.22, 2);
    for (let i = 0; i < 5; i++) out[i] = P0.wind[i] * a * (1 - k) + P0.hit[i] * k;
  } else {
    const q = (s.t - V.wind) / V.rec, back = 1 - smooth((q - 0.55) / 0.45);
    for (let i = 0; i < 5; i++) out[i] = P0.hit[i] * back;
    if (V.thud) out[2] += Math.sin(q * 26) * 0.035 * Math.max(0, 1 - q * 1.6);   // 大振りの後は、反動で体が揺れる
  }
  return out;
}

// 種類ごとの縁取りの色 (暗がりでも輪郭と種類が分かるように)
export const ENEMY_RIM = { dragon: 0xb98763, skeleton: 0xff5a3a, slime: 0x7dff4a, wraith: 0xb565ff, golem: 0xff9a2a, scribe: 0xff4a8a, ghoul: 0xc8ff5a, bat: 0xff4a4a, spider: 0xff3a1a, imp: 0xffa040, knight: 0x60c8ff, ogre: 0xffb060, lich: 0x60ff9a };
// 標準材質に「視線と直交する面ほど光る」縁取りを足す
function addRim(group, U) {
  group.traverse(o => {
    if (!o.isMesh || !o.material || !(o.material.isMeshStandardMaterial)) return;
    const m = o.material = o.material.clone();
    const rimScale=group.userData.asset==='nox-v2' ? .18 : 1;
    m.onBeforeCompile = sh => {
      sh.uniforms.rimColor = U.color; sh.uniforms.rimStrength = U.strength;
      sh.uniforms.rimScale={value:rimScale};
      sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimScale;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimF = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\n  totalEmissiveRadiance += rimColor * pow(rimF, 2.2) * rimStrength * rimScale;');
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

function enemyMesh(type, scale = 1, floor = 1) {
  if (type === 'dragon') return buildGuardian(DRAGON_PROFILES[dragonElement(floor, floor === FINAL_FLOOR)].kind);
  const glb = makeModel(type);
  if (glb) { glb.scale.setScalar(scale); return glb; }
  const g = buildEnemyModel(['skeleton', 'slime', 'wraith', 'scribe', 'golem'].includes(type) ? type : type === 'ghoul' || type === 'knight' ? 'skeleton' : type === 'bat' || type === 'lich' ? 'wraith' : type === 'ogre' ? 'golem' : 'slime');
  addEyeGlow(g);
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Enemy {
  constructor(id, type, pos, floor, boss = false) {
    const T = ENEMY_TYPES[type];
    this.id = id; this.type = type; this.T = T; this.boss = boss;
    const scale = 1 + 0.2 * (floor - 1);
    this.floor = floor;
    this.elite = !boss && floor >= 3 && ((id.length * 7 + floor * 13 + (id.charCodeAt(id.length - 1) || 0)) % 100) < Math.min(30, (floor - 2) * 4); // 精鋭
    this.maxHp = Math.round(T.hp * scale * (boss ? 2.6 : 1) * (this.elite ? 1.7 : 1)); this.hp = this.maxHp;
    this.dmg = T.dmg * (1 + 0.12 * (floor - 1)) * (boss ? 1.4 : 1) * (this.elite ? 1.3 : 1);
    this.speedMul = 1 + Math.min(0.35, 0.035 * (floor - 1)) + (this.elite ? 0.1 : 0);
    this.radius = T.radius * (boss ? 1.5 : 1);
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.knock = new THREE.Vector3();
    this.netTarget = pos.clone();
    this.yaw = Math.random() * 6; this.team = 'monster'; this.alive = true; this.status = {};
    this.cd = rand(0.5, 1.5); this.target = null; this.aggro = false; this.stun = 0; this.attackAnim = 0;
    this.undead = !!T.undead; this.isMage = false; this.name = (boss ? '【主】' : this.elite ? '【精鋭】' : '') + T.name;
    this.phase = Math.random() * 6.28;
    this.body = enemyMesh(type, boss ? 1.8 : this.elite ? 1.18 : 1, floor);
    this.root = new THREE.Group(); this.root.add(this.body);
    this.rimU = { color: { value: new THREE.Color(this.elite ? 0xd0a040 : 0x8a94a8) }, strength: { value: 0.3 } };
    addRim(this.body, this.rimU);
    this.hitT = 0;
    if (boss) {
      // 主: 足元に赤い紋章
      const sig = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: RUNE_TEX || (RUNE_TEX = runeCircleTex()), color: 0xff3a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
      sig.rotation.x = -Math.PI / 2; sig.position.y = 0.06; this.root.add(sig); this.sigil = sig;
    }
    this.root.position.copy(pos);
    if (T.caster) { this.chantLabel = textSprite('', { size: 30, color: '#ffb0c8', bg: 'rgba(40,0,20,0.55)', width: 1100, lines: 2 }); this.chantLabel.position.y = 2.6; this.root.add(this.chantLabel); }
    this.hpBar = textSprite('', { size: 26, color: '#ff8a7a', width: 512 }); this.hpBar.scale.multiplyScalar(0.5); this.hpBar.position.y = (T.h || (T.fly ? 2.6 : 2.2)) * (boss ? 1.8 : this.elite ? 1.18 : 1); this.root.add(this.hpBar);
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
      if ((k === 'burn' || k === 'poison') && G.isHost) G.fx.damage(this, s.dps * dt, [], s.src, { silent: true });
      // 状態の見た目: 燃える炎・霜・聖痕の光・侵蝕の靄
      const fxc = { burn: 0xff7020, slow: 0x9fe4ff, frozen: 0xcfefff, stigma: 0xffe8a0, erosion: 0x8a40c0, wet: 0x4a90ff }[k];
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
    this.root.rotation.y = this.yaw; // 顔(-Z)を狙う相手へ向ける
    const ud = this.body.userData, t = G.time, ph = this.phase, b = this.body;
    const moving = (this._lastX !== undefined) && Math.hypot(this.pos.x - this._lastX, this.pos.z - this._lastZ) > dt * 0.4;
    this._lastX = this.pos.x; this._lastZ = this.pos.z;
    this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    if (this.swing) {
      this.swing.t += dt;
      if (this.stun > 0 && !this.swing.hit) this.cancelSwing();                                     // 振りかぶりの間に怯ませれば、振りは止まる
      else if (!G.isHost && this.swing.t >= this.swing.V.wind + this.swing.V.rec) this.swing = null;   // 部屋の主でない側は、見た目だけ
    }
    // 種類ごとの動き(体の揺れ・浮き) と、関節の動き(歩く・振る・漂う)
    if (ud.kind === 'glb') {
      if (T.fly) b.position.y = (T.flyH || 0.3) + Math.sin(t * 2.2 + ph) * 0.15; // 飛ぶ者は宙に
      // 振りに合わせた体の動き(踏み込む・ひねる・振り抜いて沈む)
      const sz = (T.h || 1.8) / 1.8, bp = this._bp ||= [0, 0, 0, 0, 0];
      if (this.swing) swingPose(this.swing, bp); else for (let i = 0; i < 5; i++) bp[i] *= Math.max(0, 1 - dt * 9);
      b.rotation.x = bp[0]; b.rotation.y = bp[1]; b.rotation.z = bp[2]; b.position.z = bp[3] * sz; if (!T.fly) b.position.y = bp[4] * sz; else b.position.y += bp[4] * sz;
      if (this.attackAnim > (this._prevAtk || 0) + 0.01) this._atkPending = true; this._prevAtk = this.attackAnim;
      // 遠くの魔物は動きの計算を間引く(重くならないように)
      this._animAcc = (this._animAcc || 0) + dt; this._animN = ((this._animN || 0) + 1) % 3;
      const far = G.player ? this.pos.distanceTo(G.player.pos) > 28 : false;
      if (!far || this._animN === 0 || this._atkPending) { animateGlb(ud, this._animAcc, moving, (T.speed / 2.6) * this.speedMul, this._atkPending && (this._atkSpec || true)); this._animAcc = 0; this._atkPending = false; this._atkSpec = null; }
    }
    else if (this.type === 'skeleton') b.position.y = moving ? Math.abs(Math.sin(t * 9 + ph)) * 0.04 : 0;
    else if (this.type === 'slime') b.position.y = moving ? Math.abs(Math.sin(t * 5 + ph)) * 0.22 : 0;
    else if (this.type === 'wraith') { b.position.y = 0.25 + Math.sin(t * 2 + ph) * 0.18; b.rotation.z = Math.sin(t * 1.3 + ph) * 0.06; b.rotation.x = moving ? 0.18 : 0; if (Math.random() < dt * 14) G.particles.emit(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6)), new THREE.Vector3(0, -0.3, 0), 0x3a2050, 0.5, 1.2); }
    else if (this.type === 'golem') { b.rotation.z = Math.sin(t * 1.4 + ph) * 0.04; b.position.y = moving ? -Math.abs(Math.sin(t * 3.2 + ph)) * 0.06 : 0; }
    if (this.type === 'dragon') animateGuardian(ud, t, moving);
    else if (ud.kind !== 'glb') animateEnemy(ud, t, ph, moving, this.attackAnim, dt);
    this.hitT = Math.max(0, this.hitT - dt);
    // 縁取り: 精巧なモデルは控えめに(暗がりで輪郭が分かる程度)
    const subduedRim = ud.kind === 'glb' || this.type === 'dragon';
    this.rimU.strength.value = (subduedRim ? 0.1 : 0.16) + (this.elite ? 0.22 : 0) + this.hitT * (subduedRim ? 0.9 : 1.6); // 巨竜の広い翼が白く飛ばないよう、輪郭だけを控えめに照らす
    if (this.sigil) this.sigil.rotation.z += dt * 0.6;
  }
  think(dt) {
    const T = this.T;
    if (this.stun > 0) { this.stun -= dt; return; }
    if (this.type === 'dragon') return; // 専用AIが予兆・攻撃・反撃時間を管理する
    if (this.swing) { this.runSwing(dt); return; }
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
    let sp = T.speed * this.speedMul * (this.status.slow ? 0.5 : 1) * (this.status.bound ? 0 : 1); // 束縛中は動けない
    this.leapCd = (this.leapCd || 0) - dt; this.summonCd = (this.summonCd ?? 6) - dt;
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
      } else if (T.leap && los && d > 3.2 && d < 8 && this.leapCd <= 0) {
        // 飛びかかる (蜘蛛)
        this.leapCd = 4.5; this.attackAnim = 1;
        this.knock.add(new THREE.Vector3(tp.x - this.pos.x, 0, tp.z - this.pos.z).normalize().multiplyScalar(16));
        sfx.growl(this.pos);
      } else if (inRange) {
        if (T.summon && this.summonCd <= 0) this.summon();
        if (T.ranged && d < 5) move.set(this.pos.x - tp.x, 0, this.pos.z - tp.z).normalize().multiplyScalar(0.6);
        this.cd -= dt;
        if (this.cd <= 0) { this.cd = T.cd * rand(0.85, 1.2); this.attack(); }
      } else {
        let dir = null;
        if (los && d < 8) dir = new THREE.Vector3(tp.x - this.pos.x, 0, tp.z - this.pos.z).normalize();
        else if (this.target.flow) dir = flowDir(this.target.flow, this.pos);
        if (dir) move.copy(dir);
        if (T.summon && this.summonCd <= 0 && d < 18) this.summon();
      }
      // 蝙蝠: ジグザグに飛び回って狙いを外させる
      if (T.swoop && move.lengthSq()) move.add(new THREE.Vector3(-move.z, 0, move.x).multiplyScalar(Math.sin(G.time * 3 + this.phase) * 0.9));
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
    const c = this.chant; this.chant = null; this.cd = this.T.cd * rand(0.8, 1.2); this.attackAnim = 1;
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
  // 屍術師: 骸骨兵を呼び出す (部屋の主が呼ぶのと同じく、全員の画面に出す)
  summon() {
    this.summonCd = 14;
    const mine = G.enemies.filter(e => e.alive && e.summoner === this.id).length;
    if (mine >= 3) return;
    this.attackAnim = 1;
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2, p = this.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8));
      const id = this.id + '_s' + (this._sn = (this._sn || 0) + 1);
      spawnEnemy(id, 'skeleton', p, this.floor, this.id);
      G.net?.send({ t: 'espawn', id, type: 'skeleton', pos: p.toArray(), floor: this.floor, summoner: this.id });
    }
    G.ui?.floatText(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), '屍よ、起きよ', '#60ff9a');
  }
  attack() {
    const t = this.target; if (!t) return;
    const T = this.T;
    if (T.ranged) {
      this.attackAnim = 1; G.net?.send({ t: 'eatk', id: this.id, v: '' });
      const from = this.pos.clone(); from.y = (this.pos.y || 0) + 1.5;
      const to = t.pos.clone(); to.y = (t.pos.y || 0) + 1.1;
      G.fx.enemyBolt(this, from, to.sub(from).normalize(), T.bolt);
      return;
    }
    this.startSwing(this.chooseSwing());
  }
  // その場に合った振り方を選ぶ: 相手が遠めなら踏み込み、何人も近くにいれば薙ぎ払い、相手が動けないなら大振り。同じ振りは続けにくい
  chooseSwing() {
    const T = this.T, t = this.target, list = SWING_SET[this.type] || ['light', 'heavy'];
    const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z), ratio = d / (T.range + (t.radius || 0.4));
    const near = G.mages.filter(m => m.alive && !m.downed && Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < T.range + 1.4).length;
    const stuck = !!(t.status && (t.status.slow || t.status.bound || t.status.frozen)) || !!t.chanting;
    const weight = n => {
      const V = SWINGS[n]; let w = V.w;
      if (n === 'sweep') w *= near >= 2 ? 4 : 0.7;
      if (n === 'lunge') w *= ratio > 0.72 ? 3.2 : ratio < 0.45 ? 0.15 : 1;
      if (n === 'light') w *= ratio > 0.8 ? 0.4 : 1;
      if (n === 'heavy') w *= stuck ? 3 : this.hp < this.maxHp * 0.35 ? 1.8 : 1;
      if (n === this.lastSwing) w *= n === 'light' ? 0.9 : 0.25;          // 小振りは続けて出ることがある(連撃)
      return w;
    };
    const uniq = [...new Set(list)], ws = uniq.map(n => weight(n) * list.filter(x => x === n).length);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < uniq.length; i++) { r -= ws[i]; if (r <= 0) return uniq[i]; }
    return uniq[0];
  }
  // 振り始める(部屋の主が決め、他の者には見た目だけ伝える)
  startSwing(name) {
    const V = SWINGS[name]; if (!V) { this.attackAnim = 1; return; }
    this.swing = { V, name, t: 0, hit: false, stepped: false }; this.lastSwing = name;
    this.attackAnim = 1; this._atkSpec = { wind: V.wind, rec: V.rec, frac: ATK_FRAC[this.type] || 0.55 };
    if (V.growl) sfx.growl(this.pos);
    if (G.isHost) G.net?.send({ t: 'eatk', id: this.id, v: name });
  }
  cancelSwing() {
    this.swing = null; this.cd = Math.max(this.cd, 0.6);
    const ud = this.body.userData; if (ud.kind === 'glb') { ud.sw = null; ud.atkT = 0; }
  }
  // 振りの途中(部屋の主): 終わり際まで相手を追って向きを変え、届いた瞬間に当たりを調べ、その後は硬直する
  runSwing(dt) {
    const s = this.swing, V = s.V, T = this.T, tg = this.target;
    if (tg && tg.alive && s.t < V.wind * V.track) this.yaw = Math.atan2(-(tg.pos.x - this.pos.x), -(tg.pos.z - this.pos.z));
    if (V.step && !s.stepped && s.t >= V.wind * 0.62) { s.stepped = true; if (!this.status.bound) this.knock.add(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(V.step)); }
    if (!s.hit && s.t >= V.wind) { s.hit = true; this.strike(V); }
    if (s.t >= V.wind + V.rec) { this.swing = null; this.cd = T.cd * V.cd * rand(0.75, 1.15); }
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    const dx = this.knock.x * dt, dz = this.knock.z * dt;
    moveWithCollision(this.pos, dx, dz, this.radius, this.team, CLIMB);
    this.vel.set(dx / dt, 0, dz / dt);
  }
  // 武器が届いた瞬間: その時に届く所・向きにいる者だけが傷を受ける
  strike(V) {
    const T = this.T, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let any = false;
    for (const m of (V.all || V.radial ? G.mages : [this.target])) {
      if (!m || !m.alive || m.downed) continue;
      const v = m.pos.clone().sub(this.pos); v.y = 0; const dd = v.length();
      let mul = V.dmg * rand(0.9, 1.1);
      if (V.radial) { if (dd > V.radial) continue; mul = V.dmg * (1.1 - dd * 0.15); }
      else {
        if (dd > T.range + (m.radius || 0.4) + V.reach + 0.15) continue;
        if (dd > 0.6 && Math.acos(Math.max(-1, Math.min(1, (v.x * fx + v.z * fz) / dd))) > V.arc) continue;
        if (Math.abs((m.pos.y || 0) - (this.pos.y || 0)) > 2.4 && !T.fly) continue;       // 高さが大きく違えば届かない
      }
      any = true;
      G.fx.damage(m, this.dmg * mul, [], this, { melee: true });
      if (V.push && m.vel && dd > 0.01) m.pushV = v.normalize().multiplyScalar(V.push);
      if (T.web && m.status) m.status.slow = { t: 2.5 }; // 糸で絡める
      if (T.drain) this.hp = Math.min(this.maxHp, this.hp + this.dmg * 0.6); // 血を吸う
      G.fx.burst(m.pos.clone().add(new THREE.Vector3(-fx * 0.3, 1.1, -fz * 0.3)), 0xffd0a0, V.dmg > 1.3 ? 26 : 12, { speed: V.dmg > 1.3 ? 5 : 3, up: 1 });
      sfx.hit(m.pos);
      if (m.thorns && m.shield > 0) G.fx.damage(this, 12, m.thorns, m, {});
    }
    if (V.thud) {
      // 大振りは外れても床を打つ(土ぼこりと揺れ)
      const at = V.radial ? this.pos.clone() : this.pos.clone().add(new THREE.Vector3(fx, 0, fz).multiplyScalar(T.range * 0.8));
      G.fx.burst(at.setY((this.pos.y || 0) + 0.2), 0xb09070, V.radial ? 60 : 30, { speed: V.radial ? 6 : 4, up: 2 });
      const pd = G.player ? G.player.pos.distanceTo(this.pos) : 99;
      if (pd < 9) G.shake = Math.max(G.shake || 0, V.shake * (any ? 1 : 0.6));
      if (!any) sfx.hit(this.pos);
    }
  }
  dispose() { G.scene.remove(this.root); }
  // 倒れる動きを見せてから消える
  dieAnim() {
    const ud = this.body.userData;
    if (ud.kind !== 'glb') { this.dispose(); return; }
    this.hpBar.visible = false; if (this.chantLabel) this.chantLabel.visible = false; if (this.sigil) this.sigil.visible = false;
    const dur = dieGlb(ud);
    G.dying ||= [];
    this.hitT = 0; this.rimU.strength.value = 0.2; // 倒れた後は縁取りを落ち着かせる
    G.dying.push({ e: this, t: Math.max(1.2, dur + 0.8) });
  }
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
