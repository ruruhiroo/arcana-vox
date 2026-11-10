// 部屋の調度品: 書架・机・燭台・棺・骨・樽・木箱・像・折れた柱・瓦礫・石筍
// 部屋の主題(書庫/墓所/物置/祠/廃墟)ごとに置かれ、迷宮が「そこにあった場所」に見えるようにする
import * as THREE from 'three';
import { glowSprite } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 同じ材質の箱を一つの形にまとめる(壁一面の書架などを軽く描くため)
// parts: [[材質の名, 幅, 高さ, 奥行き, x, y, z, 回転y?], ...]
function merged(m, parts) {
  const by = {};
  for (const [mat, w, h, d, x, y, z, ry = 0] of parts) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    (by[mat] ||= []).push(geo.toNonIndexed());
  }
  const g = new THREE.Group();
  for (const [mat, geos] of Object.entries(by)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m[mat]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  return g;
}
const CELLW = 4; // 迷宮の一マス

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

  // ======== 追加の主題の調度品 ========
  // 牢獄: 壁から少し離れた鉄格子で、独房の区画を作る
  cellbars(m) {
    const W = CELLW - 0.04, H = 3.2, parts = [];
    for (let i = 0; i <= 14; i++) parts.push(['iron', 0.05, H, 0.05, -W / 2 + i * W / 14, H / 2, 0]);
    parts.push(['iron', W, 0.08, 0.08, 0, H, 0], ['iron', W, 0.08, 0.08, 0, 0.06, 0], ['iron', W, 0.05, 0.05, 0, H * 0.55, 0]);
    const g = merged(m, parts);
    // 格子の奥に藁と鎖
    const straw = m.straw ||= new THREE.MeshStandardMaterial({ color: 0x9a8040, roughness: 1 });
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10), straw); s.rotation.x = -Math.PI / 2; s.position.set((Math.random() - 0.5) * 2, 0.02, -0.7); g.add(s);
    for (let k = 0; k < 2; k++) g.add(cyl(0.02, 0.02, 1.0, m.iron, -1 + k * 2, 2.2, -1.25, 5));
    return { g, r: 0 };
  },
  chains(m) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const len = 1.5 + Math.random() * 2; const c = cyl(0.025, 0.025, len, m.iron, (Math.random() - 0.5) * 1.6, 6.3 - len / 2, (Math.random() - 0.5) * 1.6, 5); g.add(c); const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), m.iron); cuff.position.set(c.position.x, 6.3 - len, c.position.z); g.add(cuff); }
    return { g, r: 0 };
  },
  shackles(m) {
    const g = merged(m, [['iron', 0.5, 0.06, 0.06, 0, 1.8, 0.05], ['iron', 0.08, 0.08, 0.08, -0.25, 1.8, 0.05], ['iron', 0.08, 0.08, 0.08, 0.25, 1.8, 0.05]]);
    for (const x of [-0.25, 0.25]) { g.add(cyl(0.015, 0.015, 0.5, m.iron, x, 1.55, 0.08, 4)); const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), m.iron); cuff.position.set(x, 1.28, 0.08); g.add(cuff); }
    return { g, r: 0 };
  },
  // 錬金工房: 光る大釜、薬瓶の棚、蒸留器の作業台
  cauldron(m) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), m.iron); pot.position.y = 0.75; pot.material.side = THREE.DoubleSide; g.add(pot);
    const brew = m.brew ||= new THREE.MeshStandardMaterial({ color: 0x40d070, emissive: 0x20a050, emissiveIntensity: 1.2, roughness: 0.3 });
    const liq = new THREE.Mesh(new THREE.CircleGeometry(0.58, 16), brew); liq.rotation.x = -Math.PI / 2; liq.position.y = 1.05; g.add(liq);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; g.add(cyl(0.05, 0.05, 0.5, m.iron, Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5, 5)); }
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false })); fire.position.y = 0.2; fire.scale.set(1.0, 0.5, 1); g.add(fire);
    const steam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0x80ffa0, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 })); steam.position.y = 1.5; steam.scale.set(1.4, 1.0, 1); g.add(steam);
    return { g, r: 0.8, glow: true };
  },
  flaskshelf(m) {
    const W = CELLW - 0.2, H = 3.0, D = 0.45, parts = [['darkWood', W, H, 0.05, 0, H / 2, -D / 2]];
    for (let i = 0; i <= 4; i++) parts.push(['wood', W, 0.05, D, 0, 0.05 + i * (H - 0.1) / 4, 0]);
    for (const sx of [-1, 1]) parts.push(['wood', 0.08, H, D, sx * W / 2, H / 2, 0]);
    const g = merged(m, parts);
    const cols = [0x40d070, 0xd04060, 0x4080e0, 0xe0b040, 0xa060e0];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 7; k++) {
      if (Math.random() < 0.25) continue;
      const c = cols[Math.floor(Math.random() * cols.length)];
      const mat = (m['potion' + c] ||= new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.8, roughness: 0.15 }));
      const fl = new THREE.Mesh(Math.random() < 0.5 ? new THREE.SphereGeometry(0.1, 8, 6) : new THREE.CylinderGeometry(0.06, 0.08, 0.26, 8), mat);
      fl.position.set(-W / 2 + 0.3 + k * (W - 0.6) / 6, 0.2 + i * (H - 0.1) / 4, 0); g.add(fl);
    }
    return { g, r: 0 };
  },
  alembic(m) {
    const g = merged(m, [['wood', 2.0, 0.08, 0.9, 0, 0.85, 0], ['darkWood', 0.08, 0.85, 0.08, -0.9, 0.42, -0.35], ['darkWood', 0.08, 0.85, 0.08, 0.9, 0.42, -0.35], ['darkWood', 0.08, 0.85, 0.08, -0.9, 0.42, 0.35], ['darkWood', 0.08, 0.85, 0.08, 0.9, 0.42, 0.35]]);
    const glass = m.glassA ||= new THREE.MeshStandardMaterial({ color: 0xc8e0f0, transparent: true, opacity: 0.35, roughness: 0.05 });
    const flask = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), glass); flask.position.set(-0.4, 1.08, 0); g.add(flask);
    const tube = cyl(0.025, 0.025, 0.9, glass, 0.05, 1.3, 0, 6); tube.rotation.z = -1.1; g.add(tube);
    const fl2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m.brew || glass); fl2.position.set(0.5, 1.0, 0); g.add(fl2);
    g.add(cyl(0.03, 0.04, 0.16, m.wax, 0.8, 0.97, 0.3, 8));
    return { g, r: 0.9 };
  },
  // 鍛冶場: 金床と炉、武器掛け
  anvil(m) {
    const g = merged(m, [['iron', 0.7, 0.25, 0.3, 0, 0.75, 0], ['iron', 0.3, 0.35, 0.22, 0, 0.45, 0], ['wood', 0.6, 0.3, 0.6, 0, 0.15, 0]]);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), m.iron); horn.rotation.z = Math.PI / 2; horn.position.set(0.5, 0.75, 0); g.add(horn);
    const hm = merged(m, [['iron', 0.2, 0.08, 0.08, 0.1, 0.92, 0.1], ['wood', 0.04, 0.04, 0.4, 0.1, 0.92, 0.3]]); g.add(hm);
    return { g, r: 0.5 };
  },
  furnace(m) {
    const g = merged(m, [['stone', 2.4, 2.2, 1.2, 0, 1.1, 0], ['stone', 1.4, 1.6, 0.9, 0, 3.0, -0.1], ['stone', 0.8, 2.0, 0.6, 0, 4.6, -0.2]]);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), m.ember ||= new THREE.MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff5a00, emissiveIntensity: 2.2 }));
    mouth.position.set(0, 0.8, 0.61); g.add(mouth);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.position.set(0, 0.9, 0.9); glow.scale.set(2.6, 1.6, 1); g.add(glow);
    return { g, r: 0, glow: true };
  },
  weaponrack(m) {
    const W = CELLW - 0.4, parts = [['darkWood', W, 0.12, 0.3, 0, 0.5, 0], ['darkWood', W, 0.12, 0.3, 0, 2.2, 0], ['darkWood', 0.1, 2.4, 0.2, -W / 2, 1.2, -0.05], ['darkWood', 0.1, 2.4, 0.2, W / 2, 1.2, -0.05]];
    for (let k = 0; k < 7; k++) {
      const x = -W / 2 + 0.4 + k * (W - 0.8) / 6;
      if (k % 2) parts.push(['iron', 0.05, 2.4, 0.05, x, 1.3, 0.1]); // 槍
      else parts.push(['iron', 0.08, 1.1, 0.02, x, 1.2, 0.1], ['wood', 0.25, 0.05, 0.05, x, 0.68, 0.1]); // 剣
    }
    return { g: merged(m, parts), r: 0 };
  },
  armorstand(m) {
    const g = merged(m, [['wood', 0.5, 0.06, 0.5, 0, 0.03, 0], ['wood', 0.06, 1.3, 0.06, 0, 0.7, 0], ['iron', 0.6, 0.7, 0.32, 0, 1.45, 0], ['iron', 0.8, 0.14, 0.34, 0, 1.75, 0]]);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m.iron); helm.position.y = 2.0; helm.scale.set(1, 1.15, 1.05); g.add(helm);
    return { g, r: 0.45 };
  },
  shieldwall(m) {
    const g = new THREE.Group();
    const cloth = [0x6a1a1a, 0x1a2a5a, 0x2a4a2a, 0x5a4a1a];
    for (let k = 0; k < 3; k++) {
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), m['shield' + k] ||= new THREE.MeshStandardMaterial({ color: cloth[k], roughness: 0.6, metalness: 0.2 }));
      sh.rotation.x = Math.PI / 2; sh.position.set(-1.2 + k * 1.2, 2.4, 0.05); g.add(sh);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m.iron); boss.position.set(-1.2 + k * 1.2, 2.4, 0.1); g.add(boss);
    }
    return { g, r: 0 };
  },
  // 食堂: 長卓と皿、杯
  longtable(m) {
    const L = 3.4, parts = [['wood', L, 0.1, 1.1, 0, 0.82, 0]];
    for (const x of [-L / 2 + 0.15, L / 2 - 0.15]) for (const z of [-0.4, 0.4]) parts.push(['darkWood', 0.1, 0.8, 0.1, x, 0.4, z]);
    for (const sz of [-1, 1]) parts.push(['darkWood', L - 0.2, 0.08, 0.34, 0, 0.46, sz * 0.85]);
    const g = merged(m, parts);
    const plate = m.plate ||= new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.5, metalness: 0.3 });
    for (let k = 0; k < 5; k++) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.02, 12), plate); p.position.set(-L / 2 + 0.45 + k * (L - 0.9) / 4, 0.88, sz * 0.3); g.add(p); }
    for (let k = 0; k < 3; k++) { g.add(cyl(0.04, 0.03, 0.16, plate, -1 + k, 0.95, 0, 8)); }
    g.add(cyl(0.04, 0.05, 0.25, m.wax, 0, 1.0, 0.05, 8)); const f = new THREE.Sprite(m.flame); f.position.set(0, 1.2, 0.05); f.scale.set(0.12, 0.2, 1); g.add(f);
    return { g, r: 1.2, glow: true };
  },
  // 厨房: 壁の竈と吊るした肉、鍋
  hearth(m) {
    const g = merged(m, [['stone', 3.2, 2.6, 0.8, 0, 1.3, 0], ['stone', 3.6, 0.3, 1.0, 0, 2.7, 0.05]]);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), m.ember ||= new THREE.MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff5a00, emissiveIntensity: 2.2 }));
    inside.position.set(0, 0.7, 0.41); g.add(inside);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), m.iron); pot.position.set(0, 0.8, 0.6); g.add(pot);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); glow.position.set(0, 0.8, 0.9); glow.scale.set(2.4, 1.4, 1); g.add(glow);
    return { g, r: 0, glow: true };
  },
  hangmeat(m) {
    const g = new THREE.Group();
    const meat = m.meat ||= new THREE.MeshStandardMaterial({ color: 0x7a3020, roughness: 0.7 });
    g.add(cyl(0.03, 0.03, 2.2, m.darkWood, 0, 4.2, 0, 5).rotateZ(Math.PI / 2));
    for (let k = 0; k < 3; k++) { const x = -0.7 + k * 0.7; g.add(cyl(0.01, 0.01, 0.6, m.iron, x, 3.9, 0, 4)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), meat); h.scale.set(0.8, 1.4, 0.8); h.position.set(x, 3.35, 0); g.add(h); }
    return { g, r: 0 };
  },
  // 兵舎: 二段寝台と長持
  bunk(m) {
    const parts = [];
    for (const x of [-0.95, 0.95]) for (const z of [-0.4, 0.4]) parts.push(['darkWood', 0.08, 2.2, 0.08, x, 1.1, z]);
    for (const y of [0.45, 1.6]) parts.push(['wood', 2.0, 0.08, 0.9, 0, y, 0]);
    const g = merged(m, parts);
    const bed = m.bedding ||= new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 1 });
    for (const y of [0.55, 1.7]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.8), bed); b.position.y = y; g.add(b); }
    return { g, r: 0.9 };
  },
  footlocker(m) { return { g: merged(m, [['wood', 0.9, 0.5, 0.5, 0, 0.25, 0], ['iron', 0.92, 0.05, 0.52, 0, 0.45, 0]]), r: 0.45 }; },
  // 宝物庫: 金貨の山
  goldpile(m) {
    const gold = m.goldH ||= new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.85, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.5 });
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); p.scale.set(1, 0.4, 1); g.add(p);
    for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), m['gemT' + k] ||= new THREE.MeshStandardMaterial({ color: [0xff3050, 0x40a0ff, 0x40e080, 0xc060ff, 0xffd040][k], emissive: [0xff3050, 0x40a0ff, 0x40e080, 0xc060ff, 0xffd040][k], emissiveIntensity: 0.6 })); c.position.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.1, (Math.random() - 0.5) * 1.2); g.add(c); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 })); glow.position.y = 0.6; glow.scale.set(2.4, 1.2, 1); g.add(glow);
    return { g, r: 0.9, glow: true };
  },
  // 玉座の間: 段の上の玉座、壁の旗、列柱
  throne(m) {
    const red = m.velvet ||= new THREE.MeshStandardMaterial({ color: 0x6a1418, roughness: 0.9 });
    const gold = m.goldT ||= new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.85, roughness: 0.3 });
    const g = merged(m, [['stone', 3.0, 0.3, 2.4, 0, 0.15, 0], ['stone', 2.2, 0.3, 1.8, 0, 0.45, -0.1]]);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.9), red); seat.position.set(0, 1.0, -0.3); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 0.2), gold); back.position.set(0, 2.0, -0.75); g.add(back);
    const backR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.05), red); backR.position.set(0, 1.9, -0.63); g.add(backR);
    for (const x of [-0.55, 0.55]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.9), gold); arm.position.set(x, 1.2, -0.3); g.add(arm); }
    return { g, r: 1.3 };
  },
  banner(m) {
    const cols = [0x6a1418, 0x1a2a5a, 0x2a4a2a, 0x3a1a4a];
    const c = cols[Math.floor(Math.random() * cols.length)];
    const cloth = m['banner' + c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1.4, 3.6, 1, 8); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2) * 0.05);
    const b = new THREE.Mesh(geo, cloth); b.position.set(0, 3.6, 0.08); g.add(b);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 3), cloth); tip.rotation.z = Math.PI; tip.scale.z = 0.05; tip.position.set(0, 1.55, 0.08); g.add(tip);
    g.add(cyl(0.04, 0.04, 1.7, m.iron, 0, 5.45, 0.08, 6).rotateZ(Math.PI / 2));
    return { g, r: 0 };
  },
  pillar(m) {
    const g = new THREE.Group();
    g.add(cyl(0.45, 0.5, 6.4, m.stone, 0, 3.2, 0, 14));
    g.add(merged(m, [['stone', 1.2, 0.3, 1.2, 0, 0.15, 0], ['stone', 1.2, 0.3, 1.2, 0, 6.25, 0]]));
    return { g, r: 0.65 };
  },
  // 拷問部屋/獣舎: 檻
  cage(m) {
    const parts = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; parts.push(['iron', 0.04, 2.0, 0.04, Math.cos(a) * 0.7, 1.0, Math.sin(a) * 0.7]); }
    const g = merged(m, parts);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 24), m.iron); ring.rotation.x = Math.PI / 2; ring.position.y = 2.0; g.add(ring);
    const ring2 = ring.clone(); ring2.position.y = 0.05; g.add(ring2);
    if (Math.random() < 0.5) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m.bone); sk.position.set(0.2, 0.1, 0); g.add(sk); }
    return { g, r: 0.8 };
  },
  // 地下庭園: 天井から垂れる根、茂み、噴水
  roots(m) {
    const root = m.rootM ||= new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 });
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) { const len = 1.5 + Math.random() * 3; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, len, 6), root); c.position.set(-1.6 + k * 0.64, 6.4 - len / 2, 0.1 + Math.random() * 0.3); c.rotation.z = (Math.random() - 0.5) * 0.4; g.add(c); }
    return { g, r: 0 };
  },
  bush(m) {
    const leaf = m.leafB ||= new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9 });
    const flower = m.flowerB ||= new THREE.MeshStandardMaterial({ color: 0xd0a0e0, emissive: 0x6a3a8a, emissiveIntensity: 0.6 });
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.25, 1), leaf); b.position.set((Math.random() - 0.5) * 0.9, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.9); g.add(b); }
    for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), flower); f.position.set((Math.random() - 0.5) * 1.1, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 1.1); g.add(f); }
    return { g, r: 0.6 };
  },
  fountain(m) {
    const water = m.water ||= new THREE.MeshStandardMaterial({ color: 0x2a6a8a, emissive: 0x103a5a, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.8 });
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.5, 20, 1, true), m.stone); basin.position.y = 0.25; basin.material.side = THREE.DoubleSide; g.add(basin);
    const w = new THREE.Mesh(new THREE.CircleGeometry(1.38, 20), water); w.rotation.x = -Math.PI / 2; w.position.y = 0.4; g.add(w);
    g.add(cyl(0.18, 0.25, 1.4, m.stone, 0, 0.7, 0, 10));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.2, 14), m.stone); bowl.position.y = 1.45; g.add(bowl);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0x80c8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 })); sp.position.y = 1.8; sp.scale.set(1.2, 1.2, 1); g.add(sp);
    return { g, r: 1.5, glow: true };
  },
  pool(m) {
    const water = m.water ||= new THREE.MeshStandardMaterial({ color: 0x2a6a8a, emissive: 0x103a5a, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.8 });
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.PlaneGeometry(CELLW, CELLW), water); w.rotation.x = -Math.PI / 2; w.position.y = 0.08; g.add(w);
    return { g, r: 0 };
  },
  // 天文室: 天球儀、望遠鏡、星図
  orrery(m) {
    const gold = m.goldT ||= new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.85, roughness: 0.3 });
    const g = new THREE.Group();
    g.add(cyl(0.08, 0.3, 1.2, gold, 0, 0.6, 0, 10));
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.9 + k * 0.1, 0.025, 6, 40), gold); r.position.y = 1.9; r.rotation.set(k * 0.6, k * 0.9, k * 0.3); g.add(r); }
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m.sunM ||= new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffa020, emissiveIntensity: 1.5 })); sun.position.y = 1.9; g.add(sun);
    for (let k = 0; k < 4; k++) { const a = k * 1.6; const pl = new THREE.Mesh(new THREE.SphereGeometry(0.07 + k * 0.02, 10, 8), m['planet' + k] ||= new THREE.MeshStandardMaterial({ color: [0x8ab0ff, 0xd08a50, 0x90d090, 0xc0a0e0][k], roughness: 0.6 })); pl.position.set(Math.cos(a) * (0.9 + k * 0.1), 1.9 + Math.sin(a) * 0.2, Math.sin(a) * (0.9 + k * 0.1)); g.add(pl); }
    return { g, r: 1.0, glow: true };
  },
  telescope(m) {
    const gold = m.goldT ||= new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.85, roughness: 0.3 });
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const leg = cyl(0.03, 0.03, 1.6, m.darkWood, Math.cos(a) * 0.35, 0.75, Math.sin(a) * 0.35, 5); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); g.add(leg); }
    const tube = cyl(0.12, 0.08, 1.8, gold, 0, 1.8, 0, 12); tube.rotation.x = -1.0; g.add(tube);
    return { g, r: 0.5 };
  },
  starchart(m) {
    const tex = (m.starTex ||= (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#0c1430'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(200,180,120,.5)'; x.beginPath(); x.arc(128, 128, 110, 0, 7); x.stroke(); for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(255,240,200,' + Math.random() + ')'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } x.strokeStyle = 'rgba(255,230,160,.6)'; x.beginPath(); let px = 60, py = 80; x.moveTo(px, py); for (let i = 0; i < 6; i++) { px += 20 + Math.random() * 20; py += (Math.random() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })());
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.9 })); p.position.set(0, 2.6, 0.06); g.add(p);
    g.add(merged(m, [['darkWood', 2.8, 0.12, 0.1, 0, 3.95, 0.05], ['darkWood', 2.8, 0.12, 0.1, 0, 1.25, 0.05]]));
    return { g, r: 0 };
  },
  // 写本室: 巻物の棚
  scrollrack(m) {
    const W = CELLW - 0.2, H = 3.4, D = 0.5, parts = [['darkWood', W, H, 0.05, 0, H / 2, -D / 2]];
    for (let i = 0; i <= 6; i++) parts.push(['wood', W, 0.05, D, 0, 0.05 + i * (H - 0.1) / 6, 0]);
    for (let k = 0; k <= 8; k++) parts.push(['wood', 0.05, H, D, -W / 2 + k * W / 8, H / 2, 0]);
    const g = merged(m, parts);
    const geos = [];
    for (let i = 0; i < 6; i++) for (let k = 0; k < 8; k++) { if (Math.random() < 0.2) continue; for (let n = 0; n < 3; n++) { const c = new THREE.CylinderGeometry(0.06, 0.06, D - 0.05, 8); c.rotateX(Math.PI / 2); c.translate(-W / 2 + (k + 0.5) * W / 8 + (n - 1) * 0.13, 0.12 + i * (H - 0.1) / 6 + (n === 1 ? 0.1 : 0), 0); geos.push(c.toNonIndexed()); } }
    if (geos.length) { const sc = new THREE.Mesh(mergeGeometries(geos), m.paper); g.add(sc); }
    return { g, r: 0 };
  },
  // 標本室: 液に浸かった標本の瓶、骨格の展示
  specimen(m) {
    const glass = m.jar ||= new THREE.MeshStandardMaterial({ color: 0x8ad0a0, transparent: true, opacity: 0.35, roughness: 0.05, emissive: 0x204a30, emissiveIntensity: 0.6 });
    const g = new THREE.Group();
    const jar = cyl(0.35, 0.35, 1.2, glass, 0, 0.9, 0, 16); g.add(jar);
    g.add(merged(m, [['iron', 0.8, 0.12, 0.8, 0, 0.24, 0], ['iron', 0.78, 0.08, 0.78, 0, 1.54, 0], ['darkWood', 0.9, 0.2, 0.9, 0, 0.1, 0]]));
    const thing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), m.meat ||= new THREE.MeshStandardMaterial({ color: 0x7a3020, roughness: 0.7 })); thing.position.y = 0.95; thing.scale.set(1, 1.4, 0.9); g.add(thing);
    return { g, r: 0.45, glow: true };
  },
  // 闘技場: 杭の柵の輪
  arenaring(m) {
    const parts = [];
    const R = 3.6;
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; if (k % 7 === 0) continue; parts.push(['darkWood', 0.18, 1.3, 0.18, Math.cos(a) * R, 0.65, Math.sin(a) * R]); }
    for (let k = 0; k < 28; k++) { const a = (k + 0.5) / 28 * Math.PI * 2; if (k % 7 === 0 || k % 7 === 6) continue; parts.push(['wood', 0.85, 0.08, 0.08, Math.cos(a) * R, 1.0, Math.sin(a) * R, -a + Math.PI / 2]); }
    const g = merged(m, parts);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(R - 0.1, 24), m.sand ||= new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.y = 0.015; g.add(sand);
    return { g, r: 0 };
  },
  // 酒蔵: 横倒しの大樽の棚
  winerack(m) {
    const g = merged(m, [['darkWood', CELLW - 0.2, 0.15, 1.0, 0, 0.3, 0], ['darkWood', CELLW - 0.2, 0.15, 1.0, 0, 1.55, 0]]);
    for (const y of [0.85, 2.1]) for (let k = 0; k < 3; k++) { const b = cyl(0.5, 0.5, 0.95, m.wood, -1.25 + k * 1.25, y, 0, 14); b.rotation.x = Math.PI / 2; g.add(b); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 20), m.iron); ring.position.set(-1.25 + k * 1.25, y, 0.4); g.add(ring); }
    return { g, r: 0 };
  },
  // 鉱坑: 坑木の枠とトロッコ、線路
  minebeam(m) {
    return { g: merged(m, [['wood', 0.3, 5.6, 0.3, -1.8, 2.8, 0], ['wood', 0.3, 5.6, 0.3, 1.8, 2.8, 0], ['wood', 3.9, 0.3, 0.35, 0, 5.6, 0]]), r: 0 };
  },
  minecart(m) {
    const g = merged(m, [['iron', 1.3, 0.7, 0.9, 0, 0.6, 0], ['wood', 1.2, 0.05, 0.8, 0, 0.92, 0]]);
    for (const x of [-0.45, 0.45]) for (const z of [-0.47, 0.47]) { const w = cyl(0.16, 0.16, 0.06, m.iron, x, 0.18, z, 10); w.rotation.x = Math.PI / 2; g.add(w); }
    const ore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), m.oreM ||= new THREE.MeshStandardMaterial({ color: 0x5a6a8a, emissive: 0x2050c0, emissiveIntensity: 0.4, flatShading: true })); ore.position.y = 1.0; ore.scale.set(1.3, 0.6, 0.9); g.add(ore);
    const rail = merged(m, [['iron', 0.06, 0.06, CELLW, -0.47, 0.03, 0], ['iron', 0.06, 0.06, CELLW, 0.47, 0.03, 0], ...[0, 1, 2, 3, 4].map(k => ['darkWood', 1.2, 0.05, 0.2, 0, 0.01, -CELLW / 2 + 0.4 + k * 0.8])]); g.add(rail);
    return { g, r: 0.8 };
  },
  // 祭祀場: 床に光る召喚陣、黒い石柱
  ritualcircle(m) {
    const g = new THREE.Group();
    const mat = m.ritual ||= new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [a, b] of [[2.4, 2.55], [1.6, 1.7]]) { const r = new THREE.Mesh(new THREE.RingGeometry(a, b, 48), mat); r.rotation.x = -Math.PI / 2; r.position.y = 0.03; g.add(r); }
    const star = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.45, 5, 1), mat); star.rotation.x = -Math.PI / 2; star.position.y = 0.03; g.add(star);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(cyl(0.04, 0.05, 0.3, m.wax, Math.cos(a) * 2.8, 0.15, Math.sin(a) * 2.8, 8)); const f = new THREE.Sprite(m.flame); f.position.set(Math.cos(a) * 2.8, 0.38, Math.sin(a) * 2.8); f.scale.set(0.12, 0.2, 1); g.add(f); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xa040ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 })); glow.position.y = 0.6; glow.scale.set(5, 2, 1); g.add(glow);
    return { g, r: 0, glow: true };
  },
  obelisk(m) {
    const black = m.obsid ||= new THREE.MeshStandardMaterial({ color: 0x1a141e, roughness: 0.3, metalness: 0.2 });
    const g = new THREE.Group();
    const o = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 3.4, 4), black); o.position.y = 1.7; o.rotation.y = Math.PI / 4; g.add(o);
    const rune = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xc060ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); rune.position.y = 2.4; rune.scale.set(0.5, 0.5, 1); g.add(rune);
    return { g, r: 0.5, glow: true };
  },
  // 作戦室: 地図を広げた大卓
  maptable(m) {
    const g = merged(m, [['darkWood', 3.0, 0.12, 2.0, 0, 0.9, 0], ['darkWood', 2.4, 0.84, 1.4, 0, 0.42, 0]]);
    const mapTex = (m.mapTex ||= (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 180; const x = c.getContext('2d'); x.fillStyle = '#c8b48a'; x.fillRect(0, 0, 256, 180); x.strokeStyle = '#5a3a1a'; x.lineWidth = 3; for (let i = 0; i < 9; i++) { x.strokeRect(10 + Math.random() * 200, 10 + Math.random() * 130, 20 + Math.random() * 30, 15 + Math.random() * 25); } x.beginPath(); for (let i = 0; i < 8; i++) x.lineTo(Math.random() * 256, Math.random() * 180); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })());
    const map = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.95 })); map.rotation.x = -Math.PI / 2; map.position.y = 0.965; g.add(map);
    for (let k = 0; k < 5; k++) { const pin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), m['pin' + (k % 2)] ||= new THREE.MeshStandardMaterial({ color: k % 2 ? 0xc02020 : 0x2040c0 })); pin.position.set((Math.random() - 0.5) * 2, 1.05, (Math.random() - 0.5) * 1.3); g.add(pin); }
    return { g, r: 1.3 };
  },
  // からくりの間: 壁の大歯車
  gearwall(m) {
    const brass = m.brassG ||= new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.8, roughness: 0.35 });
    const g = new THREE.Group();
    const gears = [];
    for (const [x, y, r] of [[-0.9, 2.6, 0.9], [0.6, 3.6, 0.6], [0.9, 1.8, 0.5]]) {
      const gear = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 24), brass); disc.rotation.x = Math.PI / 2; gear.add(disc);
      const n = Math.round(r * 14);
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.12), brass); t.position.set(Math.cos(a) * (r + 0.06), Math.sin(a) * (r + 0.06), 0); t.rotation.z = a; gear.add(t); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), m.iron); hub.rotation.x = Math.PI / 2; gear.add(hub);
      gear.position.set(x, y, 0.1); g.add(gear); gears.push([gear, r]);
    }
    g.userData.spin = dt => gears.forEach(([gr, r], i) => { gr.rotation.z += dt * (i % 2 ? -1 : 1) * 0.5 / r; });
    return { g, r: 0 };
  },
  // ---- 書庫: 天井近くまで届く、壁一面の書架 ----
  wallshelf(m) {
    const W = CELLW - 0.04, H = 4.6, D = 0.62, rows = 7, parts = [];
    parts.push(['darkWood', W, H, 0.06, 0, H / 2, -D / 2 + 0.03]); // 背板
    for (const sx of [-1, 1]) parts.push(['wood', 0.12, H, D, sx * (W / 2 - 0.06), H / 2, 0]); // 側板
    parts.push(['wood', 0.12, H, D, 0, H / 2, 0]); // 中仕切り
    parts.push(['wood', W + 0.1, 0.18, D + 0.12, 0, H + 0.09, 0.03]); // 冠
    for (let i = 0; i <= rows; i++) parts.push(['wood', W, 0.06, D, 0, 0.05 + i * (H - 0.2) / rows, 0]);
    const g = merged(m, parts);
    // 本の背: 段ごとに並べる(左右の区画)
    const spineGeos = [];
    for (let i = 0; i < rows; i++) for (const sx of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(W / 2 - 0.2, (H - 0.2) / rows - 0.1);
      const uv = geo.attributes.uv; const o = Math.random(); for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.9 + o * 0.1);
      geo.translate(sx * (W / 4), 0.05 + (i + 0.5) * (H - 0.2) / rows, D / 2 - 0.06);
      spineGeos.push(geo);
    }
    const sp = new THREE.Mesh(mergeGeometries(spineGeos), m.spines); g.add(sp);
    // ときどき梯子が立てかけてある
    if (Math.random() < 0.18) {
      const lp = [];
      for (const sx of [-0.25, 0.25]) lp.push(['wood', 0.06, 3.6, 0.06, 0.6 + sx, 1.8, D / 2 + 0.35]);
      for (let k = 0; k < 9; k++) lp.push(['wood', 0.5, 0.04, 0.05, 0.6, 0.3 + k * 0.38, D / 2 + 0.35]);
      const lad = merged(m, lp); lad.rotation.x = -0.18; g.add(lad);
    }
    return { g, r: 0 };
  },
  readtable(m) {
    const parts = [['wood', 2.6, 0.08, 1.0, 0, 0.82, 0]];
    for (const [x, z] of [[-1.15, -0.4], [1.15, -0.4], [-1.15, 0.4], [1.15, 0.4]]) parts.push(['darkWood', 0.09, 0.8, 0.09, x, 0.4, z]);
    for (const sz of [-1, 1]) { parts.push(['darkWood', 2.4, 0.06, 0.32, 0, 0.46, sz * 0.82]); for (const x of [-1.05, 1.05]) parts.push(['darkWood', 0.07, 0.44, 0.07, x, 0.22, sz * 0.82]); } // 長椅子
    parts.push(['paper', 0.46, 0.03, 0.32, -0.6, 0.875, 0.05, 0.2], ['paper', 0.4, 0.03, 0.3, 0.7, 0.875, -0.1, -0.3]); // 開いた本
    parts.push(['darkWood', 0.34, 0.12, 0.25, 0.2, 0.92, 0.2, 0.5], ['wood', 0.3, 0.1, 0.22, 0.22, 1.03, 0.2, 0.3]); // 積んだ本
    const g = merged(m, parts);
    for (const x of [-0.15, 1.05]) { g.add(cyl(0.035, 0.04, 0.18, m.wax, x, 0.95, -0.3, 8)); const f = new THREE.Sprite(m.flame); f.position.set(x, 1.1, -0.3); f.scale.set(0.12, 0.2, 1); g.add(f); }
    return { g, r: 1.0, glow: true };
  },
  lectern(m) {
    const g = merged(m, [['darkWood', 0.5, 0.08, 0.5, 0, 0.04, 0], ['wood', 0.14, 1.05, 0.14, 0, 0.6, 0], ['wood', 0.62, 0.05, 0.46, 0, 1.18, 0, 0]]);
    g.children.forEach(c => { if (c.geometry.boundingBox == null) c.geometry.computeBoundingBox(); });
    const top = g.children[g.children.length - 1];
    const book = box(0.5, 0.03, 0.36, m.paper, 0, 1.24, 0); book.rotation.x = -0.35; g.add(book);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })); glow.position.set(0, 1.4, 0); glow.scale.set(0.9, 0.6, 1); g.add(glow);
    return { g, r: 0.4, glow: true };
  },
  rug(m) {
    const red = m.rug ||= new THREE.MeshStandardMaterial({ color: 0x5a1416, roughness: 1 });
    const gold = m.rugEdge ||= new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.8 });
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), gold); a.rotation.x = -Math.PI / 2; a.position.y = 0.012; a.receiveShadow = true;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.9), red); b.rotation.x = -Math.PI / 2; b.position.y = 0.016; b.receiveShadow = true;
    g.add(a, b);
    return { g, r: 0 };
  },
  chandelier(m) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 6, 24), m.iron); ring.rotation.x = Math.PI / 2; ring.position.y = 4.6; g.add(ring);
    g.add(cyl(0.015, 0.015, 1.8, m.iron, 0, 5.5, 0, 4));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      g.add(cyl(0.03, 0.035, 0.16, m.wax, Math.cos(a) * 0.8, 4.72, Math.sin(a) * 0.8, 6));
      const f = new THREE.Sprite(m.flame); f.position.set(Math.cos(a) * 0.8, 4.88, Math.sin(a) * 0.8); f.scale.set(0.12, 0.2, 1); g.add(f);
    }
    return { g, r: 0, glow: true };
  },
  bookpile(m) {
    const parts = [];
    for (let s = 0; s < 3; s++) { const x = (s - 1) * 0.4, n = 4 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) parts.push([i % 2 ? 'darkWood' : 'wood', 0.34, 0.08, 0.26, x + (Math.random() - 0.5) * 0.05, 0.04 + i * 0.08, (Math.random() - 0.5) * 0.05, Math.random() * 0.5]); }
    return { g: merged(m, parts), r: 0.4 };
  },
  // ---- 墓所: 壁一面の納骨棚(髑髏と骨) ----
  wallniche(m) {
    const W = CELLW - 0.04, H = 3.4, D = 0.7, parts = [['stone', W, H, 0.2, 0, H / 2, -D / 2 + 0.1]];
    for (const sx of [-1, 0, 1]) parts.push(['stone', 0.22, H, D, sx * (W / 2 - 0.11) * (sx ? 1 : 0), H / 2, 0]);
    for (let i = 0; i <= 3; i++) parts.push(['stone', W, 0.18, D, 0, 0.09 + i * (H - 0.18) / 3, 0]);
    const g = merged(m, parts);
    const boneGeos = [];
    for (let row = 0; row < 3; row++) for (const sx of [-1, 1]) {
      const y = 0.18 + row * (H - 0.18) / 3;
      for (let k = 0; k < 3; k++) {
        const sk = new THREE.SphereGeometry(0.13, 10, 8); sk.scale(1, 0.9, 1.1); sk.translate(sx * (0.45 + k * 0.42), y + 0.13, 0.05); boneGeos.push(sk);
      }
      for (let k = 0; k < 4; k++) { const b = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6); b.rotateZ(Math.PI / 2); b.translate(sx * W / 4, y + 0.04 + (k % 2) * 0.05, 0.2 - k * 0.08); boneGeos.push(b); }
    }
    const bones = new THREE.Mesh(mergeGeometries(boneGeos.map(b => b.toNonIndexed())), m.bone); bones.castShadow = true; g.add(bones);
    return { g, r: 0 };
  },
  sarcophagus(m) {
    const g = merged(m, [['stone', 1.3, 0.25, 2.6, 0, 0.125, 0], ['stone', 1.1, 0.8, 2.3, 0, 0.65, 0], ['stone', 1.25, 0.16, 2.45, 0, 1.13, 0]]);
    // 蓋に眠る者の像
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 10), m.stone); body.rotation.x = Math.PI / 2; body.position.set(0, 1.35, 0.1); body.scale.set(1, 1, 0.6); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), m.stone); head.position.set(0, 1.38, -0.85); g.add(head);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.add(cyl(0.03, 0.04, 0.3, m.wax, sx * 0.75, 0.15, sz * 1.4, 8)); const f = new THREE.Sprite(m.flame); f.position.set(sx * 0.75, 0.38, sz * 1.4); f.scale.set(0.12, 0.2, 1); g.add(f); }
    return { g, r: 1.2, glow: true };
  },
  // ---- 物置: 積み上げた木箱と麻袋 ----
  cratestack(m) {
    const parts = [];
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const s = 0.8 + Math.random() * 0.2, lvl = i < 2 ? 0 : 1; parts.push([i % 2 ? 'darkWood' : 'wood', s, s, s, (i % 2 ? 0.55 : -0.5) * (lvl ? 0.4 : 1), s / 2 + lvl * 0.9, (Math.random() - 0.5) * 0.3, Math.random() * 0.4]); }
    const g = merged(m, parts);
    const sack = m.sack ||= new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 1 });
    for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), sack); s.scale.set(1, 1.2, 0.8); s.position.set(1.2 + k * 0.1, 0.36, 0.4 - k * 0.6); s.castShadow = true; g.add(s); }
    return { g, r: 0.9 };
  },
  // ---- 祠: 祈りの長椅子 ----
  pew(m) {
    const parts = [['darkWood', 2.6, 0.08, 0.5, 0, 0.48, 0], ['darkWood', 2.6, 0.6, 0.06, 0, 0.8, -0.24]];
    for (const x of [-1.2, 1.2]) parts.push(['wood', 0.08, 1.0, 0.55, x, 0.5, 0]);
    return { g: merged(m, parts), r: 0.6 };
  },
  moss(m) {
    const g = new THREE.Group();
    const mat = m.moss ||= new THREE.MeshStandardMaterial({ color: 0x3a5a24, roughness: 1, emissive: 0x0a1a06 });
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.2 + Math.random() * 0.35, 9), mat);
      const pp = p.geometry.attributes.position; for (let j = 1; j < pp.count; j++) { const k = 0.6 + Math.random() * 0.5; pp.setX(j, pp.getX(j) * k); pp.setY(j, pp.getY(j) * k); }
      p.rotation.x = -Math.PI / 2; p.position.set((Math.random() - 0.5) * 1.2, 0.012 + i * 0.002, (Math.random() - 0.5) * 1.2); g.add(p);
    }
    return { g };
  },
  vines(m) {
    // 壁の上から垂れ下がる蔦 (壁は背中側 -z にある)
    const g = new THREE.Group();
    const stem = m.vine ||= new THREE.MeshStandardMaterial({ color: 0x2a3a18, roughness: 1 });
    const leaf = m.vleaf ||= new THREE.MeshStandardMaterial({ color: 0x3e6a26, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const len = 1.4 + Math.random() * 2.6, x = (Math.random() - 0.5) * 1.6;
      const pts = []; for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3(x + Math.sin(k * 1.3 + i) * 0.08, 4.6 - len * k / 6, -0.68 + Math.sin(k) * 0.03));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.018, 4), stem));
      for (let k = 1; k < 11; k++) { const p = pts[0].clone().lerp(pts[6], k / 11); const l = new THREE.Mesh(new THREE.CircleGeometry(0.07 + Math.random() * 0.04, 5), leaf); l.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, 0.03)); l.rotation.set(Math.random(), Math.random() * 6, 0); g.add(l); }
    }
    return { g };
  },
  shrooms(m) {
    // 壁際の小さな茸の群れ (摘めない飾り)
    const g = new THREE.Group();
    const stemM = m.shStem ||= new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.8 });
    const capM = m.shCap ||= new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7 });
    for (let i = 0; i < 5 + Math.floor(Math.random() * 6); i++) {
      const h = 0.04 + Math.random() * 0.12, r = 0.02 + Math.random() * 0.04;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.3, h, 5), stemM); s.position.y = h / 2;
      const c = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), capM); c.scale.y = 0.6; c.position.y = h;
      const grp = new THREE.Group(); grp.add(s, c); grp.position.set((Math.random() - 0.5) * 0.9, 0, -0.45 + Math.random() * 0.4); g.add(grp);
    }
    return { g };
  },
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
    // 蓋の上の浮き彫り(十字)
    const c1 = box(0.1, 0.03, 1.2, m.stone, 0, 0.075, 0); const c2 = box(0.5, 0.03, 0.1, m.stone, 0, 0.075, -0.25); lid.add(c1, c2);
    return { g, r: 0.8, lid };
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
    const lid = cyl(0.31, 0.31, 0.04, m.darkWood, 0, 0.97, 0, 14); g.add(lid); // 開けられる蓋
    if (Math.random() < 0.4) { const b2 = cyl(0.34, 0.3, 0.95, m.wood, 0.75, 0.475, 0.1, 14); g.add(b2); }
    return { g, r: 0.45, lid };
  },
  crate(m) {
    const g = new THREE.Group();
    const s = 0.7 + Math.random() * 0.2;
    g.add(box(s, s - 0.05, s, m.wood, 0, (s - 0.05) / 2, 0));
    const lid = box(s * 1.02, 0.06, s * 1.02, m.darkWood, 0, s - 0.02, 0); g.add(lid); // 打ち付けた蓋板
    let top = false;
    if (Math.random() < 0.5) { const c2 = box(s * 0.8, s * 0.8, s * 0.8, m.darkWood, 0.05, s + s * 0.4, 0); c2.rotation.y = 0.4; g.add(c2); top = true; }
    return { g, r: 0.5, lid: top ? null : lid };
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
    d.obj = b.g; d.lid = b.lid || null; // 調べた時に蓋が開く
    if (b.g.userData.spin) (dg.spinners ||= []).push(b.g.userData.spin);
    let solid = null;
    if (b.r) dg.solids.push(solid = { x: d.pos.x, z: d.pos.z, r: b.r * (d.s || 1) });
    if (b.hazard) dg.hazards.push({ type: b.hazard, pos: d.pos.clone(), group: b.g, alive: true, r: (b.hr || 1) * (d.s || 1), mat: b.mat, solid });
    if (b.glow) dg.candleGlows.push(d.pos.clone().setY(0.4));
  }
}
