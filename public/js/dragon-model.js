import * as THREE from 'three';
import { DRAGON_PROFILES } from './dragon-profiles.js';
import { smooth, breathTurn, sweepTurn } from './dragon-rules.js';

// 自作のローポリ竜。外部アセット不要でオフライン版にも同じ姿を載せる。
export function buildDragon() {
  const root = new THREE.Group();
  root.scale.setScalar(2.2); // 全長約20m、翼開長約21m。人の視点から見上げる成竜。
  const hitParts = [];
  const scales = new THREE.MeshStandardMaterial({ color: 0x50232e, roughness: 0.65, metalness: 0.22, flatShading: true });
  const armor = new THREE.MeshStandardMaterial({ color: 0x171d2c, roughness: 0.55, metalness: 0.45, flatShading: true });
  const horn = new THREE.MeshStandardMaterial({ color: 0xd9b879, roughness: 0.5, metalness: 0.35 });
  const membrane = new THREE.MeshStandardMaterial({ color: 0x8d3540, emissive: 0x3a0b12, emissiveIntensity: 0.35, side: THREE.DoubleSide, flatShading: true });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffb450, emissive: 0xff5418, emissiveIntensity: 1.4 });
  for (const [name,m] of Object.entries({ scales, armor, membrane, coreMat, horn })) m.name = 'guardian-' + name;
  const orb = (parent, mat, pos, size) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat); m.position.set(...pos); m.scale.set(...size); parent.add(m); return m;
  };
  const bone = (parent, a, b, r1, r2, mat) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 7), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(m); return m;
  };
  const torso = orb(root, scales, [0, 1.6, 0.4], [0.82, 0.8, 1.65]); hitParts.push(torso);
  hitParts.push(orb(root, armor, [0, 2.05, 0.55], [0.76, 0.4, 1.45]));
  const neck = new THREE.Group(); neck.position.set(0, 1.9, -0.7); root.add(neck);
  hitParts.push(orb(neck, scales, [0, 0.55, -0.35], [0.45, 0.85, 0.55]));
  hitParts.push(orb(neck, scales, [0, 1.25, -0.85], [0.36, 0.65, 0.6]));
  const head = new THREE.Group(); head.position.set(0, 1.5, -1.25); neck.add(head);
  hitParts.push(orb(head, armor, [0, 0.35, -0.25], [0.42, 0.32, 0.57]));
  hitParts.push(orb(head, scales, [0, 0.18, -0.83], [0.3, 0.17, 0.57]));
  const jaw = new THREE.Group(); jaw.position.set(0, 0.03, -0.4); head.add(jaw);
  hitParts.push(orb(jaw, armor, [0, -0.04, -0.45], [0.31, 0.1, 0.6]));
  const core = orb(neck, coreMat, [0, 0.55, -0.84], [0.23, 0.5, 0.15]);
  for (const side of [-1, 1]) {
    bone(head, [side * 0.3, 0.5, -0.1], [side * 0.65, 1.15, 0.8], 0.16, 0.01, horn);
    bone(head, [side * 0.34, 0.1, 0], [side * 0.8, 0.35, 0.5], 0.1, 0.01, horn);
    const eye = orb(head, coreMat, [side * 0.37, 0.4, -0.61], [0.065, 0.035, 0.11]); eye.userData.eye = true;
    for (let i = 0; i < 4; i++) bone(head, [side * 0.24, 0.1, -0.7 - i * 0.18], [side * 0.24, -0.06, -0.7 - i * 0.18], 0.04, 0, horn);
  }
  const legs = [];
  for (const z of [-0.8, 1.5]) for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.65, 1.45, z); root.add(leg); legs.push(leg);
    bone(leg, [0, 0, 0], [side * 0.45, -0.65, 0.3], 0.32, 0.23, scales);
    bone(leg, [side * 0.45, -0.65, 0.3], [side * 0.5, -1.28, -0.15], 0.22, 0.12, armor);
    hitParts.push(orb(leg, scales, [side * 0.25, -0.55, 0.1], [0.32, 0.65, 0.35]));
    hitParts.push(orb(leg, scales, [side * 0.5, -1.3, -0.3], [0.3, 0.15, 0.42]));
    for (let i = -1; i <= 1; i++) bone(leg, [side * 0.5 + i * 0.17, -1.33, -0.5], [side * 0.5 + i * 0.2, -1.33, -0.9], 0.07, 0, horn);
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * 0.65, 2.1, 0); root.add(wing); wings.push(wing);
    const points = [[0, 0, 0], [side * 1.7, 1.6, -0.55], [side * 4.2, 1.1, 0.5], [side * 3.55, 0.2, 1.25], [side * 2.85, 0.35, 2.05], [side * 1.85, -0.1, 2.65], [0, -0.2, 1.5]];
    const vertices = [];
    for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    wing.add(new THREE.Mesh(geo, membrane));
    for (const tip of points.slice(2)) bone(wing, points[1], tip, 0.055, 0.02, horn);
    bone(wing, points[0], points[1], 0.16, 0.1, armor); bone(wing, points[1], points[2], 0.1, 0.02, armor);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.25, 1.65); root.add(tail);
  bone(tail, [0, 0, 0], [0, -0.45, 1.7], 0.48, 0.25, scales);
  bone(tail, [0, -0.45, 1.7], [0, -0.65, 3.2], 0.25, 0.12, scales);
  bone(tail, [0, -0.65, 3.2], [0, -0.35, 4.2], 0.12, 0.01, armor);
  for (let i = 0; i < 7; i++) bone(root, [0, 2.2, -0.8 + i * 0.45], [0, 2.85 - i * 0.06, -0.5 + i * 0.45], 0.15, 0, horn);
  root.userData = { materials: { scales, armor, membrane, coreMat, horn }, kind: 'dragon', neck, head, jaw, core, torso, wings, tail, legs, hitParts, stage: 'idle', move: 'breath' };
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}
export function animateDragon(ud, t, moving) {
  const charge = ud.stage === 'windup', strike = ud.stage === 'strike', rest = ud.stage === 'recover';
  const p = ud.progress || 0, q = smooth(p), root = ud.torso.parent;
  root.rotation.set(0, 0, 0); root.position.y = moving ? Math.abs(Math.sin(t * 4)) * .12 : 0;
  ud.neck.rotation.set(rest ? -.5 * (1 - q) : Math.sin(t * 1.1) * .035, 0, 0);
  ud.head.rotation.set(0, 0, 0);
  ud.jaw.rotation.x = .08;
  ud.core.material.emissiveIntensity = rest ? 2.5 : charge ? 1.5 + Math.sin(t * 12) * 0.5 : 0.7;
  let wing = rest ? .3 * (1 - q) : Math.sin(t * 1.7) * .08;
  ud.tail.rotation.y = Math.sin(t * .7 - .5) * .12;
  ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 4 + (i === 0 || i === 3 ? 0 : Math.PI)) * .32 : 0; });
  if (ud.move === 'breath') {
    if (charge) { ud.neck.rotation.x = .38 * q; ud.neck.rotation.y = -.55 * q; ud.jaw.rotation.x = .65 * q; wing = -.25 * q; }
    if (strike) { ud.neck.rotation.x = .38 - .95 * smooth(p / .12); ud.neck.rotation.y = breathTurn(p); ud.head.rotation.x = -.12; ud.jaw.rotation.x = .7; wing = -.25; }
    if (rest) { ud.neck.rotation.y = .55 * (1 - q); ud.jaw.rotation.x = .35 * (1 - q); }
  } else if (ud.move === 'sweep') {
    ud.tail.rotation.y = 0;
    if (charge) { root.rotation.y = -.9 * q; ud.neck.rotation.y = .6 * q; wing = -.45 * q; }
    if (strike) { root.rotation.y = sweepTurn(p); ud.neck.rotation.y = .6 * (1 - q); wing = -.45; ud.legs.forEach((l, i) => { l.rotation.x = Math.sin(p * Math.PI * 4 + i) * .28; }); }
    if (rest) { root.rotation.y = -.9 * (1 - q); wing = -.45 * (1 - q); }
  } else if (ud.move === 'slam') {
    const lift = charge ? q : strike ? 1 - smooth(p / .48) : 0;
    ud.neck.rotation.x = lift * .4 - (strike ? .35 * (1 - lift) : 0);
    ud.legs.slice(0, 2).forEach(l => { l.rotation.x = lift * 1.2; });
    root.position.y = lift * .7; wing = -.45 * lift;
    ud.jaw.rotation.x = lift * .5;
  } else if (ud.move === 'meteor') {
    const lift = charge ? q : strike ? 1 - q : 0;
    ud.neck.rotation.x = .7 * lift; ud.head.rotation.x = .4 * lift;
    ud.jaw.rotation.x = .75 * lift; wing = -.65 * lift;
  }
  ud.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * wing; });
}

const hitLocal = new THREE.Vector3(), hitScale = new THREE.Vector3(), hitInverse = new THREE.Matrix4();
// 高い頭や動く首にも術を当てられる。胴体中心の小さな球だけで判定しない。
export function intersectsDragon(body, point, padding = 0) {
  if (!body.visible) return false;
  body.updateWorldMatrix(true, true);
  for (const part of body.userData.hitParts) {
    hitInverse.copy(part.matrixWorld).invert(); hitLocal.copy(point).applyMatrix4(hitInverse);
    part.getWorldScale(hitScale);
    const r = 1 + padding / Math.min(hitScale.x, hitScale.y, hitScale.z);
    if (hitLocal.lengthSq() <= r * r) return true;
  }
  return false;
}

export function colorDragon(body, element) {
  const profile=DRAGON_PROFILES[element] || DRAGON_PROFILES.fire;
  body.traverse(o=>{
    const m=o.material; if(!m || !m.name?.startsWith('guardian-'))return;
    const role=m.name.slice(9);
    if(profile[role]!==undefined)m.color.setHex(profile[role]);
    if(role==='membrane')m.emissive.setHex(profile.color).multiplyScalar(.13);
    if(role==='coreMat'){m.color.setHex(profile.hot);m.emissive.setHex(profile.color);}
  });
  body.userData.element=element;
}
