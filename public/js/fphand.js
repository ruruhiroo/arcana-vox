// 一人称の手(骨入りの模型 models/fp-hand.glb)。指の骨を回して、持つ物に合わせた形を作る。
// 模型の向き: 指は +Y、掌の面は +Z、親指は +X 側(右手)。原点は手首。左手は左右を反転して使う。
import * as THREE from 'three';
import { makeModel } from './glbmodels.js';

const FING = ['i', 'm', 'r', 'p'];
const Z = new THREE.Vector3(0, 0, 1);
const q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function makeFpHand({ mirror = false } = {}) {
  const m = makeModel('fp-hand');
  if (!m) return null;
  const bones = {};
  m.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 11; o.castShadow = false; o.material = o.material.clone(); o.material.envMapIntensity = 0; if (o.material.normalMap) o.material.normalScale.set(0.7, 0.7); o.material.color.setScalar(0.8); } // 灯りで白く飛ばないよう、少し落とす
  });
  if (!bones.i1 || !bones.t1) return null;
  const root = new THREE.Group(); root.name = 'fp_hand'; root.add(m);
  if (mirror) m.scale.x = -1;
  // 指ごとの曲げ軸と節の長さ(骨の並びから求める)
  const ax = {}, len = {};
  for (const f of FING) {
    const d = bones[f + '2'].position.clone().normalize();
    ax[f] = new THREE.Vector3(d.y, -d.x, 0).normalize();
    len[f] = [bones[f + '2'].position.length(), bones[f + '3'].position.length(), bones[f + '3'].position.length() * 0.85];
  }
  const t = bones.t2.position.clone().normalize();
  const side = new THREE.Vector3(0.74, -0.62, -0.25).normalize();
  const tFlex = side.clone().cross(t).normalize();      // 親指の関節を曲げる軸
  const tAbd = t.clone().cross(Z).normalize();           // 親指を掌の前へ起こす軸
  const hand = {
    root, bones, len, userData: {},
    // curl: 指ごとの [付け根, 第二関節, 第一関節] / spread: 指の開き / thumb: {abd, add, roll, f2, f3} / arm: 前腕の向き [x, y, z]
    pose({ curl, spread = 0, thumb = {}, arm = null } = {}) {
      FING.forEach((f, k) => {
        const c = Array.isArray(curl?.[0]) ? curl[k] : (curl || [0, 0, 0]);
        const sp = Array.isArray(spread) ? spread[k] : spread * (k - 1.2) * -1;
        bones[f + '1'].quaternion.setFromAxisAngle(Z, sp).multiply(q.setFromAxisAngle(ax[f], c[0]));
        bones[f + '2'].quaternion.setFromAxisAngle(ax[f], c[1]);
        bones[f + '3'].quaternion.setFromAxisAngle(ax[f], c[2]);
      });
      const { abd = 0, add = 0, roll = 0, f2 = 0, f3 = 0 } = thumb;
      bones.t1.quaternion.setFromAxisAngle(Z, add).multiply(q.setFromAxisAngle(tAbd, abd)).multiply(q2.setFromAxisAngle(t, roll));
      bones.t2.quaternion.setFromAxisAngle(tFlex, f2);
      bones.t3.quaternion.setFromAxisAngle(tFlex, f3);
      if (arm) bones.arm.rotation.set(arm[0], arm[1], arm[2]);
      return hand;
    },
  };
  return hand;
}

// 太さ R(半径)の棒を握る形。指の節が棒に沿って巻き付く角度を求める
export function gripPose(hand, R, { tight = 1 } = {}) {
  const rho = Math.max(0.012, R) + 0.0105;
  const curl = FING.map(f => {
    const [a, b, c] = hand.len[f];
    const h = x => Math.atan(x / 2 / rho);
    return [clamp((Math.atan(0.02 / rho) + h(a)) * tight, 0, 1.55), clamp((h(a) + h(b)) * tight, 0, 1.75), clamp((h(b) + h(c)) * 0.85 * tight, 0, 1.25)];
  });
  const k = clamp((0.05 - R) / 0.04, 0, 1);            // 細い物ほど、親指は深く回り込む
  return { curl, spread: 0.02, thumb: { abd: 0.7 + 0.1 * k, add: -0.5 + 0.45 * k, roll: -1.2, f2: 0.2 + 0.35 * k, f3: 0.3 + 0.3 * k } };
}

// 縦に持った物(中心が原点、太さ rx × rz)を、右から握る手。親指が上、指は奥を回り込む
const GRIP_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));
export let GRIP_YAW = 0.7;
export function makeGripHand(rx = 0.035, rz = 0.03) {
  const h = makeFpHand(); if (!h) return null;
  h.pose({ ...gripPose(h, (rx + rz) / 2), arm: [0, 0, -0.5] });
  // 手は右手前から回り込む(前腕が画面の右下へ抜ける)
  const yaw = q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), GRIP_YAW);
  h.root.quaternion.setFromRotationMatrix(GRIP_BASIS).premultiply(yaw);
  h.root.position.set(rx + 0.0135, -0.022, 0.066).applyQuaternion(yaw);
  return h;
}
// 幅のある物(魔晶の塊・鉄屑など)は握らず、掌に載せる。bottom = 物の底の高さ
const CRADLE_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(0.6, 0, -0.8), new THREE.Vector3(-0.8, 0, -0.6), new THREE.Vector3(0, 1, 0));
export function makeCradleHand(bottom = -0.05) {
  const h = makeFpHand(); if (!h) return null;
  h.pose({ curl: [[0.3, 0.45, 0.35], [0.28, 0.42, 0.3], [0.32, 0.45, 0.32], [0.4, 0.5, 0.35]], spread: 0.05, thumb: { abd: 0.55, add: -0.15, roll: -0.7, f2: 0.25, f3: 0.3 }, arm: [0.4, 0, 0] });
  h.root.quaternion.setFromRotationMatrix(CRADLE_BASIS);
  h.root.position.set(0.044, bottom - 0.0145, 0.033);
  return h;
}
// 開いた本を下から支える手: 掌で背を受け、指は表紙の裏、親指だけが下の縁から頁の端に掛かる
//   x, bottom = 本の下の縁の、親指が掛かる位置 / back = 表紙の裏の z
export function makeBookHand({ x = 0, bottom = -0.105, back = -0.034, tilt = 0.6, thumb = {} } = {}) {
  const h = makeFpHand(); if (!h) return null;
  h.pose({ curl: [[0.2, 0.25, 0.2], [0.12, 0.2, 0.15], [0.15, 0.2, 0.15], [0.25, 0.3, 0.2]], spread: 0.06, thumb: { abd: 1.0, add: 0.15, roll: -1.1, f2: 0.45, f3: 0.5, ...thumb }, arm: [-0.55, 0, 0] });
  h.root.rotation.z = tilt;
  const w = new THREE.Vector3(0.034, 0.058, 0).applyAxisAngle(Z, tilt);   // 親指と人差し指の股
  h.root.position.set(x - w.x, bottom - w.y, back - 0.0135);
  return h;
}
// 蓋に掛ける手: 掌を下に、指は前へ
const REACH_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0));
export function makeReachHand(mirror) {
  const h = makeFpHand({ mirror }); if (!h) return null;
  h.pose({ curl: [0.55, 0.6, 0.35], spread: 0.03, thumb: { abd: 0.5, add: 0.1, roll: -0.8, f2: 0.3, f3: 0.3 }, arm: [-0.55, 0, 0] });
  h.root.quaternion.setFromRotationMatrix(REACH_BASIS);
  return h;
}
