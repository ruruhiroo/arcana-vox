// 術の見た目: 属性ごとに姿の違う魔弾、尾を引く光の帯、放つ瞬間の魔法陣、当たった時の衝撃の輪。
//   炎 = 燃える彗星 / 氷 = 回る氷晶 / 雷 = 折れ曲がる稲妻 / 聖 = 光の槍と輪 / 闇 = 光を呑む黒い球 / 風 = 回る三日月の刃
import * as THREE from 'three';
import { G } from './state.js';
import { glowSprite, runeCircleTex } from './textures.js';

let GLOW = null, RUNE = null;
const ready = (rune = false) => { try { GLOW ||= glowSprite(); if (rune) RUNE ||= runeCircleTex(); } catch { /* 描画の無い環境(試験)では絵を作らない */ } };
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const add = (obj, update) => { G.scene.add(obj); G.vfx.push({ obj: null, update: dt => { const keep = update(dt); if (!keep) dispose(obj); return keep; } }); };
function dispose(obj) { G.scene.remove(obj); obj.traverse(o => { o.geometry?.dispose?.(); if (o.material && !o.material.userData?.shared) o.material.dispose?.(); }); }
// 加算の光は重なると際限なく明るくなり、にじみ(ブルーム)で画面が白く飛ぶ。色そのものを暗めに作っておく
const DIM = 0.72;
const additive = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(DIM), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });

// 尾: 通ってきた位置をつなぎ、視点へ向けて張った帯。先へ行くほど細く、暗くなる
class Trail {
  constructor(color, width = 0.25, n = 20, jitter = 0) {
    this.n = n; this.width = width; this.jitter = jitter; this.pts = [];
    this.color = new THREE.Color(color);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
  }
  push(p) {
    this.pts.unshift(p.clone());
    if (this.pts.length > this.n) this.pts.pop();
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color, cam = G.camera?.position || UP;
    const side = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const k = Math.min(i, this.pts.length - 1), a = this.pts[k], b = this.pts[Math.min(k + 1, this.pts.length - 1)];
      dir.subVectors(a, b); if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      side.crossVectors(dir, q.subVectors(a, cam)).normalize();
      const f = 1 - i / (this.n - 1), w = this.width * (0.25 + 0.75 * f) * (i >= this.pts.length ? 0 : 1);
      q.copy(a);
      if (this.jitter && i > 0) q.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.jitter * (0.4 + i / this.n)));
      pos.setXYZ(i * 2, q.x + side.x * w, q.y + side.y * w, q.z + side.z * w);
      pos.setXYZ(i * 2 + 1, q.x - side.x * w, q.y - side.y * w, q.z - side.z * w);
      const c = f * f * DIM;
      col.setXYZ(i * 2, this.color.r * c, this.color.g * c, this.color.b * c); col.setXYZ(i * 2 + 1, this.color.r * c, this.color.g * c, this.color.b * c);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}

// 魔弾: 属性ごとの姿を作る。返す Group は位置だけ外から動かし、毎フレーム userData.tick(dt, 速度) を呼ぶ
export function makeBolt(elements, color, power = 1, hostile = false) {
  ready();
  const el = hostile ? 'void' : (elements && elements[0]) || 'none';
  const g = new THREE.Group(), s = Math.min(1.7, 0.75 + power * 0.35);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(1.25 * s); glow.material.opacity = 0.8; g.add(glow);
  const head = new THREE.Group(); g.add(head);          // 進む向きへ向ける部分
  const trails = [], spin = [];
  const trail = (c, w, n, j = 0) => { if (G.dbgNoTrail) return null; const t = new Trail(c, w * s * 0.75, n, j); G.scene.add(t.mesh); trails.push(t); return t; };
  let t = 0, extra = null;
  if (el === 'fire') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 10, 1, true), additive(0xff7a20, 0.75)); flame.rotation.x = -Math.PI / 2; flame.position.z = 0.45; head.add(flame);
    const hot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 8, 1, true), additive(0xfff0b0, 0.9)); hot.rotation.x = -Math.PI / 2; hot.position.z = 0.2; head.add(hot);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb0a890 })));
    trail(0xff5a14, 0.3, 22); trail(0xffe0a0, 0.1, 12);
    extra = dt => { flame.scale.set(1 + Math.sin(t * 40) * 0.15, 1 + Math.sin(t * 31) * 0.2, 1); if (Math.random() < dt * 40) G.particles.emit(g.position.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random(), (Math.random() - 0.5) * 0.8), Math.random() < 0.5 ? 0xff8a30 : 0xffd070, 0.3, 0.55); };
  } else if (el === 'ice') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe4f6ff, emissive: color, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), mat); shard.scale.set(0.7, 0.7, 2.6); head.add(shard); spin.push([shard, 9]);
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), mat); m.scale.set(0.7, 0.7, 2); const p = new THREE.Group(); m.position.set(0.3, 0, 0.1); p.rotation.z = k * Math.PI * 2 / 3; p.add(m); head.add(p); spin.push([p, -6]); }
    trail(0x9fe4ff, 0.16, 18); trail(0xffffff, 0.05, 10);
    extra = dt => { if (Math.random() < dt * 30) G.particles.emit(g.position.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.3 - Math.random() * 0.5, (Math.random() - 0.5) * 0.5), 0xd8f4ff, 0.12, 0.7); };
  } else if (el === 'thunder') {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb0b0b0 })));
    trail(0xd8b0ff, 0.09, 16, 0.5); trail(0xffffff, 0.04, 12, 0.3); trail(0x9a70ff, 0.07, 14, 0.8);
    extra = () => { glow.scale.setScalar((0.7 + Math.random() * 0.5) * s); };
  } else if (el === 'holy') {
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.075, 1.9, 8, 1, true), additive(0xfff4c8, 0.9)); spear.rotation.x = Math.PI / 2; spear.position.z = 0.3; head.add(spear);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 32), additive(color, 0.9)); head.add(ring); spin.push([ring, 4]);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 6, 28), additive(0xffffff, 0.8)); ring2.position.z = 0.35; head.add(ring2); spin.push([ring2, -5]);
    trail(color, 0.2, 22); trail(0xffffff, 0.06, 14);
    extra = dt => { if (Math.random() < dt * 20) G.particles.emit(g.position.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3), 0xfff0b0, 0.1, 0.9); };
  } else if (el === 'void') {
    glow.material.opacity = 0.55;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), new THREE.MeshBasicMaterial({ color: 0x030106 })));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), additive(color, 0.5, { side: THREE.BackSide })); head.add(shell);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.42, 32), additive(color, 0.45)); head.add(disc); spin.push([disc, 3]);
    trail(color, hostile ? 0.12 : 0.22, 20); if (!hostile) trail(0x4a1a80, 0.4, 14);   // 魔物の弾は、視界を塞がないよう細い尾だけ
    extra = dt => { shell.scale.setScalar(1 + Math.sin(t * 18) * 0.08); if (Math.random() < dt * 36) { const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.7); G.particles.emit(g.position.clone().add(off), off.multiplyScalar(-2.4), color, 0.16, 0.28); } };  // 光が吸い込まれていく
  } else if (el === 'wind') {
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.028, 6, 22, Math.PI * 1.15), additive(k ? 0xffffff : color, 0.8)); b.rotation.z = k * Math.PI; b.scale.set(1, 1, 0.3); const p = new THREE.Group(); p.add(b); p.rotation.x = k * 0.5; head.add(p); spin.push([p, 16 + k * 5]); }
    trail(color, 0.34, 16); trail(0xffffff, 0.08, 10);
  } else {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb0b0b0 })));
    trail(color, 0.2, 18);
  }
  head.scale.setScalar(s);
  if (G.dbgNoHead) head.visible = false;
  if (G.dbgNoGlow) glow.visible = false;
  const q = new THREE.Quaternion(), d = new THREE.Vector3();
  g.visible = false;
  g.userData.tick = (dt, vel) => {
    t += dt;
    // 目の前(視点のすぐ近く)では描かない: 加算の光が画面いっぱいに被って真っ白になるのを防ぐ
    const near = G.camera ? G.camera.position.distanceTo(g.position) < 1.6 : false;
    g.visible = !near;
    if (near) return;
    if (vel && vel.lengthSq() > 1e-6) { d.copy(vel).normalize().negate(); q.setFromUnitVectors(Z, d); head.quaternion.copy(q); }   // 尾を引く側(+z)を、進む向きの逆へ
    for (const [o, w] of spin) o.rotation.z += dt * w;
    extra?.(dt);
    if (!G.camera || G.camera.position.distanceTo(g.position) > 3.2) for (const tr of trails) tr.push(g.position);   // 尾は少し離れてから引き始める
  };
  g.userData.dispose = () => {
    // 尾は、その場に残って消えていく
    for (const tr of trails) { let life = 0.35; G.vfx.push({ obj: null, update: dt => { life -= dt; tr.push(tr.pts[0] || g.position); if (life <= 0) { G.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose(); return false; } return true; } }); }
    dispose(g);
  };
  return g;
}

// 放つ瞬間: 術者の前に魔法陣が開き、回りながら広がって消える
export function castCircle(pos, dir, color, power = 1, local = false) {
  if (G.dbgNoCircle) return;
  ready(true);
  const d = dir.clone().normalize(), base = pos.clone().addScaledVector(d, local ? 1.9 : 0.7);
  const quat = new THREE.Quaternion().setFromUnitVectors(Z, d);
  const size = (local ? 1.15 : 1.5) * Math.min(1.6, 0.8 + power * 0.3), dim = local ? 0.45 : 1;   // 自分の目の前では眩しすぎないように
  [[1, 0, 2.2], [0.62, 0.06, -3.4], [1.35, 0.1, 1.2]].forEach(([k, delay, w], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: RUNE, color: new THREE.Color(i === 1 ? 0xffffff : color).multiplyScalar(0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(base).addScaledVector(d, i * 0.18); m.quaternion.copy(quat);
    let t = -delay; const life = 0.42;
    add(m, dt => { t += dt; if (t < 0) return true; const f = t / life; m.scale.setScalar(size * k * (0.35 + 0.9 * (1 - (1 - f) * (1 - f)))); m.rotateZ(dt * w); m.material.opacity = dim * (i === 1 ? 0.9 : 0.7) * (1 - f) * Math.min(1, f * 8); return f < 1; });
  });
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, off = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(quat); G.particles.emit(base.clone().addScaledVector(off, size * 0.45), off.multiplyScalar(1.2).addScaledVector(d, 2.5), color, 0.2, 0.4); }
}

// 当たった時: 視点へ向いた衝撃の輪が二重に広がる
export function impactRing(pos, color, power = 1) {
  if (G.dbgNoRing) return;
  ready();
  const cam = G.camera;
  [[0, 2.6, 0.5], [0.07, 1.7, 0.34]].forEach(([delay, grow, life], i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), additive(i ? 0xffffff : color, 0));
    m.position.copy(pos); if (cam) m.quaternion.copy(cam.quaternion);
    let t = -delay;
    add(m, dt => { t += dt; if (t < 0) return true; const f = t / life; m.scale.setScalar((0.4 + grow * f) * (0.8 + power * 0.4)); m.material.opacity = 0.6 * (1 - f) * (1 - f); return f < 1; });
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(color).multiplyScalar(0.5), blending: THREE.AdditiveBlending, depthWrite: false })); s.position.copy(pos);
  let t = 0; add(s, dt => { t += dt; const f = t / 0.2; s.scale.setScalar((0.8 + 1.6 * f) * (0.8 + power * 0.4)); s.material.opacity = 0.6 * (1 - f); return f < 1; });
}
