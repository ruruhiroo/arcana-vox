// Blender で彫った守護者(models/guardian-*.glb)を、戦いの仕組みへつなぐ。
// 骨はどれも同じ向きで書き出してあるので、骨をそのまま回せば動く(動きはここで付ける)。
// 当たり判定の楕円体・口の位置は、モデルに添えた覚え書き(userData.forge)から作る。
import * as THREE from 'three';
import { smooth, breathTurn, sweepTurn } from './dragon-rules.js';

const hitGeo = new THREE.SphereGeometry(1, 10, 8);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

export function bindForge(scene, species) {
  let info = null; const bones = {};
  scene.traverse(o => {
    if (o.userData?.forge && !info) { try { info = JSON.parse(o.userData.forge); } catch {} }
    if (o.isBone) bones[o.name] = o;
  });
  if (!info) return null;
  const root = new THREE.Group();
  root.add(scene);
  const hitParts = [];
  const hit = (parent, pos, scale) => { const m = new THREE.Mesh(hitGeo, hitMat); m.position.set(...pos); m.scale.set(...scale); m.visible = false; parent.add(m); hitParts.push(m); return m; };
  for (const h of info.hits || []) if (bones[h.bone]) hit(bones[h.bone], h.pos, h.scale);
  // 胴の中心(仕組みの側は、これの親を「体の根」として動かす)
  const tb = info.torso || [0, 3.5, 0, 1.4];
  const torso = hit(root, tb.slice(0, 3), [tb[3], tb[3], tb[3]]);
  let coreMat = null; const skins = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; skins.push(o);
    if (o.material?.name === 'guardian-coreMat') { coreMat = o.material = o.material.clone(); coreMat.name = 'guardian-coreMat'; o.userData.eye = true; }
    else if (o.material) { o.material = o.material.clone(); o.material.envMapIntensity = 0.25; if (o.material.metalnessMap) o.material.metalness = 0.6; }
  });
  // 核: 喉や胸で光る「沈黙の一片」。光の強さは材質を共有し、位置は骨に付けた目印から取る
  const cb = info.core || { bone: 'chest', pos: [0, 0, 0] };
  const core = new THREE.Mesh(hitGeo, coreMat || new THREE.MeshStandardMaterial({ emissive: 0xff5a18 }));
  core.visible = false; core.scale.setScalar(0.01); core.position.set(...cb.pos); (bones[cb.bone] || root).add(core);
  const pick = names => names.map(n => bones[n]).filter(Boolean);
  const ud = {
    asset: 'forge', kind: species === 'dragon' ? 'dragon' : 'guardian', species, bones, all: Object.values(bones), info,
    torso, core, hitParts, skins, materials: {},
    neck: bones.neck1 || bones.neck, head: bones.head, jaw: bones.jaw || bones.head, tail: bones.tail1 || bones.spine || torso,
    legs: pick(info.legs || []), wings: pick(info.wings || []), arms: pick(info.arms || []),
    mouthOffset: new THREE.Vector3(...(info.mouth || [0, 0, -1])),
    stage: 'idle', move: 'breath', progress: 0,
  };
  for (const b of ud.all) b.userData.rest = b.position.clone();
  root.userData = ud;
  animateForge(ud, 0, false);
  return root;
}

const S = Math.sin, C = Math.cos;
const rot = (b, x = 0, y = 0, z = 0) => { if (b) b.rotation.set(x, y, z); };

export function animateForge(ud, t, moving) {
  const B = ud.bones, root = ud.torso.parent;
  for (const b of ud.all) { b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); }
  root.rotation.set(0, 0, 0); root.position.set(0, 0, 0); root.visible = true;
  const st = { charge: ud.stage === 'windup', strike: ud.stage === 'strike', rest: ud.stage === 'recover', p: ud.progress || 0 };
  st.q = smooth(st.p);
  ud.core.material.emissiveIntensity = st.rest ? 3.2 : st.charge ? 1.8 + S(t * 12) * 0.6 : 1.0 + S(t * 2.2) * 0.25;
  (POSE[ud.species] || POSE.dragon)(ud, B, root, t, moving, st);
  extraMoves(ud, B, root, t, st);
  introPose(ud, B, root, t);
}

// 相手を見て挟む技の動き: 噛みつき(突進)と咆哮
function extraMoves(ud, B, root, t, { charge, strike, rest, p, q }) {
  if (ud.move !== 'lunge' && ud.move !== 'roar') return;
  const add = (b, x = 0, y = 0, z = 0) => { if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; } };
  const quad = !!B.thighF_L;
  if (ud.move === 'roar') {
    const k = charge ? q : strike ? 1 : rest ? 1 - q : 0, open = strike ? 1 : charge ? q * 0.35 : 0, shake = strike ? S(t * 46) * 0.02 : 0;
    if (quad) {
      for (const n of ['neck1', 'neck2', 'neck3']) add(B[n], 0.28 * k + shake, 0, 0);
      add(B.head, 0.22 * k, shake * 2, 0); add(B.jaw, -0.95 * open, 0, 0);
      root.rotation.x += 0.1 * k; root.position.y += 0.25 * k;
      for (const s of ['_L', '_R']) add(B['thighF' + s], -0.18 * k, 0, 0);
      if (B.wingA_L) wings(B, Math.max(0, 0.72 - 0.72 * k), strike ? S(t * 28) * 0.05 : 0);
    } else {
      add(B.spine, 0.3 * k, 0, 0); add(B.neck, 0.42 * k + shake, 0, 0); add(B.jaw, -0.65 * open, 0, 0);
      add(B.uarm_L, -0.45 * k, 0, -0.55 * k); add(B.uarm_R, -0.45 * k, 0, 0.55 * k); add(B.farm_L, 0.5 * k, 0, 0); add(B.farm_R, 0.5 * k, 0, 0);
    }
    return;
  }
  // 噛みつき: 身を沈めて引き、弾けるように前へ。終わりに顎を打ち合わせる
  const back = charge ? q : 0, go = strike ? Math.sin(Math.min(1, p / 0.8) * Math.PI) : 0, snap = strike ? smooth((p - 0.55) / 0.3) : 0;
  if (quad) {
    root.position.z += 1.1 * back - 0.5 * go; root.position.y -= 0.45 * back + 0.2 * go; root.rotation.x -= 0.08 * back;
    for (const n of ['neck1', 'neck2', 'neck3']) add(B[n], -0.34 * back - 0.3 * go, 0, 0);
    add(B.head, 0.3 * back + 0.25 * go, 0, 0);
    add(B.jaw, -0.35 * back - 0.95 * (strike ? 1 - snap : 0), 0, 0);
    for (const s of ['_L', '_R']) { add(B['thighF' + s], 0.5 * back - 0.7 * go, 0, 0); add(B['shinF' + s], -0.6 * back, 0, 0); add(B['thighB' + s], -0.3 * back + 0.6 * go, 0, 0); }
    if (B.wingA_L) wings(B, 0.72 + 0.25 * back - 0.3 * go, 0);
  } else {
    root.position.z += 0.7 * back - 0.4 * go; root.position.y -= 0.3 * back;
    add(B.spine, 0.3 * back - 0.6 * go, 0, 0); add(B.neck, 0.2 * go, 0, 0);
    add(B.uarm_R, 2.5 * back + 2.5 * (strike ? 1 - smooth(p / 0.45) : 0) - 0.4 * go, 0, 0); add(B.farm_R, 0.6 * back, 0, 0);
    add(B.thigh_L, 0.7 * go, 0, 0); add(B.shin_L, -0.5 * go, 0, 0); add(B.thigh_R, -0.4 * go, 0, 0);
  }
}

// 登場: intro=0 は眠り(封印が閉じる前)、0→0.45 で起き上がり、0.45→0.9 で吠え、1 で戦いの構えへ
function introPose(ud, B, root, t) {
  const i = ud.intro ?? 1;
  if (i >= 1) return;
  const down = 1 - smooth(i / 0.45);                                   // 伏せている度合い
  const roar = i < 0.45 ? 0 : Math.sin(Math.min(1, (i - 0.45) / 0.5) * Math.PI) ** 0.7;   // 吠えの山
  const add = (b, x = 0, y = 0, z = 0) => { if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; } };
  const breathe = S(t * 0.9) * 0.02 * down;
  ud.core.material.emissiveIntensity = 0.25 + (1 - down) * 0.8 + roar * 3.0;                // 核は眠りの間は暗く、吠えると燃え上がる
  if (ud.species === 'dragon' || ud.species === 'beast' || ud.species === 'griffin') {
    const L = ud.species === 'dragon' ? 1 : 0.95;
    root.position.y -= 1.75 * L * down;                                                     // 腹を床につけて丸くなる
    for (const s of ['_L', '_R']) {
      add(B['thighF' + s], 1.0 * down, 0, 0); add(B['shinF' + s], -1.5 * down, 0, 0); add(B['footF' + s], 0.6 * down, 0, 0);
      add(B['thighB' + s], -0.75 * down, 0, 0); add(B['shinB' + s], 1.25 * down, 0, 0); add(B['footB' + s], -0.5 * down, 0, 0);
    }
    for (const n of ['neck1', 'neck2', 'neck3']) add(B[n], -0.5 * down + 0.3 * roar + breathe, 0.34 * down, 0);
    add(B.head, -0.25 * down + 0.2 * roar, 0.3 * down, 0);
    add(B.jaw, -0.95 * roar - 0.02 * down, 0, 0);
    for (let k = 1; k <= 5; k++) add(B['tail' + k], 0, 0.42 * down, 0);                    // 尾を体に巻く
    if (B.wingA_L) wings(B, Math.max(0, 0.72 + 0.28 * down - 0.72 * roar), roar * (0.35 + S(t * 7) * 0.06));
    root.rotation.x += 0.12 * roar;
  } else {
    // 二足: 片膝をつき、頭を垂れて動かない像のように。立ち上がって、天を仰いで吠える
    root.position.y -= 0.34 * (ud.info?.torso?.[1] || 6) * down;
    add(B.spine, -0.5 * down + 0.25 * roar + breathe, 0, 0); add(B.neck, -0.45 * down + 0.4 * roar, 0, 0);
    add(B.thigh_L, 1.35 * down, 0, 0); add(B.shin_L, -1.5 * down, 0, 0);
    add(B.thigh_R, 0.2 * down, 0, 0); add(B.shin_R, -1.75 * down, 0, 0); add(B.foot_R, 0.9 * down, 0, 0);
    add(B.uarm_L, 0.5 * down + 0.6 * roar, 0, -0.5 * roar); add(B.uarm_R, 0.35 * down + 0.6 * roar, 0, 0.5 * roar);
    add(B.farm_R, 0.5 * down, 0, 0);
    add(B.jaw, -0.6 * roar, 0, 0);
  }
}

// 四つ足の歩き: 対角の脚を揃え、膝と足首を畳んで上げる
function quadWalk(B, t, moving, speed = 4, amp = 0.34) {
  const legs = [['thighF_L', 'shinF_L', 'footF_L', 0], ['thighF_R', 'shinF_R', 'footF_R', Math.PI], ['thighB_L', 'shinB_L', 'footB_L', Math.PI], ['thighB_R', 'shinB_R', 'footB_R', 0]];
  for (const [a, b, c, ph] of legs) {
    if (!moving) continue;
    const w = t * speed + ph, lift = Math.max(0, C(w));
    rot(B[a], S(w) * amp, 0, 0); rot(B[b], -lift * 0.55, 0, 0); rot(B[c], lift * 0.4, 0, 0);
  }
}
function tailWave(B, t, amp = 0.1, speed = 0.7, n = 5) {
  for (let i = 1; i <= n; i++) if (B['tail' + i]) B['tail' + i].rotation.y = S(t * speed - i * 0.55) * amp * (0.6 + i * 0.18);
}
// 翼: fold=0 で広げ、1 で畳む。flap は羽ばたきの上下
function wings(B, fold, flap = 0) {
  for (const [s, sx] of [['_L', -1], ['_R', 1]]) {
    rot(B['wingroot' + s], 0, 0, 0);
    rot(B['wingA' + s], 0, sx * -0.55 * fold, sx * (-0.5 * fold + flap));
    rot(B['wingB' + s], 0, sx * 1.25 * fold, sx * (0.25 * fold + flap * 0.6));
    for (const [f, k] of [['wf1', 0.5], ['wf2', 0.25], ['wf3', 0.05]]) rot(B[f + s], 0, sx * -1.0 * fold * k * 1.6, 0);
  }
}
function neckCurl(B, x, y, share = [0.42, 0.33, 0.25]) {
  ['neck1', 'neck2', 'neck3'].forEach((n, i) => { if (B[n]) { B[n].rotation.x += x * share[i]; B[n].rotation.y += y * share[i]; } });
}

const POSE = {
  dragon(ud, B, root, t, moving, { charge, strike, rest, p, q }) {
    root.position.y = moving ? Math.abs(S(t * 4)) * 0.25 : S(t * 1.1) * 0.06;
    quadWalk(B, t, moving);
    tailWave(B, t);
    neckCurl(B, S(t * 1.1) * 0.05, S(t * 0.6) * 0.06);
    rot(B.head, S(t * 0.9 + 1) * 0.04, 0, 0);
    rot(B.jaw, -0.06 - Math.max(0, S(t * 0.8)) * 0.05, 0, 0);
    if (B.chest) B.chest.rotation.x = S(t * 1.1) * 0.012;
    let fold = 0.72, flap = S(t * 1.7) * 0.03;
    if (rest) { neckCurl(B, -0.55 * (1 - q), 0); B.jaw.rotation.x = -0.35 * (1 - q); fold = 0.72 - 0.25 * (1 - q); }   // 技の後: 首を垂れて喘ぐ
    if (ud.move === 'breath') {
      if (charge) { neckCurl(B, 0.5 * q, -0.55 * q); B.jaw.rotation.x = -0.75 * q; B.head.rotation.x = 0.15 * q; fold = 0.72 - 0.5 * q; root.position.y += 0.2 * q; }
      if (strike) { neckCurl(B, 0.5 - 1.05 * smooth(p / 0.12), breathTurn(p)); B.head.rotation.x = -0.12; B.jaw.rotation.x = -0.8; fold = 0.2; flap = S(t * 9) * 0.03; }
      if (rest) neckCurl(B, 0, 0.55 * (1 - q));
    } else if (ud.move === 'sweep') {
      if (charge) { root.rotation.y = -0.9 * q; neckCurl(B, 0, 0.6 * q); fold = 0.72 + 0.2 * q; for (let i = 1; i <= 5; i++) B['tail' + i].rotation.y = 0.16 * q * i * 0.5; }
      if (strike) { root.rotation.y = sweepTurn(p); neckCurl(B, 0, 0.6 * (1 - q)); fold = 0.92; for (let i = 1; i <= 5; i++) B['tail' + i].rotation.y = -0.12 * S(p * Math.PI) * i * 0.5; quadWalk(B, p * 3.2, true, 4, 0.3); }
      if (rest) { root.rotation.y = -0.9 * (1 - q); }
    } else if (ud.move === 'slam') {
      const lift = charge ? q : strike ? 1 - smooth(p / 0.48) : 0;
      root.position.y += lift * 1.5; root.rotation.x = lift * 0.3;
      neckCurl(B, lift * 0.35 - (strike ? 0.4 * (1 - lift) : 0), 0);
      for (const s of ['_L', '_R']) { rot(B['thighF' + s], lift * 1.15, 0, 0); rot(B['shinF' + s], -lift * 0.7, 0, 0); rot(B['footF' + s], lift * 0.5, 0, 0); rot(B['thighB' + s], -lift * 0.3, 0, 0); }
      B.jaw.rotation.x = -lift * 0.55; fold = 0.72 - 0.6 * lift; flap = lift * 0.25;
    } else if (ud.move === 'meteor') {
      const lift = charge ? q : strike ? 1 - q : 0;
      neckCurl(B, 0.85 * lift, 0); B.head.rotation.x = 0.35 * lift; B.jaw.rotation.x = -0.8 * lift;
      fold = 0.72 - 0.72 * lift; flap = lift * (0.3 + S(t * 6) * 0.08);
    }
    wings(B, fold, flap);
    travel(ud, B, root, (h, pose) => { root.position.y = h; wings(B, 0.1, pose.wing * 0.55); quadFold(B, pose.fold); });
  },

  // 二足(氷冠巨人・聖堂騎像): 腕は前へ上げるのが +x、脚は膝を後ろへ畳むのが -x
  giant(ud, B, root, t, moving, st) { biped(ud, B, root, t, moving, st, { stoop: 0.16, stride: 0.42, pace: 3.0, heavy: 1 }); },
  sentinel(ud, B, root, t, moving, st) { biped(ud, B, root, t, moving, st, { stoop: 0.0, stride: 0.3, pace: 3.4, heavy: 0.5, shield: true }); },

  // 雷角獣: 角を低く構えて突っ込む四つ足
  beast(ud, B, root, t, moving, { charge, strike, rest, p, q }) {
    root.position.y = moving ? Math.abs(S(t * 5)) * 0.22 : S(t * 1.4) * 0.05;
    quadWalk(B, t, moving, 5, 0.4);
    tailWave(B, t, 0.16, 1.3);
    neck2(B, -0.1 + S(t * 1.2) * 0.04, S(t * 0.7) * 0.08);
    rot(B.jaw, -0.05 - Math.max(0, S(t * 1.4)) * 0.06, 0, 0);
    if (rest) { neck2(B, -0.5 * (1 - q), 0); B.jaw.rotation.x = -0.4 * (1 - q); root.position.y -= 0.35 * (1 - q); }
    if (ud.move === 'breath') {          // 雷霆の奔流: 角を下げて前足で地を掻き、雷を吐く
      if (charge) { neck2(B, -0.5 * q, -0.55 * q); rot(B.thighF_L, 0.35 * q * Math.abs(S(t * 7)), 0, 0); B.jaw.rotation.x = -0.6 * q; root.position.y -= 0.3 * q; }
      if (strike) { neck2(B, -0.2, breathTurn(p)); B.jaw.rotation.x = -0.75; root.position.y -= 0.3; }
      if (rest) neck2(B, 0, 0.55 * (1 - q));
    } else if (ud.move === 'sweep') {    // 雷角旋回: 頭を振り回して角で薙ぐ
      if (charge) { root.rotation.y = -0.9 * q; neck2(B, -0.25 * q, 0.7 * q); }
      if (strike) { root.rotation.y = sweepTurn(p); neck2(B, -0.25, 0.7 - 1.4 * S(p * Math.PI)); quadWalk(B, p * 3.4, true, 4, 0.34); }
      if (rest) root.rotation.y = -0.9 * (1 - q);
    } else if (ud.move === 'slam') {     // 後ろ足で立ち、前足を叩きつける
      const lift = charge ? q : strike ? 1 - smooth(p / 0.48) : 0;
      root.position.y += lift * 1.3; root.rotation.x = lift * 0.55;
      neck2(B, -lift * 0.4, 0);
      for (const s of ['_L', '_R']) { rot(B['thighF' + s], lift * 1.2, 0, 0); rot(B['shinF' + s], -lift * 0.8, 0, 0); rot(B['thighB' + s], -lift * 0.45, 0, 0); }
    } else if (ud.move === 'meteor') {   // 天雷の鉄槌: 天へ吠える
      const lift = charge ? q : strike ? 1 - q : 0;
      neck2(B, 0.95 * lift, 0); B.jaw.rotation.x = -0.8 * lift;
      for (let i = 1; i <= 5; i++) if (B['tail' + i]) B['tail' + i].rotation.x = 0.22 * lift;
    }
    travel(ud, B, root, (h, pose) => { root.position.y = h; quadFold(B, pose.fold); });
  },

  // 嵐翼グリフォン: 羽ばたきで風を起こす
  griffin(ud, B, root, t, moving, { charge, strike, rest, p, q }) {
    root.position.y = moving ? Math.abs(S(t * 4.5)) * 0.2 : S(t * 1.3) * 0.06;
    quadWalk(B, t, moving, 4.5, 0.36);
    tailWave(B, t, 0.14, 1.0);
    neck2(B, S(t * 1.3) * 0.05, S(t * 0.8) * 0.12);
    rot(B.jaw, -0.04, 0, 0);
    let fold = 0.78, flap = S(t * 2.5) * 0.04;
    if (rest) { neck2(B, -0.5 * (1 - q), 0); fold = 0.78 - 0.2 * (1 - q); root.position.y -= 0.3 * (1 - q); }
    if (ud.move === 'breath') {          // 断空の嵐: 翼を大きく引いて、前へ打ち下ろす
      if (charge) { fold = 0.78 - 0.78 * q; flap = 0.55 * q; neck2(B, 0.3 * q, -0.55 * q); B.jaw.rotation.x = -0.5 * q; }
      if (strike) { fold = 0; flap = 0.55 - 1.1 * Math.abs(S(p * Math.PI * 4)); neck2(B, 0.1, breathTurn(p)); B.jaw.rotation.x = -0.6; }
      if (rest) neck2(B, 0, 0.55 * (1 - q));
    } else if (ud.move === 'sweep') {    // 旋風の翼撃: 片翼を広げて回る
      if (charge) { root.rotation.y = -0.9 * q; fold = 0.78 - 0.6 * q; root.rotation.z = 0.12 * q; }
      if (strike) { root.rotation.y = sweepTurn(p); fold = 0.05; root.rotation.z = 0.12; flap = -0.1; quadWalk(B, p * 3.2, true, 4, 0.3); }
      if (rest) root.rotation.y = -0.9 * (1 - q);
    } else if (ud.move === 'slam') {     // 舞い上がって前足の鉤爪で叩く
      const lift = charge ? q : strike ? 1 - smooth(p / 0.48) : 0;
      root.position.y += lift * 2.4; root.rotation.x = lift * 0.45;
      fold = 0.78 - 0.78 * lift; flap = lift * S(t * 9) * 0.45;
      for (const s of ['_L', '_R']) { rot(B['thighF' + s], lift * 1.1, 0, 0); rot(B['shinF' + s], -lift * 0.5, 0, 0); rot(B['footF' + s], lift * 0.7, 0, 0); }
    } else if (ud.move === 'meteor') {   // 墜嵐: 翼を天へ掲げて嵐を呼ぶ
      const lift = charge ? q : strike ? 1 - q : 0;
      neck2(B, 0.8 * lift, 0); B.jaw.rotation.x = -0.7 * lift; fold = 0.78 - 0.78 * lift; flap = lift * 0.5;
    }
    wings(B, fold, flap);
    travel(ud, B, root, (h, pose) => { root.position.y = h; wings(B, 0.05, pose.wing * 0.6); quadFold(B, pose.fold); });
  },
};
function neck2(B, x, y) {
  for (const [n, k] of [['neck1', 0.5], ['neck2', 0.5]]) if (B[n]) { B[n].rotation.x += x * k; B[n].rotation.y += y * k; }
}
function biped(ud, B, root, t, moving, { charge, strike, rest, p, q }, o) {
  const w = t * o.pace;
  root.position.y = moving ? Math.abs(S(w)) * 0.12 * (1 + o.heavy) : 0;
  rot(B.spine, -o.stoop + S(t * 1.0) * 0.015, 0, 0);
  rot(B.chest, S(t * 1.0) * 0.02, 0, 0);
  rot(B.neck, o.stoop * 0.6, S(t * 0.5) * 0.08, 0);
  rot(B.jaw, -0.03, 0, 0);
  // 腕: 自然に垂らし、少し開く。盾を持つ像は左の前腕を前へ構える
  rot(B.uarm_L, moving ? -S(w) * 0.2 : 0, 0, -0.14); rot(B.uarm_R, moving ? S(w) * 0.2 : 0, 0, 0.14);
  rot(B.farm_L, o.shield ? 1.25 : 0.3, 0, 0); rot(B.farm_R, 0.35, 0, 0);
  if (o.shield) { B.uarm_L.rotation.x += 0.35; B.uarm_L.rotation.y = 0.5; }
  if (moving) for (const [s, ph] of [['_L', 0], ['_R', Math.PI]]) {
    const a = w + ph;
    rot(B['thigh' + s], S(a) * o.stride, 0, 0); rot(B['shin' + s], -Math.max(0, C(a)) * 0.7, 0, 0); rot(B['foot' + s], Math.max(0, C(a)) * 0.25, 0, 0);
  }
  if (rest) {   // 技の後: 膝に手をついて息をつく
    const k = 1 - q;
    B.spine.rotation.x -= 0.4 * k; B.neck.rotation.x -= 0.25 * k; root.position.y -= 0.5 * k;
    for (const s of ['_L', '_R']) { rot(B['thigh' + s], 0.5 * k, 0, 0); rot(B['shin' + s], -0.9 * k, 0, 0); rot(B['foot' + s], 0.4 * k, 0, 0); }
    B.uarm_R.rotation.x += 0.3 * k; B.jaw.rotation.x = -0.25 * k;
  }
  if (ud.move === 'breath') {            // 口から霧 / 胸から光芒
    if (charge) { B.spine.rotation.x += 0.3 * q; B.neck.rotation.x += 0.25 * q; B.neck.rotation.y = -0.4 * q; B.jaw.rotation.x = -0.5 * q; B.uarm_L.rotation.x -= 0.5 * q; B.uarm_R.rotation.x -= 0.5 * q; B.uarm_L.rotation.z -= 0.3 * q; B.uarm_R.rotation.z += 0.3 * q; }
    if (strike) { B.spine.rotation.x -= 0.3; B.spine.rotation.y = breathTurn(p) * 0.45; B.neck.rotation.y = breathTurn(p) * 0.55; B.jaw.rotation.x = -0.6; B.uarm_L.rotation.x -= 0.3; B.uarm_R.rotation.x -= 0.3; }
    if (rest) B.neck.rotation.y = 0.5 * (1 - q);
  } else if (ud.move === 'sweep') {      // 得物を水平に構えて一回転
    const out = charge ? q : strike ? 1 : rest ? 1 - q : 0;
    if (charge) root.rotation.y = -0.9 * q;
    if (strike) root.rotation.y = sweepTurn(p);
    if (rest) root.rotation.y = -0.9 * (1 - q);
    rot(B.uarm_R, 1.35 * out, 0, 0.55 * out + 0.14); rot(B.farm_R, 0.15, 0, 0);
    B.chest.rotation.y = (charge ? -0.5 * q : strike ? -0.5 + 1.0 * q : 0);
    if (strike) for (const [s, ph] of [['_L', 0], ['_R', Math.PI]]) { rot(B['thigh' + s], S(p * 14 + ph) * 0.3, 0, 0); rot(B['shin' + s], -Math.max(0, C(p * 14 + ph)) * 0.4, 0, 0); }
  } else if (ud.move === 'slam') {       // 両腕で振りかぶって叩きつける
    const lift = charge ? q : strike ? 1 - smooth(p / 0.48) : 0, down = strike ? smooth(p / 0.48) : 0;
    for (const s of ['_L', '_R']) { rot(B['uarm' + s], 2.7 * lift + 0.9 * down * (1 - lift), 0, s === '_L' ? -0.1 : 0.1); rot(B['farm' + s], 0.5 * lift + 0.2, 0, 0); }
    B.spine.rotation.x += 0.3 * lift - 0.55 * down * (strike ? 1 : 0); B.neck.rotation.x += 0.2 * lift;
    root.position.y += lift * 0.3 - down * 0.35 * (strike ? 1 : 0);
    if (strike) for (const s of ['_L', '_R']) { rot(B['thigh' + s], 0.45 * down, 0, 0); rot(B['shin' + s], -0.75 * down, 0, 0); }
  } else if (ud.move === 'meteor') {     // 両腕を天へ広げて呼ぶ
    const lift = charge ? q : strike ? 1 - q : 0;
    rot(B.uarm_L, 2.3 * lift, 0, -0.14 - 0.75 * lift); rot(B.uarm_R, 2.3 * lift, 0, 0.14 + 0.75 * lift);
    B.spine.rotation.x += 0.2 * lift; B.neck.rotation.x += 0.45 * lift; B.jaw.rotation.x = -0.5 * lift;
  }
  const tp = ud.travelProgress;
  if (tp !== undefined && tp >= 0 && ud.stage === 'idle') {   // 技の合間は、重い足取りで位置を変える
    const a = tp * Math.PI * 4;
    root.position.y = Math.abs(S(a)) * 0.3 * (1 + o.heavy); root.rotation.z = S(a) * 0.05;
    for (const [s, ph] of [['_L', 0], ['_R', Math.PI]]) { rot(B['thigh' + s], S(a + ph) * 0.5, 0, 0); rot(B['shin' + s], -Math.max(0, C(a + ph)) * 0.8, 0, 0); }
    B.uarm_L.rotation.x -= S(a) * 0.3; B.uarm_R.rotation.x += S(a) * 0.3;
  }
}
function quadFold(B, f) {
  for (const s of ['_L', '_R']) { rot(B['thighF' + s], f, 0, 0); rot(B['shinF' + s], -f * 0.8, 0, 0); rot(B['thighB' + s], -f * 0.65, 0, 0); rot(B['shinB' + s], f * 0.5, 0, 0); }
}
// 技の合間の移動(跳ぶ・飛ぶ)
const TRAVEL = {
  dragon: p => ({ height: S(Math.PI * p) * 2.6, pitch: S(p * Math.PI * 2) * 0.12, roll: 0, wing: S(p * Math.PI * 4) * 0.55, fold: S(Math.PI * p) * 0.7 }),
  griffin: p => ({ height: S(Math.PI * p) * 3.2, pitch: S(p * Math.PI * 2) * 0.18, roll: S(p * Math.PI * 2) * 0.15, wing: S(p * Math.PI * 6) * 0.65, fold: S(Math.PI * p) * 1.1 }),
  beast: p => ({ height: S(Math.PI * p) * 1.8, pitch: S(p * Math.PI * 2) * 0.23, roll: 0, wing: 0, fold: S(p * Math.PI * 2) * 0.9 }),
};
function travel(ud, B, root, apply) {
  const p = ud.travelProgress;
  if (p === undefined || p < 0 || ud.stage !== 'idle' || !TRAVEL[ud.species]) return;
  const pose = TRAVEL[ud.species](p);
  root.rotation.x = pose.pitch; root.rotation.z = pose.roll;
  apply(pose.height, pose);
}
