// 部屋の調度品: 書架・机・燭台・棺・骨・樽・木箱・像・折れた柱・瓦礫・石筍
// 部屋の主題(書庫/墓所/物置/祠/廃墟)ごとに置かれ、迷宮が「そこにあった場所」に見えるようにする
import * as THREE from 'three';
import { glowSprite } from './textures.js';

let M = null; // 共有の材質
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function mats() {
  if (M) return M;
  const wood = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3e2412'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${15 + Math.random() * 25},${8 + Math.random() * 10},0,${0.3 + Math.random() * 0.3})`; g.fillRect(0, y, w, 1 + Math.random() * 2); } });
  const spines = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#1a0f08'; g.fillRect(0, 0, w, h);
    let x = 2; const cols = ['#5a1a1a', '#2a3a5a', '#3a4a2a', '#5a4a2a', '#4a2a4a', '#6a5a3a', '#2a2a2a'];
    while (x < w - 8) { const bw = 10 + Math.random() * 16, bh = h * (0.7 + Math.random() * 0.28); g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(200,170,90,.6)'; g.fillRect(x + 2, h - bh + 8, bw - 4, 2); g.fillRect(x + 2, h - 12, bw - 4, 2); x += bw + 1 + (Math.random() < 0.1 ? 10 : 0); }
  });
  const stone = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6a645c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const v = Math.random() * 70; g.fillStyle = `rgba(${v},${v},${v},.16)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  M = {
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }),
    darkWood: new THREE.MeshStandardMaterial({ map: wood, color: 0x8a7a6a, roughness: 0.9 }),
    spines: new THREE.MeshStandardMaterial({ map: spines, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.8 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.5 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.4 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.95 }),
    flame: new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return M;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };

const BUILD = {
  shelf(m) {
    const g = new THREE.Group();
    g.add(box(1.7, 2.6, 0.5, m.wood, 0, 1.3, 0));
    for (let i = 0; i < 4; i++) {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.5), m.spines); front.position.set(0, 0.35 + i * 0.6, 0.26); g.add(front);
      g.add(box(1.6, 0.05, 0.46, m.darkWood, 0, 0.08 + i * 0.6 + 0.0, 0.03));
    }
    return { g, r: 0.6 };
  },
  desk(m) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.07, 0.8, m.wood, 0, 0.85, 0));
    for (const [x, z] of [[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]]) g.add(box(0.07, 0.85, 0.07, m.darkWood, x, 0.42, z));
    const book = box(0.5, 0.04, 0.34, m.paper, -0.15, 0.91, 0); book.rotation.y = 0.2; g.add(book);
    g.add(cyl(0.035, 0.04, 0.2, m.wax, 0.45, 0.99, -0.2, 8));
    const f = new THREE.Sprite(m.flame); f.position.set(0.45, 1.13, -0.2); f.scale.set(0.12, 0.2, 1); g.add(f);
    return { g, r: 0.7 };
  },
  books(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) { const b = box(0.32, 0.07, 0.24, i % 2 ? m.darkWood : m.wood, (Math.random() - 0.5) * 0.06, 0.035 + i * 0.07, (Math.random() - 0.5) * 0.06); b.rotation.y = Math.random() * 0.6; g.add(b); }
    return { g, r: 0 };
  },
  candles(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const h = 0.15 + Math.random() * 0.3, a = Math.random() * 6.28, d = Math.random() * 0.25;
      g.add(cyl(0.035, 0.045, h, m.wax, Math.cos(a) * d, h / 2, Math.sin(a) * d, 8));
      const f = new THREE.Sprite(m.flame); f.position.set(Math.cos(a) * d, h + 0.08, Math.sin(a) * d); f.scale.set(0.1, 0.16, 1); g.add(f);
    }
    return { g, r: 0, glow: true };
  },
  coffin(m) {
    const g = new THREE.Group();
    g.add(box(0.9, 0.6, 2.0, m.stone, 0, 0.3, 0));
    const lid = box(0.95, 0.12, 2.05, m.stone, 0.12, 0.66, 0.15); lid.rotation.y = 0.12; g.add(lid);
    return { g, r: 0.8 };
  },
  bones(m) {
    const g = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m.bone); skull.position.set(0, 0.1, 0); skull.scale.set(1, 0.9, 1.15); g.add(skull);
    for (let i = 0; i < 5; i++) { const b = cyl(0.02, 0.02, 0.3 + Math.random() * 0.2, m.bone, (Math.random() - 0.5) * 0.5, 0.03, (Math.random() - 0.5) * 0.5, 6); b.rotation.set(Math.PI / 2, 0, Math.random() * 3); g.add(b); }
    return { g, r: 0 };
  },
  barrel(m) {
    const g = new THREE.Group();
    g.add(cyl(0.34, 0.3, 0.95, m.wood, 0, 0.475, 0, 14));
    for (const y of [0.15, 0.8]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 6, 20), m.iron); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
    if (Math.random() < 0.4) { const b2 = cyl(0.34, 0.3, 0.95, m.wood, 0.75, 0.475, 0.1, 14); g.add(b2); }
    return { g, r: 0.45 };
  },
  crate(m) {
    const g = new THREE.Group();
    const s = 0.7 + Math.random() * 0.2;
    g.add(box(s, s, s, m.wood, 0, s / 2, 0));
    if (Math.random() < 0.5) { const c2 = box(s * 0.8, s * 0.8, s * 0.8, m.darkWood, 0.05, s + s * 0.4, 0); c2.rotation.y = 0.4; g.add(c2); }
    return { g, r: 0.5 };
  },
  statue(m) {
    const g = new THREE.Group();
    g.add(box(0.9, 0.5, 0.9, m.stone, 0, 0.25, 0));
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.18 + 0.2 * Math.pow(1 - t, 1.4), t * 1.7)); }
    const robe = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), m.stone); robe.position.y = 0.5; robe.castShadow = true; g.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m.stone); head.position.y = 2.32; g.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), m.stone); hood.position.y = 2.34; g.add(hood);
    return { g, r: 0.6 };
  },
  brokenPillar(m) {
    const g = new THREE.Group();
    g.add(cyl(0.38, 0.42, 1.2, m.stone, 0, 0.6, 0, 14));
    const fallen = cyl(0.36, 0.36, 1.8, m.stone, 0.9, 0.36, 0.4, 14); fallen.rotation.set(0, 0.5, Math.PI / 2); g.add(fallen);
    return { g, r: 0.55 };
  },
  rubble(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) { const s = 0.08 + Math.random() * 0.22; const o = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m.stone); o.position.set((Math.random() - 0.5) * 1.1, s * 0.6, (Math.random() - 0.5) * 1.1); o.rotation.set(Math.random() * 3, Math.random() * 3, 0); o.castShadow = true; g.add(o); }
    return { g, r: 0 };
  },
  oilbarrel(m) {
    const g = new THREE.Group();
    g.add(cyl(0.34, 0.3, 0.95, m.wood, 0, 0.475, 0, 14));
    const band = new THREE.MeshStandardMaterial({ color: 0x8a1a10, roughness: 0.6 });
    for (const y of [0.2, 0.75]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.03, 6, 20), band); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
    const drip = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.8 })); drip.rotation.x = -Math.PI / 2; drip.position.set(0.15, 0.015, 0.1); g.add(drip);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0.85 })); mark.position.set(0, 0.5, 0.335); g.add(mark);
    return { g, r: 0.42, hazard: 'oilbarrel' };
  },
  puddle(m) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75, depthWrite: false });
    const geo = new THREE.CircleGeometry(1.5, 28); const p = geo.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.75 + Math.random() * 0.35; p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
    const w = new THREE.Mesh(geo, mat); w.rotation.x = -Math.PI / 2; w.position.y = 0.02; g.add(w);
    return { g, r: 0, hazard: 'puddle', mat, hr: 1.4 };
  },
  crack(m) {
    const g = new THREE.Group();
    const decal = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.7, depthWrite: false })); decal.rotation.x = Math.PI / 2; decal.position.y = 5.15; g.add(decal);
    for (let i = 0; i < 7; i++) { const h = 0.3 + Math.random() * 0.8; const c = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.12, h, 6), m.stone); c.rotation.x = Math.PI; c.position.set((Math.random() - 0.5) * 2, 5.2 - h / 2, (Math.random() - 0.5) * 2); g.add(c); }
    // 床に落ちた小石が、崩れそうなことを教える
    for (let i = 0; i < 6; i++) { const s = 0.04 + Math.random() * 0.06; const o = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m.stone); o.position.set((Math.random() - 0.5) * 1.6, s * 0.6, (Math.random() - 0.5) * 1.6); g.add(o); }
    return { g, r: 0, hazard: 'crack' };
  },
  stalagmite(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) { const h = 0.6 + Math.random() * 1.4; const o = new THREE.Mesh(new THREE.ConeGeometry(0.18 + h * 0.08, h, 7), m.stone); o.position.set((Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5); o.castShadow = true; g.add(o); }
    return { g, r: 0.3 };
  },
};

// 調度品を置き、ぶつかる物は dg.solids に円として登録する
export function buildDecor(dg, group) {
  const m = mats();
  dg.solids = [];
  dg.candleGlows = [];
  dg.hazards = [];
  for (const d of dg.decor || []) {
    const b = BUILD[d.type]?.(m); if (!b) continue;
    b.g.position.copy(d.pos); b.g.rotation.y = d.rot; b.g.scale.setScalar(d.s || 1);
    group.add(b.g);
    let solid = null;
    if (b.r) dg.solids.push(solid = { x: d.pos.x, z: d.pos.z, r: b.r * (d.s || 1) });
    if (b.hazard) dg.hazards.push({ type: b.hazard, pos: d.pos.clone(), group: b.g, alive: true, r: (b.hr || 1) * (d.s || 1), mat: b.mat, solid });
    if (b.glow) dg.candleGlows.push(d.pos.clone().setY(0.4));
  }
}
