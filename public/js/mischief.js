// 仲間とわいわい騒げる仕掛け
//   怪し茸: 食べると何かが起きる(声が変わる・小さく/大きくなる・操作があべこべ・千鳥足)。ときどき胞子が弾けて周りも巻き込む
//   笑気の罠: 床の仕掛けを踏むと紫の煙が噴き出し、近くの全員の声がおかしくなる
// 声の変化はボイスチャットの相手に聞こえる(受け取る側で掛ける)
import * as THREE from 'three';
import { G } from './state.js';
import { VOICE_NAMES } from './voicefx.js';
import { glowSprite } from './textures.js';

let H = null;
let traps = [];
const clouds = [];
export function initMischief(hooks) { H = hooks; }

export const EFFECTS = {
  high: { name: '高い声', dur: 45, voice: 'high', msg: '声が甲高くなった!' },
  low: { name: '低い声', dur: 45, voice: 'low', msg: '声が地の底のように低くなった!' },
  robot: { name: 'ロボ声', dur: 40, voice: 'robot', msg: '声がからくり人形のようになった!' },
  echo: { name: 'こだま声', dur: 40, voice: 'echo', msg: '声が洞窟のようにこだまする!' },
  tiny: { name: '小人', dur: 30, voice: 'high', msg: '体が縮んだ!(足は速いが、声も高い)' },
  giant: { name: '巨人', dur: 25, voice: 'low', msg: '体が膨れ上がった!(足は遅いが、声も低い)' },
  invert: { name: 'あべこべ', dur: 12, msg: '前後左右があべこべになった!' },
  drunk: { name: '千鳥足', dur: 18, msg: '目が回る…まっすぐ歩けない!' },
};
const SHROOM_TABLE = [['high', 3], ['low', 3], ['robot', 2], ['echo', 1.5], ['tiny', 2], ['giant', 1.5], ['invert', 1.2], ['drunk', 1.5]];
const VOICE_ONLY = ['high', 'low', 'robot', 'echo'];
function pickW(table) { let v = Math.random() * table.reduce((a, e) => a + e[1], 0); for (const [k, w] of table) if ((v -= w) <= 0) return k; return table[0][0]; }

// その魔導師に効果を掛ける(自分なら操作にも効く。仲間には知らせる)
export function applyTo(mage, kind, local = true, durOverride = 0) {
  const ef0 = EFFECTS[kind]; if (!ef0 || !mage) return;
  const ef = durOverride ? { ...ef0, dur: durOverride } : ef0;
  // 大きさは片方だけ
  if (kind === 'tiny') delete mage.status.giant; if (kind === 'giant') delete mage.status.tiny;
  mage.status[kind] = { t: ef.dur };
  if (ef.voice) mage.status.vfx = { t: ef.dur, mode: ef.voice };
  const voiceOnly = !!ef.voice && !['tiny', 'giant'].includes(kind);
  if (mage === G.player) {
    if (!voiceOnly) H.ui.banner(ef.name, ef.msg, 3);
  } else if (mage.netId != null && ef.voice) G.net?.setVoiceFx?.(mage.netId, ef.voice);
  if (!(voiceOnly && mage === G.player)) G.fx?.burst(mage.pos.clone().setY(1.2), 0xc070ff, 30, { speed: 2, up: 1.5 });
  if (local) G.net?.send({ t: 'msc', id: mage.id, kind, dur: durOverride || 0 });
}
// 仲間から届いた知らせ
export function mischiefNet(m) {
  const mage = m.id === G.player?.id ? G.player : G.mages.find(x => x.id === m.id);
  if (m.trap != null) { const t = traps[m.trap]; if (t) fireTrapFx(t); }
  if (mage && m.kind) applyTo(mage, m.kind, false, m.dur || 0);
}

// 魔物の技: 当たると声がおかしくなる(避けようがない)。使うのは二種だけ
//   吸血大蝙蝠: 超音波で声が甲高く / 屍術師: 死者の声で低く
export const FOE_CURSE = {
  bat: { kind: 'high', p: 0.35, name: '超音波' },
  lich: { kind: 'low', p: 0.4, name: '死者の声' },
};
export function foeHit(foe, p) {
  const c = FOE_CURSE[foe?.type]; if (!c || (p.shield || 0) > 0 || (p._curseT || 0) > (G.time || 0)) return;
  if (Math.random() > c.p) return;
  p._curseT = (G.time || 0) + 6; // 立て続けには掛からない
  const kind = c.kind || VOICE_ONLY[Math.floor(Math.random() * VOICE_ONLY.length)];
  if (p !== G.player) H.ui.floatText?.(p.pos.clone().setY(p.pos.y + 1.6), `${c.name}!`, '#e0a0ff');
  applyTo(p, kind, true, 20);
}

// 怪し茸を食べた
export function eatOddShroom(p) {
  const kind = pickW(SHROOM_TABLE);
  H.ui.log('怪し茸を食べた…', '#d0a0ff');
  applyTo(p, kind);
  // ときどき胞子が弾けて、近くの仲間も巻き込む
  if (Math.random() < 0.3) {
    const near = G.mages.filter(m => m !== p && m.alive && m.pos.distanceTo(p.pos) < 6);
    puff(p.pos.clone(), 0xb070ff);
    if (near.length) { H.ui.log('胞子が弾けた! 近くの仲間も巻き込まれた', '#d0a0ff'); for (const m of near) applyTo(m, pickW(SHROOM_TABLE)); }
  }
}

// ---- 笑気の罠 ----
export function buildTraps(d, scene) {
  clearTraps(scene);
  for (const pos of d.gasTraps || []) {
    // 少しだけ浮いた、ひびの入った敷石(よく見れば分かる)
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 1 }));
    m.position.copy(pos).add(new THREE.Vector3(0, 0.03, 0)); m.receiveShadow = true;
    const holes = new THREE.Group();
    for (let i = 0; i < 5; i++) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); h.rotation.x = -Math.PI / 2; h.position.set((Math.random() - 0.5) * 0.7, 0.065, (Math.random() - 0.5) * 0.7); holes.add(h); }
    m.add(holes);
    scene.add(m);
    traps.push({ pos: pos.clone(), mesh: m, cd: 0 });
  }
}
export function clearTraps(scene) { for (const t of traps) scene.remove(t.mesh); traps = []; for (const c of clouds) scene.remove(c.s); clouds.length = 0; }

function puff(pos, color) {
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, transparent: true, opacity: 0.5, depthWrite: false }));
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2));
    s.scale.setScalar(1.5 + Math.random()); G.scene.add(s);
    clouds.push({ s, t: 0, life: 3 + Math.random() * 1.5, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8) });
  }
  H.sfx.fizzle?.(pos);
}
function fireTrapFx(t) { t.cd = 25; t.mesh.position.y = t.pos.y - 0.02; puff(t.pos, 0xc080ff); }

// ---- 毎フレーム ----
export function updateMischief(dt) {
  const p = G.player; if (!p) return;
  // 罠: 自分が踏んだら、近くの全員に効く(仲間には知らせる)
  traps.forEach((t, i) => {
    if (t.cd > 0) { t.cd -= dt; if (t.cd <= 0) t.mesh.position.y = t.pos.y + 0.03; return; }
    if (!p.alive || Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) > 0.75 || Math.abs(p.pos.y - t.pos.y) > 0.5) return;
    fireTrapFx(t);
    G.net?.send({ t: 'msc', trap: i });
    H.ui.banner('笑気の罠!', '紫の煙が噴き出した — 吸い込んだ者の声がおかしくなる', 3);
    for (const m of G.mages) if (m.alive && m.pos.distanceTo(t.pos) < 5.5) applyTo(m, VOICE_ONLY[Math.floor(Math.random() * VOICE_ONLY.length)]);
  });
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i]; c.t += dt; c.s.position.addScaledVector(c.v, dt); c.s.scale.multiplyScalar(1 + dt * 0.25);
    c.s.material.opacity = 0.5 * Math.max(0, 1 - c.t / c.life);
    if (c.t >= c.life) { G.scene.remove(c.s); c.s.material.dispose(); clouds.splice(i, 1); }
  }
  // 体の大きさ・声の戻り
  for (const m of G.mages) {
    const st = m.status;
    const target = st.tiny ? 0.5 : st.giant ? 1.6 : 1;
    if (m.root) { const s = m.root.scale.x + (target - m.root.scale.x) * Math.min(1, dt * 6); m.root.scale.setScalar(s); }
    const mode = st.vfx?.mode || null;
    if (m.kind === 'remote' && m._vfx !== mode) { m._vfx = mode; if (m.netId != null) G.net?.setVoiceFx?.(m.netId, mode); }
    if (m === p && p._vfx !== mode) { if (p._vfx && !mode) H.ui.log('声が元に戻った', '#cfe8ff'); p._vfx = mode; }
  }
}
// 目の高さの倍率 (小人・巨人)
export const eyeScale = p => p.root?.scale.x || 1;
// 状態の札 (残り秒数つき)
export function badges(p) {
  const out = [];
  for (const k of ['tiny', 'giant', 'invert', 'drunk']) if (p.status[k]) out.push(`${EFFECTS[k].name} ${Math.ceil(p.status[k].t)}秒`);
  if (p !== G.player && p.status.vfx && !p.status.tiny && !p.status.giant) out.push(`${VOICE_NAMES[p.status.vfx.mode]} ${Math.ceil(p.status.vfx.t)}秒`);
  return out;
}
