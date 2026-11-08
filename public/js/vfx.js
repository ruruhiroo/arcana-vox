// 派手な魔法の演出: 衝撃波・火花・焦げ跡・属性ごとの余韻・画面の揺れ・瓦礫
import * as THREE from 'three';
import { G, rand } from './state.js';
import { glowSprite } from './textures.js';
import { ELEMENTS } from './lexicon.js';

const GLOW = glowSprite();
G.vfx = [];
const add = (obj, update) => { if (obj) G.scene.add(obj); G.vfx.push({ obj, update }); };
const scorchTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.6, 'rgba(10,6,4,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 40; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 5, 0, 6.28); g.fill(); }
  return new THREE.CanvasTexture(c);
})();
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a645c, roughness: 0.95 });

export function shake(amount, at) {
  const d = at && G.camera ? at.distanceTo(G.camera.position) : 0;
  const k = amount * Math.max(0, 1 - d / 22);
  G.shake = Math.min(1, (G.shake || 0) + k);
}

// 着弾: power が大きいほど大きく、属性で色と余韻が変わる
export function bigImpact(pos, color, power = 1, elements = []) {
  const P = Math.min(2.4, power);
  // 衝撃波の輪
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.copy(pos); ring.lookAt(G.camera.position);
  let t = 0; const R = 1.2 + P * 1.6;
  add(ring, dt => { t += dt; const k = t / 0.45; ring.scale.setScalar(0.2 + k * R); ring.material.opacity = 0.9 * (1 - k); return k < 1; });
  // 地面の輪
  if (pos.y < 1.5) {
    const gr = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ring.material.clone()); gr.rotation.x = -Math.PI / 2; gr.position.set(pos.x, 0.05, pos.z);
    let t2 = 0; add(gr, dt => { t2 += dt; const k = t2 / 0.6; gr.scale.setScalar(0.3 + k * R * 1.4); gr.material.opacity = 0.7 * (1 - k); return k < 1; });
  }
  // 中心の閃光
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.copy(pos); let t3 = 0;
  add(core, dt => { t3 += dt; const k = t3 / 0.25; core.scale.setScalar((1 - k) * (2 + P * 2)); core.material.opacity = 1 - k; return k < 1; });
  // 火花
  for (let i = 0; i < 40 + P * 50; i++) G.particles.emit(pos.clone(), new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(3, 9) * (0.7 + P * 0.4)), i % 3 ? color : 0xffffff, rand(0.15, 0.4), rand(0.3, 0.8));
  // 煙と土埃
  for (let i = 0; i < 12 + P * 8; i++) G.particles.emit(pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))), new THREE.Vector3(rand(-0.8, 0.8), rand(0.4, 1.6), rand(-0.8, 0.8)), 0x1a1612, rand(0.5, 0.9), rand(0.8, 1.4));
  // 焦げ跡
  if (pos.y < 2.2) scorch(new THREE.Vector3(pos.x, 0.03, pos.z), 0.8 + P * 0.6);
  // 属性ごとの余韻
  const el = elements[0];
  if (el === 'fire') embers(pos, 1.6 + P);
  if (el === 'ice') shards(pos, 10 + P * 6);
  if (el === 'thunder') arcs(pos, color, 3 + Math.round(P * 2));
  if (el === 'holy') pillar(pos, color, P);
  if (el === 'void') implode(pos, color, P);
  shake(0.12 + P * 0.16, pos);
}

function scorch(pos, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.copy(pos);
  let t = 0; add(m, dt => { t += dt; if (t > 18) m.material.opacity = Math.max(0, 0.85 * (1 - (t - 18) / 6)); return t < 24; });
}
function embers(pos, dur) {
  let t = 0; add(null, dt => { t += dt; for (let i = 0; i < 3; i++) G.particles.emit(pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))).setY(0.1), new THREE.Vector3(rand(-0.3, 0.3), rand(1, 2.4), rand(-0.3, 0.3)), Math.random() < 0.5 ? 0xff7020 : 0xffc040, 0.18, 1.1); return t < dur; });
}
function shards(pos, n) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfefff, emissive: 0x4aa0ff, emissiveIntensity: 0.8, roughness: 0.1, transparent: true });
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.05, 0.14), 0), mat); s.scale.y = 2.2; s.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(3, 7));
    let t = 0; add(s, dt => { t += dt; v.y -= 14 * dt; s.position.addScaledVector(v, dt); if (s.position.y < 0.05) { s.position.y = 0.05; v.set(0, 0, 0); } s.rotation.x += dt * 6; if (t > 1.5) mat.opacity = Math.max(0, 1 - (t - 1.5)); return t < 2.5; });
  }
}
function arcs(pos, color, n) {
  for (let i = 0; i < n; i++) {
    const pts = []; let p = pos.clone(); const dir = new THREE.Vector3(rand(-1, 1), rand(-0.5, 0.6), rand(-1, 1)).normalize();
    for (let k = 0; k < 7; k++) { pts.push(p.clone()); p = p.clone().addScaledVector(dir, rand(0.3, 0.6)).add(new THREE.Vector3(rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25))); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf0e8ff, transparent: true, blending: THREE.AdditiveBlending }));
    let t = 0; add(line, dt => { t += dt; line.material.opacity = Math.random() < 0.5 ? 1 - t / 0.3 : 0.2; return t < 0.3; });
  }
}
function pillar(pos, color, P) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + P * 0.3, 0.7 + P * 0.4, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(pos.x, 3, pos.z); let t = 0;
  add(m, dt => { t += dt; m.material.opacity = 0.45 * (1 - t / 0.8); m.scale.x = m.scale.z = 1 - t * 0.6; return t < 0.8; });
}
function implode(pos, color, P) {
  for (let i = 0; i < 40 + P * 20; i++) { const off = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 3)); G.particles.emit(pos.clone().add(off), off.clone().multiplyScalar(-2.2), color, 0.35, 0.45); }
}

// 壁が砕けた: 瓦礫が飛び散り、転がって止まる
export function rubbleBurst(center, n = 14) {
  for (let i = 0; i < n; i++) {
    const s = rand(0.12, 0.38);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneMat); m.castShadow = true;
    m.position.set(center.x + rand(-1.4, 1.4), rand(0.5, 4.5), center.z + rand(-1.4, 1.4));
    const v = new THREE.Vector3(rand(-4, 4), rand(1, 5), rand(-4, 4)), spin = new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    let t = 0, rest = false;
    add(m, dt => {
      t += dt;
      if (!rest) {
        v.y -= 16 * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt;
        if (m.position.y < s * 0.6) { m.position.y = s * 0.6; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; spin.multiplyScalar(0.5); if (Math.abs(v.y) < 0.6) rest = true; }
      }
      if (t > 25) { m.scale.multiplyScalar(1 - dt); }
      return t < 28;
    });
  }
  for (let i = 0; i < 22; i++) G.particles.emit(new THREE.Vector3(center.x + rand(-1.5, 1.5), rand(0.2, 3.5), center.z + rand(-1.5, 1.5)), new THREE.Vector3(rand(-1.2, 1.2), rand(-0.3, 1.2), rand(-1.2, 1.2)), 0x1c1914, rand(0.5, 0.9), rand(0.8, 1.5)); // 土埃(加算合成なので暗い色で)
  shake(0.5, center);
}

export function updateVfx(dt) {
  for (let i = G.vfx.length - 1; i >= 0; i--) {
    const v = G.vfx[i];
    if (!v.update(dt)) { if (v.obj) { G.scene.remove(v.obj); v.obj.geometry?.dispose?.(); } G.vfx.splice(i, 1); }
  }
}
export function clearVfx() { for (const v of G.vfx) if (v.obj) G.scene.remove(v.obj); G.vfx.length = 0; }
export const elemColor = e => (e ? ELEMENTS[e].color : 0xfff0a0);
