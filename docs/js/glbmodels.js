// Blender で作った魔物のモデル(骨入り・動き付き)を読み込んで使う
// 作り方: tools/blender/build_models.py
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const GLB_TYPES = ['skeleton', 'ghoul', 'knight', 'ogre', 'imp', 'scribe', 'lich', 'golem', 'spider', 'bat', 'wraith', 'slime', 'guardian-reaper', 'guardian-dragon', 'guardian-giant', 'guardian-beast', 'guardian-griffin', 'guardian-sentinel', 'mage', 'fp-hand', 'fp-grimoire', ...['ether', 'scroll', 'crystal', 'bone', 'iron', 'flash', 'lantern', 'shard'].map(n => 'item-' + n), 'decor-campfire',
  ...['wallshelf', 'shelf', 'readtable', 'longtable', 'desk', 'lectern', 'pew', 'barrel', 'crate', 'cratestack', 'coffin', 'sarcophagus', 'pillar', 'statue', 'bookpile', 'throne', 'anvil', 'obelisk'].map(n => 'decor-' + n)];
const cache = {};
let loading = null;

export function preloadModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all(GLB_TYPES.map(t => new Promise(res => loader.load(`models/${t}.glb`, g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = t.startsWith('decor-'); // 骨で動くものは、元の境界では切り抜かない(動かない置物は切り抜く)
      const m = o.material;
      if (!m) return;
      if (m.name === 'eye') { m.emissiveIntensity = 1.6; o.userData.eye = true; } // 目は光らせるが、滲みすぎないように
      if (m.name === 'membrane') m.side = THREE.DoubleSide;
      if (m.name === 'slime') { m.transparent = true; m.opacity = 0.82; m.depthWrite = false; } // 粘獣は半透明
      m.envMapIntensity = 0;
      if (m.metalnessMap) m.metalness = 0.55; // 焼き込んだ金属は、環境の映り込みが無い迷宮でも暗く沈まないように抑える
      if (m.normalMap) m.normalScale.set(1.2, 1.2);
    });
    cache[t] = g; res();
  }, undefined, e => { console.warn('model', t, e); res(); }))));
  return loading;
}
export const hasModel = t => !!cache[t];

export function makeModel(type) {
  const g = cache[type];
  if (!g) return null;
  const obj = SkeletonUtils.clone(g.scene);
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
  for (const n of ['attack', 'die']) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
  const ud = { kind: 'glb', type, mixer, actions, cur: null, atkT: 0, dead: false };
  obj.userData = ud;
  play(ud, 'idle', 0);
  mixer.update(Math.random() * 2); // 動きの位相をずらす
  return obj;
}

function play(ud, name, fade = 0.2) {
  const a = ud.actions[name];
  if (!a || ud.cur === a) return a;
  a.reset().setEffectiveWeight(1).play();
  if (ud.cur && fade) a.crossFadeFrom(ud.cur, fade, false);
  else if (ud.cur) ud.cur.stop();
  ud.cur = a;
  return a;
}

// 毎フレーム: 歩く / 立つ / 攻撃の振り を切り替える
export function animateGlb(ud, dt, moving, speed, attackStart) {
  if (ud.dead) { ud.mixer.update(dt); return; }
  if (attackStart && ud.actions.attack) {
    const a = ud.actions.attack;
    a.reset().setEffectiveWeight(1).play();
    if (ud.cur && ud.cur !== a) a.crossFadeFrom(ud.cur, 0.08, false);
    ud.cur = a; ud.atkT = a.getClip().duration * 0.95;
  }
  if (ud.atkT > 0) ud.atkT -= dt;
  else {
    play(ud, moving ? 'walk' : 'idle');
    if (ud.actions.walk) ud.actions.walk.timeScale = moving ? speed : 1;
  }
  ud.mixer.update(dt);
}

// 名前を指定して動きを切り替える(魔導師など、歩く/立つ/攻撃 以外の動きを持つもの)
export function playGlb(ud, name, dt, fade = 0.2) {
  const a = ud.actions[name];
  if (a && ud.cur !== a) { a.reset().setEffectiveWeight(1).play(); if (ud.cur) a.crossFadeFrom(ud.cur, fade, false); ud.cur = a; }
  ud.mixer.update(dt);
}

export function dieGlb(ud) {
  ud.dead = true;
  const a = ud.actions.die;
  if (!a) return 0;
  a.reset().play();
  if (ud.cur && ud.cur !== a) a.crossFadeFrom(ud.cur, 0.12, false);
  ud.cur = a;
  return a.getClip().duration;
}
