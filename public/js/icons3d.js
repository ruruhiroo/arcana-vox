// 所持品の絵を、立体の模型から一度だけ撮って作る(陰影のある静物写真のように)
// 撮った画像は使い回す。WebGL が使えない時は平面の絵(icons.js)のまま
import * as THREE from 'three';
import { makePickupMesh } from './props.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { baseId } from './equipment.js';

// Blender で作った道具・装備の模型 (tools/blender/build_items.py → models/items.glb)
const BL = {};
let blLoading = null;
export function preloadItems() {
  if (blLoading) return blLoading;
  blLoading = new Promise(res => new GLTFLoader().load('models/items.glb', g => {
    for (const o of g.scene.children) if (o.name.startsWith('item_')) BL[o.name.slice(5)] = o;
    cache.clear(); // 先に撮った仮の絵は撮り直す
    res(true);
  }, undefined, e => { console.warn('items.glb', e); res(false); }));
  return blLoading;
}
function blender(key) {
  const src = BL[key]; if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.traverse(m => {
    if (!m.isMesh) return;
    const mt = m.material = m.material.clone(); mt.envMapIntensity = mt.metalness > 0.5 ? 1.1 : 0.35; if (mt.metalness > 0.75) mt.metalness = 0.75; if (mt.emissiveIntensity > 0.5) mt.emissiveIntensity *= 0.6; // 光り物は控えめに m.userData.keep = true;
    // 透過(transmission)は小さな撮影では黒く潰れるので、ただの半透明の硝子にする
    if (mt.transmission > 0) { mt.transmission = 0; mt.transparent = true; mt.opacity = 0.3; mt.depthWrite = false; mt.side = THREE.DoubleSide; }
  });
  return o;
}
// 部品の素材を名前で探して塗り替える
function paint(o, name, col, emissive = false) {
  o.traverse(m => { if (m.isMesh && m.material.name === name) { m.material.color.setHex(col); if (emissive) m.material.emissive?.setHex(col); } });
}
function emblemOn(o, el) {
  const a = o.getObjectByName('emblem'); if (!a) return;
  const em = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: emblemTex(el), transparent: true, emissive: EL_COL[el], emissiveMap: emblemTex(el), emissiveIntensity: 0.7, roughness: 0.6, depthWrite: false }));
  // 表紙は Blender の +Y 面 = three の -Z 側
  em.position.copy(a.position); em.position.z -= 0.006; em.rotation.y = Math.PI; a.parent.add(em);
}

const SIZE = 200;
let R = null, scene = null, cam = null;
const cache = new Map();
const EL_COL = { fire: 0xc8541e, ice: 0x6aa8c8, thunder: 0x9a8ad0, wind: 0x5a9a7a, holy: 0xd8c890, void: 0x6a3aa0 };
const RAR_COL = [0x8a8478, 0x4a7ab0, 0x8a5ab8, 0xc89a3a];

function setup() {
  if (R) return true;
  try {
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    R = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    R.setSize(SIZE, SIZE, false); R.setPixelRatio(1);
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.3; R.outputColorSpace = THREE.SRGBColorSpace;
  } catch { R = false; return false; }
  scene = new THREE.Scene();
  // 金属が黒く沈まないよう、部屋の映り込みを環境光にする
  try { const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; } catch {}
  // 斜め上からの暖かい主光、背後から冷たい縁取りの光、ほの暗い環境光
  // 静物画のような光: 左上からの暖かい主光、右後ろから淡い金の縁取り、影は深く
  const key = new THREE.DirectionalLight(0xffdcae, 3.2); key.position.set(-1.0, 2.6, 3.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8b878, 2.2); rim.position.set(2.6, 1.6, -2.4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8a9ab8, 0.25); fill.position.set(2, 0.2, 2); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x6a6050, 0x0e0a08, 0.45));
  cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  return true;
}

// ---- 素材 ----
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const parch = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7); gr.addColorStop(0, '#dcc89c'); gr.addColorStop(1, '#8a6e44'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = 'rgba(70,45,25,.5)'; g.lineWidth = 2; for (let y = 24; y < h - 16; y += 14) { g.beginPath(); g.moveTo(18, y); g.lineTo(w - 18 - Math.random() * 30, y); g.stroke(); }
});
const leather = col => canvasTex(128, 128, (g, w, h) => {
  const c = new THREE.Color(col); g.fillStyle = '#' + c.clone().multiplyScalar(0.55).getHexString(); g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
  g.strokeStyle = 'rgba(200,170,100,.6)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
});
const gold = () => new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.9, roughness: 0.35 });
const iron = () => new THREE.MeshStandardMaterial({ color: 0x4a4a50, metalness: 0.8, roughness: 0.55 });
const gemMat = col => new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true });
const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// 属性の紋(本の表紙に浮き彫り)
function emblemTex(el) {
  const col = '#' + new THREE.Color(EL_COL[el] || 0xc8a050).getHexString();
  return canvasTex(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round'; g.shadowColor = col; g.shadowBlur = 10;
    const P = new Path2D({ fire: 'M0 -40 C16 -18 22 -6 22 8 A22 22 0 0 1 -22 8 C-22 -4 -14 -12 -10 -22 C-10 -10 -4 -6 2 -6 C-2 -16 0 -28 0 -40Z', thunder: 'M8 -44 L-20 4 L0 4 L-8 44 L22 -8 L2 -8 Z' }[el] || '');
    if (el === 'fire' || el === 'thunder') g.fill(P);
    else if (el === 'ice') { for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, -40); g.lineTo(0, 40); g.stroke(); } }
    else if (el === 'wind') { g.beginPath(); g.arc(8, -12, 14, Math.PI, Math.PI * 2.4); g.moveTo(-36, 2); g.lineTo(20, 2); g.moveTo(-36, -12); g.lineTo(-6, -12); g.arc(14, 18, 14, -Math.PI * 0.6, Math.PI * 0.9); g.stroke(); }
    else if (el === 'holy') { g.beginPath(); g.moveTo(0, -42); g.lineTo(0, 42); g.moveTo(-26, -14); g.lineTo(26, -14); g.stroke(); }
    else if (el === 'void') { g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 28, -Math.PI / 2, Math.PI / 2); g.fill(); }
  });
}

// ---- 模型 ----
function book(coverCol, el, gemCol) {
  const g = new THREE.Group();
  const cov = new THREE.MeshStandardMaterial({ map: leather(coverCol), roughness: 0.75 });
  g.add(M(new THREE.BoxGeometry(0.9, 1.2, 0.1), cov, 0, 0, 0.13), M(new THREE.BoxGeometry(0.9, 1.2, 0.1), cov, 0, 0, -0.13));
  g.add(M(new THREE.BoxGeometry(0.84, 1.14, 0.18), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 }), 0.03, 0, 0));
  g.add(M(new THREE.BoxGeometry(0.12, 1.2, 0.36), cov, -0.45, 0, 0));
  for (const [x, y] of [[0.42, 0.57], [0.42, -0.57]]) g.add(M(new THREE.BoxGeometry(0.12, 0.12, 0.38), gold(), x, y, 0));
  if (el) { const em = M(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: emblemTex(el), transparent: true, emissive: EL_COL[el], emissiveMap: emblemTex(el), emissiveIntensity: 0.6, roughness: 0.6 }), 0.02, 0, 0.185); g.add(em); }
  if (gemCol != null) { g.add(M(new THREE.OctahedronGeometry(0.12, 0), gemMat(gemCol), 0.02, 0, 0.2)); g.add(M(new THREE.TorusGeometry(0.15, 0.025, 6, 20), gold(), 0.02, 0, 0.19)); }
  g.rotation.set(-0.15, 0.55, 0.05);
  return g;
}
const MODELS = {
  ether() {
    const g = new THREE.Group();
    const prof = [[0, 0], [0.32, 0.02], [0.4, 0.2], [0.38, 0.42], [0.2, 0.62], [0.12, 0.72], [0.12, 0.9], [0.15, 0.94]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshPhysicalMaterial({ color: 0xb8c8d8, roughness: 0.08, transparent: true, opacity: 0.32, clearcoat: 1, side: THREE.DoubleSide })));
    const liq = [[0, 0.03], [0.3, 0.05], [0.37, 0.2], [0.35, 0.36], [0, 0.38]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(liq, 28), new THREE.MeshStandardMaterial({ color: 0x2a50c0, emissive: 0x2040b0, emissiveIntensity: 0.8, roughness: 0.2 })));
    g.add(M(new THREE.CylinderGeometry(0.11, 0.1, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }), 0, 0.98, 0));
    g.add(M(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x6a1a12, roughness: 0.5 }), 0, 0.88, 0));
    g.rotation.z = -0.12; return g;
  },
  herb() { const g = makePickupMesh('herb'); return g; },
  crystal() { const g = makePickupMesh('crystal'); return g; },
  bone() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.85 });
    g.add(M(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 12), m));
    for (const y of [-0.5, 0.5]) for (const x of [-0.08, 0.08]) g.add(M(new THREE.SphereGeometry(0.12, 12, 10), m, x, y, 0));
    g.rotation.set(0.3, 0.2, 0.9); return g;
  },
  iron() {
    const g = new THREE.Group();
    const a = M(new THREE.DodecahedronGeometry(0.4, 0), iron()); a.scale.set(1.4, 0.55, 1); g.add(a);
    const rust = M(new THREE.DodecahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x7a3a18, roughness: 1 }), 0.25, 0.08, 0.1); rust.scale.set(0.9, 0.4, 0.8); g.add(rust);
    g.add(M(new THREE.BoxGeometry(0.7, 0.06, 0.18), iron(), -0.2, 0.2, -0.1));
    g.rotation.set(0.5, 0.4, 0); return g;
  },
  scroll() {
    const g = new THREE.Group();
    const sheet = M(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 20), new THREE.MeshStandardMaterial({ map: parch(), roughness: 0.95 })); g.add(sheet);
    for (const y of [-0.53, 0.53]) g.add(M(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 }), 0, y, 0));
    const tie = M(new THREE.TorusGeometry(0.205, 0.018, 6, 24), new THREE.MeshStandardMaterial({ color: 0x5a3a1e })); tie.rotation.x = Math.PI / 2; g.add(tie);
    const wax = M(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.4 }), 0, 0, 0.21); wax.rotation.x = Math.PI / 2; g.add(wax);
    g.rotation.set(0.2, 0.3, 1.1); return g;
  },
  frag() {
    const s = new THREE.Shape(); const pts = [[-0.4, -0.5], [0.3, -0.48], [0.42, -0.2], [0.34, 0.05], [0.45, 0.3], [0.3, 0.52], [-0.38, 0.5], [-0.3, 0.2], [-0.45, -0.1]];
    s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p);
    const geo = new THREE.ShapeGeometry(s); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: parch(), roughness: 1, side: THREE.DoubleSide }));
    const g = new THREE.Group(); g.add(m); g.rotation.set(-0.5, 0.3, 0.2); return g;
  },
  amulet() {
    const tex = canvasTex(64, 160, (g, w, h) => { g.fillStyle = '#d8c8a0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a1e14'; g.lineWidth = 5; g.beginPath(); g.arc(32, 40, 15, 0, 7); g.stroke(); g.beginPath(); g.moveTo(32, 66); g.lineTo(32, 140); g.moveTo(16, 92); g.lineTo(48, 92); g.moveTo(18, 116); g.lineTo(46, 116); g.stroke(); });
    const g = new THREE.Group();
    g.add(M(new THREE.BoxGeometry(0.4, 1.0, 0.02), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })));
    g.add(M(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a1e }), 0, 0.68, 0));
    g.rotation.set(0, 0.4, 0.12); return g;
  },
  flash() {
    const g = new THREE.Group();
    g.add(M(new THREE.SphereGeometry(0.42, 28, 20), new THREE.MeshPhysicalMaterial({ color: 0xd8d0b0, roughness: 0.05, transparent: true, opacity: 0.4, clearcoat: 1 })));
    g.add(M(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })));
    g.add(M(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 14), gold(), 0, 0.44, 0));
    g.add(M(new THREE.TorusGeometry(0.07, 0.02, 6, 14), gold(), 0, 0.54, 0));
    return g;
  },
  lantern() {
    const g = new THREE.Group(), m = iron();
    g.add(M(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 4), m, 0, -0.4, 0), M(new THREE.ConeGeometry(0.34, 0.24, 4), m, 0, 0.46, 0));
    for (const [x, z] of [[0.24, 0.24], [-0.24, 0.24], [0.24, -0.24], [-0.24, -0.24]]) g.add(M(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), m, x, 0, z));
    g.add(M(new THREE.BoxGeometry(0.42, 0.72, 0.42), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, emissive: 0xff8a20, emissiveIntensity: 0.45, transparent: true, opacity: 0.4 })));
    g.add(M(new THREE.ConeGeometry(0.06, 0.18, 8), new THREE.MeshBasicMaterial({ color: 0xffd080 }), 0, -0.05, 0));
    const h = M(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI), m, 0, 0.6, 0); g.add(h);
    g.rotation.set(0.15, 0.6, 0); return g;
  },
};
function gearModel(it) {
  const col = it.stats?.elem ? EL_COL[it.stats.elem] : RAR_COL[it.rarity || 0];
  if (it.slot === 'cover') return book(0x6a3a22, null, col);
  if (it.slot === 'bookmark') {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.22, 1.2, 1, 12); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2.4) * 0.08); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: it.stats?.elem ? col : 0x7a1e24, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })));
    g.add(M(new THREE.BoxGeometry(0.28, 0.12, 0.05), gold(), 0, 0.62, 0), M(new THREE.SphereGeometry(0.05, 10, 8), gemMat(col), 0, 0.62, 0.04));
    g.rotation.set(0.1, 0.5, 0.2); return g;
  }
  if (it.slot === 'ring') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.07, 14, 40), gold()));
    const gm = M(new THREE.OctahedronGeometry(0.16, 0), gemMat(col), 0, 0.46, 0); gm.scale.y = 1.3; g.add(gm);
    g.add(M(new THREE.CylinderGeometry(0.13, 0.1, 0.08, 10), gold(), 0, 0.4, 0));
    g.rotation.set(-0.9, 0.3, 0.15); return g;
  }
  // 外套: 頭巾つきの裾広がりの布
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: it.stats?.elem ? new THREE.Color(col).multiplyScalar(0.7) : 0x3a3a4a, roughness: 0.95, side: THREE.DoubleSide });
  const prof = [[0.12, 0.55], [0.22, 0.4], [0.32, 0.0], [0.42, -0.4], [0.5, -0.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 24, 0, Math.PI * 1.75), cloth); body.rotation.y = Math.PI * 0.62; g.add(body);
  g.add(M(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth, 0, 0.6, -0.03));
  g.add(M(new THREE.SphereGeometry(0.05, 10, 8), gold(), 0, 0.45, 0.2));
  g.rotation.set(0.1, 0.4, 0); return g;
}

// 手に持つ時などに使う、道具の模型そのもの
export function itemModel(k) { const b = blender(k); if (b) { b.rotation.set(0, 0, 0); return b; } const g = MODELS[k]?.(); if (g) g.rotation.set(0, 0, 0); return g || null; }
export function equipmentModel(it){return it?(blenderGear(it)||gearModel(it)):null;}
function blenderIcon(k) {
  return blender(k);
}
function blenderGear(it) {
  const col = it.stats?.elem ? EL_COL[it.stats.elem] : RAR_COL[it.rarity || 0];
  const own = blender('gear_' + baseId(it)); if (own) return own; // それぞれの品の模型
  const key = { cover: 'cover', bookmark: 'bookmark', ring: 'ring' }[it.slot] || 'cloak';
  const o = blender(key); if (!o) return null;
  paint(o, 'gem', col, true);
  if (key === 'bookmark' && it.stats?.elem) paint(o, 'ribbon', col);
  if (key === 'cloak') paint(o, 'cloth', it.stats?.elem ? new THREE.Color(col).multiplyScalar(0.7).getHex() : 0x4a4a5a);
  if (key === 'cover' && it.stats?.elem) emblemOn(o, it.stats.elem);
  return o;
}
// 色の仕上げ: 彩度を落として古金色に寄せ、暗部を締め、細かな粒子と周辺の陰りを足す
let gradeCv = null;
function grade(src) {
  gradeCv ||= Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const g = gradeCv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, SIZE, SIZE); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, SIZE, SIZE), d = im.data, c = SIZE / 2;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = r * 0.3 + gg * 0.59 + b * 0.11;
    r = l + (r - l) * 0.72; gg = l + (gg - l) * 0.72; b = l + (b - l) * 0.72; // 彩度 -28%
    r = r * 1.04 + 0.01; gg = gg * 0.99; b = b * 0.86;                        // 古金色へ
    const k = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x) * 0.55 + x * 0.45; // 締まった明暗
    const p = (i >> 2), x = p % SIZE - c, y = (p / SIZE | 0) - c;
    const vig = 1 - Math.min(0.35, (x * x + y * y) / (c * c) * 0.32);
    const n = (Math.random() - 0.5) * 0.045;
    d[i] = Math.max(0, Math.min(255, (k(r) * vig + n) * 255));
    d[i + 1] = Math.max(0, Math.min(255, (k(gg) * vig + n) * 255));
    d[i + 2] = Math.max(0, Math.min(255, (k(b) * vig + n) * 255));
  }
  g.putImageData(im, 0, 0);
  return gradeCv.toDataURL('image/png');
}
// 模型を写して画像にする
function shoot(obj) {
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = 1.25 / Math.max(size.x, size.y, size.z, 0.01);
  const wrap = new THREE.Group(); obj.position.sub(c); wrap.add(obj); wrap.scale.setScalar(s);
  scene.add(wrap);
  cam.position.set(0, 0.35, 3.4); cam.lookAt(0, 0, 0);
  R.render(scene, cam);
  const url = grade(R.domElement);
  scene.remove(wrap);
  wrap.traverse(o => { if (o.userData.keep) return; o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
  return url;
}
// 道具の鍵(ether など) / 秘伝書 tome_fire / 装備品 から画像を返す。作れなければ null
export function icon3d(k) {
  if (cache.has(k)) return cache.get(k);
  if (!setup()) return null;
  let obj = null;
  obj = blenderIcon(k);
  if (!obj && k.startsWith('tome_')) obj = book(0x4a3020, k.slice(5));
  else if (!obj && MODELS[k]) obj = MODELS[k]();
  if (!obj) return null;
  const url = shoot(obj); cache.set(k, url); return url;
}
export function gear3d(it) {
  const key = `g:${baseId(it) || it.slot + ':' + (it.stats?.elem || '') + ':' + it.rarity}`;
  if (cache.has(key)) return cache.get(key);
  if (!setup()) return null;
  const url = shoot(blenderGear(it) || gearModel(it)); cache.set(key, url); return url;
}

// 先に少しずつ撮っておく(所持品を初めて開いた時に固まらないように)
export function warmIcons(extra = []) {
  const keys = ['ether', 'herb', 'crystal', 'bone', 'iron', 'scroll', 'frag', 'amulet', 'flash', 'lantern', ...['fire', 'ice', 'thunder', 'wind', 'holy', 'void'].map(e => 'tome_' + e)];
  const jobs = [...keys.map(k => () => icon3d(k)), ...extra.map(it => () => gear3d(it))];
  const step = () => { const j = jobs.shift(); if (!j) return; try { j(); } catch {} setTimeout(step, 120); };
  setTimeout(step, 3000);
}
