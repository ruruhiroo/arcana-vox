import * as THREE from 'three';

// 自作のローポリ竜。外部アセット不要でオフライン版にも同じ姿を載せる。
export function buildDragon() {
  const root = new THREE.Group();
  const scales = new THREE.MeshStandardMaterial({ color: 0x50232e, roughness: 0.65, metalness: 0.22, flatShading: true });
  const armor = new THREE.MeshStandardMaterial({ color: 0x171d2c, roughness: 0.55, metalness: 0.45, flatShading: true });
  const horn = new THREE.MeshStandardMaterial({ color: 0xd9b879, roughness: 0.5, metalness: 0.35 });
  const membrane = new THREE.MeshStandardMaterial({ color: 0x8d3540, emissive: 0x3a0b12, emissiveIntensity: 0.35, side: THREE.DoubleSide, flatShading: true });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffb450, emissive: 0xff5418, emissiveIntensity: 1.4 });
  const orb = (parent, mat, pos, size) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat); m.position.set(...pos); m.scale.set(...size); parent.add(m); return m;
  };
  const bone = (parent, a, b, r1, r2, mat) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 7), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(m); return m;
  };
  const torso = orb(root, scales, [0, 1.35, 0.25], [0.85, 0.85, 1.35]);
  orb(root, armor, [0, 1.85, 0.35], [0.76, 0.45, 1.15]);
  const neck = new THREE.Group(); neck.position.set(0, 1.55, -0.75); root.add(neck);
  orb(neck, scales, [0, 0.45, -0.35], [0.48, 0.75, 0.55]);
  orb(neck, armor, [0, 0.9, -0.75], [0.55, 0.4, 0.65]);
  orb(neck, scales, [0, 0.7, -1.25], [0.38, 0.22, 0.55]);
  const jaw = new THREE.Group(); jaw.position.set(0, 0.55, -0.8); neck.add(jaw);
  orb(jaw, armor, [0, -0.05, -0.4], [0.4, 0.13, 0.65]);
  const core = orb(neck, coreMat, [0, 0.32, -0.66], [0.26, 0.45, 0.18]);
  for (const side of [-1, 1]) {
    bone(neck, [side * 0.35, 1.1, -0.45], [side * 0.62, 1.9, 0.05], 0.18, 0.01, horn);
    const eye = orb(neck, coreMat, [side * 0.46, 0.9, -1.03], [0.1, 0.07, 0.14]); eye.userData.eye = true;
    for (let i = 0; i < 3; i++) bone(neck, [side * 0.29, 0.57, -1.05 - i * 0.22], [side * 0.29, 0.43, -1.05 - i * 0.22], 0.05, 0, horn);
  }
  const legs = [];
  for (const z of [-0.65, 1.1]) for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.65, 1.1, z); root.add(leg); legs.push(leg);
    bone(leg, [0, 0, 0], [side * 0.35, -0.45, 0.2], 0.3, 0.22, scales);
    bone(leg, [side * 0.35, -0.45, 0.2], [side * 0.3, -0.95, -0.1], 0.2, 0.12, armor);
    orb(leg, scales, [side * 0.3, -0.97, -0.25], [0.25, 0.13, 0.4]);
    for (let i = -1; i <= 1; i++) bone(leg, [side * 0.3 + i * 0.14, -1, -0.45], [side * 0.3 + i * 0.17, -1, -0.75], 0.07, 0, horn);
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * 0.55, 1.9, 0); root.add(wing); wings.push(wing);
    const points = [[0, 0, 0], [side * 1.3, 1.2, -0.2], [side * 2.7, 0.9, 0.3], [side * 2.15, 0.2, 1.15], [side * 1.3, 0, 1.8], [0, -0.15, 1.2]];
    const vertices = [];
    for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    wing.add(new THREE.Mesh(geo, membrane));
    for (const tip of points.slice(2)) bone(wing, points[1], tip, 0.055, 0.02, horn);
    bone(wing, points[0], points[1], 0.16, 0.1, armor); bone(wing, points[1], points[2], 0.1, 0.02, armor);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.15, 1.2); root.add(tail);
  bone(tail, [0, 0, 0], [0, -0.3, 1.4], 0.45, 0.18, scales); bone(tail, [0, -0.3, 1.4], [0, -0.15, 2.6], 0.18, 0.01, armor);
  for (let i = 0; i < 5; i++) bone(root, [0, 2.1, -0.6 + i * 0.5], [0, 2.65 - i * 0.07, -0.35 + i * 0.5], 0.16, 0, horn);
  root.userData = { kind: 'dragon', neck, jaw, core, torso, wings, tail, legs, stage: 'idle', move: 'breath' };
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}
export function animateDragon(ud, t, moving) {
  const charge = ud.stage === 'windup', strike = ud.stage === 'strike', rest = ud.stage === 'recover';
  ud.neck.rotation.x = rest ? 0.28 : charge ? -0.22 : strike ? 0.1 : Math.sin(t * 1.6) * 0.04;
  ud.jaw.rotation.x = charge || strike ? 0.5 : 0.08;
  ud.core.material.emissiveIntensity = rest ? 2.5 : charge ? 1.5 + Math.sin(t * 12) * 0.5 : 0.7;
  ud.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (rest ? 0.38 : charge ? -0.18 : Math.sin(t * 1.7) * 0.08); });
  ud.tail.rotation.y = strike && ud.move === 'sweep' ? Math.sin(t * 16) * 1.1 : Math.sin(t * 1.4) * 0.16;
  ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 5 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.22 : 0; });
}
