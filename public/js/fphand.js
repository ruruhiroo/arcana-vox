// 一人称の手: 精霊の子の手(丸い手と細い腕)。仲間から見える姿と同じ形・同じ色。
// 向き: 指先の側が +Y、掌の面は +Z。原点は手首。持つ物を包むように、丸い手を掌の位置に置く。
import * as THREE from 'three';

const FING = ['i', 'm', 'r', 'p'];
const Z = new THREE.Vector3(0, 0, 1);
const q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 手と腕の材質(すべての手で共有)。体の色が変わったら tintHands で塗り直す
const handM = new THREE.MeshStandardMaterial({ color: 0x6a5a8a, roughness: 0.7, metalness: 0, emissive: 0x6a5a8a, emissiveIntensity: 0.12, envMapIntensity: 0 });
const armM = new THREE.MeshStandardMaterial({ color: 0x3a3048, roughness: 0.8, metalness: 0, emissive: 0x3a3048, emissiveIntensity: 0.1, envMapIntensity: 0 });
export function tintHands(c) {
  handM.color.copy(c).multiplyScalar(0.42); handM.emissive.copy(c).multiplyScalar(0.3);
  armM.color.copy(c).multiplyScalar(0.24); armM.emissive.copy(c).multiplyScalar(0.3);
}
const LEN = Object.fromEntries(FING.map(f => [f, [0.04, 0.026, 0.022]]));
export function makeFpHand() {
  const root = new THREE.Group(); root.name = 'fp_hand';
  const mesh = (geo, mat) => { const o = new THREE.Mesh(geo, mat); o.frustumCulled = false; o.renderOrder = 11; o.castShadow = false; return o; };
  // 丸い掌に、短い指が二本と親指が一本。物をはさんでつかむ形
  const palm = mesh(new THREE.SphereGeometry(0.04, 20, 14), handM); palm.position.set(0, 0.06, 0.006); palm.scale.set(1, 1, 0.72); root.add(palm);
  const nub = (x, y, len, r) => { const pv = new THREE.Group(); pv.position.set(x, y, 0.008); const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), handM); m.position.y = len / 2 + r * 0.4; pv.add(m); root.add(pv); return pv; };
  const fingers = [nub(-0.019, 0.088, 0.03, 0.0145), nub(0.019, 0.088, 0.03, 0.0145)];
  const thumbP = nub(0.034, 0.05, 0.022, 0.0135);
  const bendTo = b => { fingers.forEach((f, i) => f.rotation.set(b, 0, (i ? -1 : 1) * 0.12)); thumbP.rotation.set(b * 0.9, 0, -1.1); };
  bendTo(0.4);
  const armG = new THREE.Group(); root.add(armG);
  const arm = mesh(new THREE.CylinderGeometry(0.0125, 0.011, 0.42, 10), armM); arm.position.y = -0.18; armG.add(arm);
  const hand = { root, bones: {}, len: LEN, userData: {}, pose({ curl = null, arm: a = null } = {}) {
    if (curl) { const c = Array.isArray(curl[0]) ? curl[0] : curl; bendTo(clamp(c[0] + c[1] * 0.6, 0, 1.7)); }
    if (a) armG.rotation.set(a[0], a[1], a[2]); return hand; } };
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
  h.pose({ curl: [0, 0, 0], arm: [-0.55, 0, 0] });
  h.root.rotation.z = tilt;
  const w = new THREE.Vector3(0.034, 0.058, 0).applyAxisAngle(Z, tilt);   // 親指と人差し指の股
  h.root.position.set(x - w.x, bottom - w.y, back - 0.032);
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
