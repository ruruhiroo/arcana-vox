// 迷宮に落ちている物の見た目: 古文書・霊草・魔晶・宝箱・戦利品
// それぞれ userData.animate(dt, t) を持ち、毎フレーム呼ばれる
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './textures.js';
import { G } from './state.js';
import { itemModel } from './icons3d.js';
// Blender の模型の中から名前で部品を探す(書き出しで lid → lid001 のように番号が付くことがある)
const part = (o, name) => { let hit = null; const re = new RegExp('^' + name + '(_?\\.?\\d+)?$'); o.traverse(x => { if (!hit && re.test(x.name)) hit = x; }); return hit; };
// ときどき小さくきらめく(見つけやすさのため。光の輪や浮遊はしない)
function glint(pos, color, dt, rate = 0.6) { if (G.particles && Math.random() < dt * rate) G.particles.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.15, (Math.random() - 0.5) * 0.3)), new THREE.Vector3(0, 0.25, 0), color, 0.07, 0.9); }

const GLOW = glowSprite();
const rnd = (a, b) => a + Math.random() * (b - a);
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const glowSprite3 = (color, s, op = 0.7) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: op })); sp.scale.setScalar(s); return sp; };

// ---- 共有の質感 ----
const woodTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4a2c14'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${20 + Math.random() * 30},${10 + Math.random() * 15},0,${0.25 + Math.random() * 0.3})`; g.fillRect(0, y, w, 1 + Math.random() * 2); }
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(20,8,0,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, (i + 0.5) * h / 6); g.lineTo(w, (i + 0.5) * h / 6); g.stroke(); } // 板の継ぎ目
  for (let i = 0; i < 8; i++) { const x = Math.random() * w, y = Math.random() * h; g.strokeStyle = 'rgba(30,12,0,.5)'; g.beginPath(); g.ellipse(x, y, 10, 3, 0, 0, Math.PI * 2); g.stroke(); }
});
const ironMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.85, roughness: 0.45 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.9, roughness: 0.3 });
const stoneTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5a554e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) { const v = Math.random() * 60; g.fillStyle = `rgba(${v},${v},${v},.18)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = 'rgba(20,18,15,.6)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(Math.random() * w, 0); g.lineTo(Math.random() * w, h); g.stroke(); }
});
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });

// ---- 古文書: 彫りのある台座に、半ば開いた巻物が浮かぶ ----
const parchTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#ead8ae'; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(110,70,20,.5)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150,60,10,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 70, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 54, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 54, h / 2 + Math.sin(a) * 54); g.lineTo(w / 2 + Math.cos(a + 2.51) * 54, h / 2 + Math.sin(a + 2.51) * 54); g.stroke(); }
  g.strokeStyle = 'rgba(40,25,10,.7)'; g.lineWidth = 2;
  for (const x0 of [30, 340]) for (let y = 40; y < h - 30; y += 18) { let x = x0; while (x < x0 + 140) { const l = 6 + Math.random() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke(); x += l + 5; } }
});
function makeScroll() {
  const g = new THREE.Group();
  // 崩れた石材と瓦礫
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.55), stoneMat); slab.position.y = 0.11; slab.rotation.set(0, 0.2, 0.04); slab.castShadow = slab.receiveShadow = true;
  g.add(slab);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.04, 0.11), 0), stoneMat); const a = rnd(0, 6.28), d = rnd(0.45, 0.7); r.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); r.rotation.set(rnd(0, 3), rnd(0, 3), 0); g.add(r); }
  // 巻物(石の上に横たわる)
  const scroll = new THREE.Group();
  const sheetGeo = new THREE.PlaneGeometry(0.46, 0.3, 12, 1);
  const pos = sheetGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin((x / 0.46 + 0.5) * Math.PI) * 0.015); }
  sheetGeo.computeVertexNormals();
  const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshStandardMaterial({ map: parchTex, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x2a1a08, emissiveMap: parchTex, emissiveIntensity: 0.25 }));
  sheet.rotation.x = -Math.PI / 2; sheet.position.x = 0.06;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 14), new THREE.MeshStandardMaterial({ color: 0xd8c496, roughness: 0.9 })); roll.rotation.x = Math.PI / 2; roll.position.set(-0.2, 0.04, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 })); rod.rotation.x = Math.PI / 2; rod.position.set(-0.2, 0.04, 0);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14), new THREE.MeshStandardMaterial({ color: 0x7a1018, roughness: 0.4 })); seal.position.set(0.2, 0.012, 0.08);
  scroll.add(sheet, roll, rod, seal); scroll.position.y = 0.225; scroll.rotation.y = rnd(-0.6, 0.6);
  g.add(scroll);
  const lamp = glowSprite3(0xffc070, 0.5, 0.18); lamp.position.y = 0.3; g.add(lamp);
  const at = new THREE.Vector3();
  g.userData.animate = (dt, t) => { lamp.material.opacity = 0.14 + Math.sin(t * 1.7) * 0.05; glint(g.getWorldPosition(at).setY(0.3), 0xffd890, dt, 0.8); };
  return g;
}

// ---- 霊草: 苔むした土に、葉脈の光る葉と光る蕾 ----
const leafTex = canvasTex(128, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#2f7a34'; g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(-10, h * 0.6, w * 0.2, h * 0.1, w / 2, 0); g.bezierCurveTo(w * 0.8, h * 0.1, w + 10, h * 0.6, w / 2, h); g.fill();
  g.strokeStyle = '#b8ffa0'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 10); g.stroke();
  g.lineWidth = 1.5; for (let y = 40; y < h - 20; y += 26) { g.beginPath(); g.moveTo(w / 2, y + 14); g.lineTo(w * 0.2, y); g.moveTo(w / 2, y + 14); g.lineTo(w * 0.8, y); g.stroke(); }
});
function makeHerb() {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e2618, roughness: 1 }));
  mound.scale.y = 0.35; g.add(mound);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0x3a5a22, roughness: 1 })); moss.scale.y = 0.3; g.add(moss);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.05, 0.09), 0), stoneMat); const a = rnd(0, 6.28); r.position.set(Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3); g.add(r); }
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x1a5a1a, emissiveMap: leafTex, emissiveIntensity: 0.5 });
  const leaves = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const geo = new THREE.PlaneGeometry(0.16, 0.42, 1, 6); geo.translate(0, 0.21, 0);
    const p = geo.attributes.position; for (let j = 0; j < p.count; j++) { const y = p.getY(j); p.setZ(j, y * y * 0.9); } // 外へ反る
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, leafMat); leaf.rotation.y = i / 7 * Math.PI * 2 + rnd(-0.2, 0.2); leaf.rotation.x = -rnd(0.1, 0.35); leaf.position.y = 0.08;
    leaves.add(leaf);
  }
  g.add(leaves);
  const budMat = new THREE.MeshStandardMaterial({ color: 0xc8ffa0, emissive: 0x5aa040, emissiveIntensity: 0.6 });
  const buds = [];
  for (let i = 0; i < 3; i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0x3a6a2a })); const a = i * 2.1;
    stem.position.set(Math.cos(a) * 0.05, 0.3, Math.sin(a) * 0.05); stem.rotation.set(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2); g.add(stem);
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), budMat); bud.position.set(Math.cos(a) * 0.1, 0.54, Math.sin(a) * 0.1); bud.scale.y = 1.3;
    const bg = glowSprite3(0x9aff7a, 0.22, 0.35); bg.position.copy(bud.position);
    g.add(bud, bg); buds.push(bg);
  }
  g.userData.animate = (dt, t) => {
    leaves.rotation.y = Math.sin(t * 0.8) * 0.06;
    buds.forEach((b, i) => { b.material.opacity = 0.25 + Math.sin(t * 1.6 + i * 2) * 0.1; });
  };
  return g;
}

// ---- 魔晶: 岩から伸びる六角柱の結晶の群れ ----
function makeCrystal() {
  const g = new THREE.Group();
  const lean = new THREE.Group(); g.add(lean); g.userData.lean = lean; // 壁から離れる向きへ傾ける
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x86c4ff, emissive: 0x2050c0, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.9, flatShading: true });
  // 根元: 床に埋もれた小石と砕けた欠片
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.04, 0.1), 0), stoneMat); const a = rnd(0, 6.28), d = rnd(0.12, 0.34); r.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); r.scale.y = 0.6; g.add(r); }
  // 結晶: 大きい柱が数本と、まわりに小さな柱。長さも太さも角度もばらばら
  const n = 7 + Math.floor(rnd(0, 4));
  for (let i = 0; i < n; i++) {
    const big = i < 2;
    const h = big ? rnd(0.55, 0.95) : rnd(0.14, 0.42), r = big ? rnd(0.06, 0.095) : rnd(0.025, 0.05);
    const geo = new THREE.CylinderGeometry(r * 0.92, r, h, 6); geo.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r * 0.92, r * rnd(1.6, 2.6), 6); tip.translate(0, h + r * 1.0, 0);
    const prism = new THREE.Mesh(geo, mat), point = new THREE.Mesh(tip, mat);
    const s = new THREE.Group(); s.add(prism, point);
    const a = rnd(0, 6.28), d = big ? rnd(0, 0.06) : rnd(0.06, 0.24);
    s.position.set(Math.cos(a) * d, -0.02, Math.sin(a) * d * 0.7);
    // 外側の柱ほど外へ開く
    const tilt = big ? rnd(0.05, 0.25) : rnd(0.35, 0.9);
    s.rotation.set(Math.sin(a) * tilt, rnd(0, 1), -Math.cos(a) * tilt);
    lean.add(s);
  }
  const glow = glowSprite3(0x5aa0ff, 0.9, 0.16); glow.position.y = 0.35; lean.add(glow);
  g.userData.animate = (dt, t) => { mat.emissiveIntensity = 0.55 + Math.sin(t * 1.3) * 0.15; glow.material.opacity = 0.12 + Math.sin(t * 1.3) * 0.04; };
  return g;
}

// ---- 灯り茸: 湿った床に群れて生える、ほのかに光る茸。摘むと魔力が少し戻る ----
function makeMushroom(odd = false) {
  const g = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 });
  const hue = odd ? [0xc060ff, 0x6a20a0] : Math.random() < 0.5 ? [0x7ad8ff, 0x2a90c0] : [0x9affb0, 0x30a060];
  const capMat = new THREE.MeshStandardMaterial({ color: hue[0], emissive: hue[1], emissiveIntensity: 0.9, roughness: 0.5 });
  const gillMat = new THREE.MeshBasicMaterial({ color: hue[0] });
  const n = 4 + Math.floor(rnd(0, 4));
  const caps = [];
  for (let i = 0; i < n; i++) {
    const big = i === 0, h = big ? rnd(0.22, 0.32) : rnd(0.08, 0.2), cr = big ? rnd(0.09, 0.13) : rnd(0.035, 0.07);
    const m = new THREE.Group();
    const stemGeo = new THREE.CylinderGeometry(cr * 0.22, cr * 0.32, h, 7); stemGeo.translate(0, h / 2, 0);
    const p = stemGeo.attributes.position; for (let j = 0; j < p.count; j++) { const y = p.getY(j); p.setX(j, p.getX(j) + Math.sin(y * 9) * 0.008); } // 少し曲がる
    stemGeo.computeVertexNormals();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.scale.y = 0.55; cap.position.y = h;
    const gill = new THREE.Mesh(new THREE.CircleGeometry(cr * 0.95, 12), gillMat); gill.rotation.x = Math.PI / 2; gill.position.y = h - 0.002;
    m.add(new THREE.Mesh(stemGeo, stemMat), cap, gill);
    if (odd) for (let k = 0; k < 6; k++) { const dot = new THREE.Mesh(new THREE.SphereGeometry(cr * 0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0ff })); const a = Math.random() * 6.28, el = 0.3 + Math.random() * 0.9; dot.position.set(Math.cos(a) * Math.cos(el) * cr, h + Math.sin(el) * cr * 0.55, Math.sin(a) * Math.cos(el) * cr); m.add(dot); }
    const a = rnd(0, 6.28), d = big ? 0 : rnd(0.06, 0.22);
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.set(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25));
    g.add(m); caps.push(cap);
  }
  const glow = glowSprite3(hue[0], 0.8, 0.2); glow.position.y = 0.18; g.add(glow);
  g.userData.animate = (dt, t) => { capMat.emissiveIntensity = 0.75 + Math.sin(t * 0.9) * 0.2; glint(g.position.clone().setY(g.position.y + 0.25), hue[0], dt, 0.35); };
  return g;
}

// ---- 宝箱: 板張りの箱に鉄の帯と鋲、錠前、丸い蓋。蓋は後ろの蝶番で開く ----
function makeChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
  const W = 1.0, D = 0.62, H = 0.5;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 2, 0.03), wood); body.position.y = H / 2 + 0.06; body.castShadow = true; body.receiveShadow = true;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), ironMat); foot.position.set(sx * (W / 2 - 0.06), 0.035, sz * (D / 2 - 0.06)); g.add(foot); }
  // 鉄の帯と鋲
  for (const x of [-0.32, 0.32]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, H + 0.02, D + 0.02), ironMat); strap.position.set(x, H / 2 + 0.06, 0); g.add(strap);
    for (const y of [0.15, 0.38]) for (const z of [-1, 1]) { const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), brassMat); rivet.position.set(x, y + 0.06, z * (D / 2 + 0.012)); g.add(rivet); }
  }
  const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.04, D + 0.02), ironMat); rim.position.y = H + 0.06; g.add(rim);
  // 蓋: 蝶番(後ろの縁)を軸に回る
  const lid = new THREE.Group(); lid.position.set(0, H + 0.08, -D / 2);
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI), wood);
  lidMesh.rotation.z = Math.PI / 2; lidMesh.position.z = D / 2; lid.add(lidMesh);
  for (const x of [-0.32, 0.32]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.07, 16, 1, true, 0, Math.PI), ironMat); b.material = ironMat; b.rotation.z = Math.PI / 2; b.position.set(x, 0, D / 2); lid.add(b); }
  g.add(body, lid);
  // 錠前と鍵穴
  const lock = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.16, 0.04, 2, 0.01), brassMat); lock.position.set(0, H - 0.02, D / 2 + 0.02);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.rotation.x = Math.PI / 2; hole.position.set(0, H - 0.02, D / 2 + 0.042);
  g.add(lock, hole);
  // 隙間から漏れる光と、中の宝の輝き(開くと見える)
  const seep = glowSprite3(0xffc860, 1.0, 0.16); seep.position.set(0, H + 0.12, 0); seep.scale.set(1.4, 0.45, 1);
  const treasure = glowSprite3(0xffd76a, 0.9, 0); treasure.position.set(0, H + 0.1, 0);
  // 中身: 金貨の山と散らばった金貨、宝石、杯 (開くと見える)
  const coins = new THREE.Group(); coins.visible = false;
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.85, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  pile.scale.set(1.15, 0.32, 0.62); pile.position.y = H + 0.06; coins.add(pile);
  const coinGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.008, 12);
  for (let i = 0; i < 34; i++) {
    const c = new THREE.Mesh(coinGeo, gold); const a = rnd(0, 6.28), d = Math.sqrt(Math.random());
    const x = Math.cos(a) * d * 0.42, z = Math.sin(a) * d * 0.24;
    const top = 0.13 * Math.max(0, 1 - (x * x) / 0.21 - (z * z) / 0.058);
    c.position.set(x, H + 0.07 + Math.sqrt(Math.max(0, top)) * 0.35 + rnd(0, 0.01), z); c.rotation.set(rnd(-0.6, 0.6), rnd(0, 3), rnd(-0.6, 0.6)); coins.add(c);
  }
  const gemCols = [0xff3050, 0x40a0ff, 0x40e080, 0xc060ff];
  for (let i = 0; i < 4; i++) {
    const col = gemCols[i % gemCols.length];
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.035, 0.055), 0), new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.05, clearcoat: 1 }));
    gem.position.set(rnd(-0.3, 0.3), H + 0.16 + rnd(0, 0.04), rnd(-0.12, 0.12)); gem.rotation.set(rnd(0, 3), rnd(0, 3), 0); gem.scale.y = 1.4; coins.add(gem);
  }
  const cup = new THREE.Group();
  const bowlG = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.09, 12, 1, true), gold); bowlG.position.y = 0.16; bowlG.material.side = THREE.DoubleSide;
  const stemG = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), gold); stemG.position.y = 0.07;
  const footG = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.015, 12), gold); footG.position.y = 0.01;
  cup.add(bowlG, stemG, footG); cup.position.set(0.3, H + 0.08, 0.05); cup.rotation.z = -0.35; coins.add(cup);
  g.add(seep, treasure, coins);
  let open = 0, opening = false;
  g.userData.lid = lid; g.userData.seep = seep;
  g.userData.open = () => { opening = true; coins.visible = true; };
  g.userData.animate = (dt, t) => {
    if (opening && open < 1) { open = Math.min(1, open + dt * 2.2); lid.rotation.x = -1.9 * (1 - Math.pow(1 - open, 3)); treasure.material.opacity = 0.3 * open; seep.visible = false; }
    else if (!opening) seep.material.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
    else treasure.material.opacity = 0.22 + Math.sin(t * 3) * 0.06;
  };
  return g;
}

// Blender で作った宝箱(板張りの木箱・豪華な漆塗りの箱)。蓋は後ろの蝶番で開く
function makeBlenderChest(data) {
  const m = itemModel(data?.rich ? 'chest_rich' : 'chest');
  if (!m) return null;
  const lid = part(m, 'lid'), treasure = part(m, 'treasure');
  if (!lid) return null;
  const g = new THREE.Group(); g.add(m);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material.side = THREE.DoubleSide; } }); // 薄い帯の裏が抜けて見えないように
  if (treasure) treasure.visible = false;
  const H = 0.57;
  const seep = glowSprite3(data?.rich ? 0xffa0a0 : 0xffc860, 1.0, 0.16); seep.position.set(0, H + 0.06, 0); seep.scale.set(1.4, 0.45, 1);
  const shine = glowSprite3(0xffd76a, 0.9, 0); shine.position.set(0, H + 0.1, 0);
  g.add(seep, shine);
  let open = 0, opening = false;
  g.userData.lid = lid; g.userData.seep = seep;
  g.userData.open = () => { opening = true; if (treasure) treasure.visible = true; };
  g.userData.animate = (dt, t) => {
    if (opening && open < 1) { open = Math.min(1, open + dt * 2.2); lid.rotation.x = -1.9 * (1 - Math.pow(1 - open, 3)); shine.material.opacity = 0.3 * open; seep.visible = false; }
    else if (!opening) seep.material.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
    else shine.material.opacity = 0.22 + Math.sin(t * 3) * 0.06;
  };
  return g;
}

// ---- 戦利品: 素材ごとの形が宙に浮き、床に光の輪 ----
function makeLoot(mat, color) {
  const g = new THREE.Group();
  const item = new THREE.Group(); item.position.y = 0.55; g.add(item);
  if (mat === 'bone') {
    const m = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), m); shaft.rotation.z = Math.PI / 2; item.add(shaft);
    for (const s of [-1, 1]) for (const k of [-1, 1]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m); knob.position.set(s * 0.16, k * 0.03, 0); item.add(knob); }
  } else if (mat === 'iron') {
    const ingot = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.08, 0.12, 2, 0.015), new THREE.MeshStandardMaterial({ color: 0x8a8a96, metalness: 0.9, roughness: 0.35 })); item.add(ingot);
  } else if (mat === 'crystal') {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshPhysicalMaterial({ color: 0x7ac0ff, emissive: 0x2a70ff, emissiveIntensity: 1.2, roughness: 0.05, clearcoat: 1 })); c.scale.y = 1.8; item.add(c);
  } else if (mat === 'herb') {
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.22), new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x1a5a1a })); l.rotation.set(0, i * 2.1, (i - 1) * 0.4); item.add(l); }
  } else if (mat === 'scroll') {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0xe0cc9c, emissive: 0x4a3010 })); r.rotation.z = Math.PI / 2; item.add(r);
    const sl = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 5, 12), new THREE.MeshStandardMaterial({ color: 0x8a1018 })); sl.rotation.y = Math.PI / 2; item.add(sl);
  } else {
    item.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })));
  }
  item.position.y = 0.05; item.rotation.set(rnd(-0.2, 0.2), rnd(0, 6.28), Math.PI / 2 * (mat === 'bone' || mat === 'scroll' ? 0 : 0));
  if (mat === 'crystal') { item.rotation.z = Math.PI / 2 - 0.3; item.position.y = 0.09; }
  if (mat === 'herb') item.rotation.x = -Math.PI / 2 + 0.2;
  const shine = glowSprite3(color, 0.35, 0.12); shine.position.y = 0.1; g.add(shine);
  const at = new THREE.Vector3();
  g.userData.animate = (dt, t) => { shine.material.opacity = 0.08 + Math.max(0, Math.sin(t * 2 + item.rotation.y * 3)) * 0.12; glint(g.getWorldPosition(at).setY(0.12), color, dt, 0.9); };
  return g;
}

export function makePickupMesh(kind, data = {}, matColors = {}) {
  if (kind === 'scroll') return makeScroll();
  if (kind === 'herb') return makeHerb();
  if (kind === 'crystal') return makeCrystal();
  if (kind === 'mushroom') return makeMushroom();
  if (kind === 'oddshroom') return makeMushroom(true);
  if (kind === 'chest') return makeBlenderChest(data) || makeChest();
  return makeLoot(data.mat, matColors[data.mat] || 0xffffff);
}