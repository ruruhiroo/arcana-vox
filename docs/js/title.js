// タイトル画面の背景: 沈んだ「声の学院」の大書庫。書見台の上に魔導書が浮き、床の魔法陣が回り、
// 列柱の奥の闇に、守護者(炎鱗竜)の影が息づいている。ロビーが見えている間だけ描く。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { glowSprite, runeCircleTex } from './textures.js';

let R = null, scene, cam, raf = 0, t0 = 0, parts = {}, mouse = { x: 0, y: 0 }, cv = null;

function load(name) {
  return new Promise(res => new GLTFLoader().load(`models/${name}.glb`, g => {
    g.scene.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; const m = o.material; m.envMapIntensity = 0; if (m.metalnessMap) m.metalness = 0.55; if (m.name === 'eye') m.emissiveIntensity = 2.2; });
    res(g.scene);
  }, undefined, () => res(null)));
}
const tex = (file, rep, srgb = true) => { const t = new THREE.TextureLoader().load('textures/' + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const glow = (color, size, opacity = 0.8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity })); s.scale.setScalar(size); return s; };

async function build() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07040c, 0.03);
  scene.background = new THREE.Color(0x050308);
  cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  scene.add(new THREE.HemisphereLight(0x39305a, 0x0a0604, 0.55));
  const moon = new THREE.DirectionalLight(0x6a78c8, 0.5); moon.position.set(-4, 9, -6); scene.add(moon);
  // 濡れた石の床
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex('floor_color.jpg', 22), normalMap: tex('floor_normal.jpg', 22, false), roughness: 0.42, metalness: 0.15, color: 0x8a8490 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // 魔法陣(床)と、立ちのぼる光
  const circle = (r, color, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: runeCircleTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, -3); scene.add(m); return m; };
  parts.c1 = circle(3.4, 0xffc070, 0.75); parts.c2 = circle(2.1, 0xff8a40, 0.55); parts.c2.position.y = 0.05;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.5, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.set(0, 4.5, -3); scene.add(shaft); parts.shaft = shaft;
  // 魔導書の灯り
  const lamp = new THREE.PointLight(0xffb064, 26, 22, 1.7); lamp.position.set(0, 2.5, -2.6); scene.add(lamp); parts.lamp = lamp;
  parts.bookGlow = glow(0xffb060, 3.2, 0.55); parts.bookGlow.position.set(0, 1.9, -3); scene.add(parts.bookGlow);
  // 奥の守護者の胸の火
  const ember = new THREE.PointLight(0xff4a18, 60, 42, 1.5); ember.position.set(0, 7.5, -16.5); scene.add(ember); parts.ember = ember;
  parts.emberGlow = glow(0xff3a10, 13, 0.3); parts.emberGlow.position.set(0, 7.5, -19.5); scene.add(parts.emberGlow);
  // 舞い上がる光の粒
  const N = 500, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = Math.random() * 9; pos[i * 3 + 2] = -Math.random() * 30 + 4; seed[i] = Math.random(); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  parts.motes = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowSprite(), color: 0xffc888, size: 0.13, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  parts.motes.userData.seed = seed; scene.add(parts.motes);

  // 模型: 列柱・書架・書見台・魔導書・守護者(読み込めた物から置く)
  const [pillar, shelf, lectern, book, dragon] = await Promise.all(['decor-pillar', 'decor-wallshelf', 'decor-lectern', 'fp-grimoire', 'guardian-dragon'].map(load));
  if (!scene) return;
  if (pillar) for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) { const p = SkeletonUtils.clone(pillar); p.position.set(sx * 5.2, 0, 1.5 - i * 6); p.rotation.y = i * 1.3; scene.add(p); if (i % 2 === 0) { const f = glow(0xff9a40, 0.9, 0.9); f.position.set(sx * 4.3, 2.6, 1.5 - i * 6); scene.add(f); (parts.flames ||= []).push(f); } }
  if (shelf) for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) { const s = SkeletonUtils.clone(shelf); s.position.set(sx * 8.6, 0, 2 - i * 4); s.rotation.y = -sx * Math.PI / 2; scene.add(s); }
  if (lectern) { lectern.position.set(0, 0, -3); lectern.scale.setScalar(1.15); scene.add(lectern); }
  if (book) {
    book.traverse(o => { if (o.isMesh && o.material.name === 'tint') { o.material = o.material.clone(); o.material.color.set('#5c1610').multiplyScalar(1.7); } });
    const g = new THREE.Group(); g.add(book); book.scale.setScalar(3.2);
    // 頁(光を帯びた羊皮紙)
    for (const sd of [-1, 1]) { const pgm = new THREE.Mesh(new THREE.PlaneGeometry(0.15 * 3.2, 0.21 * 3.2), new THREE.MeshBasicMaterial({ color: 0xe6d2a4 })); pgm.position.set(sd * 0.075 * 3.2, 0, 0.03); pgm.rotation.y = sd * -0.2; g.add(pgm); }
    g.position.set(0, 1.95, -3); g.rotation.x = -0.75; scene.add(g); parts.book = g;
  }
  if (dragon) { dragon.position.set(0, 0, -21); dragon.scale.setScalar(1.7); scene.add(dragon); parts.dragon = dragon; }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!R || !scene || document.hidden) return;
  const t = (now - t0) / 1000, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * R.getPixelRatio()) || cv.height !== Math.round(h * R.getPixelRatio())) R.setSize(w, h, false);
  cam.aspect = w / h;
  // 書庫の軸を画面の左寄りに置く(右半分は支度の欄)
  const wide = w > 900;
  if (wide) cam.setViewOffset(w * 1.42, h, w * 0.42, 0, w, h); else cam.clearViewOffset();
  cam.updateProjectionMatrix();
  cam.position.set(Math.sin(t * 0.13) * 0.5 + mouse.x * 0.35, 1.75 + Math.sin(t * 0.21) * 0.08 - mouse.y * 0.15, 6.2 + Math.sin(t * 0.09) * 0.4);
  cam.lookAt(mouse.x * 0.2, 3.5, -8);
  if (parts.c1) { parts.c1.rotation.z = t * 0.12; parts.c2.rotation.z = -t * 0.22; parts.c1.material.opacity = 0.6 + Math.sin(t * 1.3) * 0.15; }
  if (parts.book) { parts.book.position.y = 1.95 + Math.sin(t * 0.9) * 0.07; parts.book.rotation.z = Math.sin(t * 0.5) * 0.05; parts.book.rotation.y = Math.sin(t * 0.37) * 0.12; }
  const fl = 0.85 + Math.sin(t * 9.1) * 0.06 + Math.sin(t * 23.7) * 0.04;
  if (parts.lamp) { parts.lamp.intensity = 26 * fl; parts.bookGlow.material.opacity = 0.5 * fl; parts.bookGlow.position.y = parts.book ? parts.book.position.y : 1.9; }
  if (parts.ember) { parts.ember.intensity = 90 + Math.sin(t * 0.8) * 60; parts.emberGlow.material.opacity = 0.22 + Math.sin(t * 0.8) * 0.12; }        // 眠る守護者の息
  if (parts.dragon) parts.dragon.position.y = Math.sin(t * 0.8) * 0.12;
  for (const [i, f] of (parts.flames || []).entries()) f.scale.setScalar(0.85 + Math.sin(t * 11 + i * 2.1) * 0.12);
  if (parts.motes) {
    const p = parts.motes.geometry.attributes.position, sd = parts.motes.userData.seed;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + (0.004 + sd[i] * 0.008); if (y > 9) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.6 + sd[i] * 40) * 0.002); }
    p.needsUpdate = true;
  }
  R.render(scene, cam);
}

export function startTitle() {
  const lobby = document.getElementById('lobby');
  if (!lobby || R) return;
  try {
    cv = document.createElement('canvas'); cv.id = 'titleBg'; lobby.prepend(cv);
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15; R.outputColorSpace = THREE.SRGBColorSpace;
  } catch { cv?.remove(); R = null; return; }
  lobby.classList.add('has3d');
  addEventListener('mousemove', e => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; });
  t0 = performance.now();
  build();
  raf = requestAnimationFrame(frame);
  // ロビーが隠れたら止めて片付ける(ゲーム本体に描画の力を渡す)
  new MutationObserver(() => { if (lobby.classList.contains('hidden')) stopTitle(); }).observe(lobby, { attributes: true, attributeFilter: ['class'] });
}
export function stopTitle() {
  if (!R) return;
  cancelAnimationFrame(raf);
  scene?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) { m.map?.dispose?.(); m.normalMap?.dispose?.(); m.dispose?.(); } });
  R.dispose(); R.forceContextLoss?.(); cv?.remove(); R = null; scene = null; parts = {};
  document.getElementById('lobby')?.classList.remove('has3d');
}
export const titleDebug = () => ({ scene, cam, parts, R });
