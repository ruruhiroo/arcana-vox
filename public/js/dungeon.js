// 入るたびに形を変える迷宮: 生成・メッシュ化・衝突判定・経路探索
import * as THREE from 'three';
import { G, seeded } from './state.js';
import { stoneWall, stoneFloor, ceilingTex, glowSprite } from './textures.js';
import { buildDecor } from './decor.js';

export const CELL = 4, WALL_H = 5.2, W = 46, H = 46;
export const STEP = 0.7;
export const CLIMB = 2.6; // 魔物がよじ登れる高さ // 歩いて登れる段差の高さ。これより高い所は跳んで登る
export const FINAL_FLOOR = 10; // 大目標: この層の最奥に『原初の魔導書』が眠る
let TEX = null;

export function generate(seed, floor) {
  const r = seeded(seed);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const grid = new Uint8Array(W * H);
  const set = (x, y, v = 1) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[y * W + x] = v; };
  const rooms = [];
  const want = 8 + Math.min(6, floor);
  // ---- 部屋: 大きさと形のちがう「部屋の型」を組み合わせる ----
  for (let tries = 0; tries < 500 && rooms.length < want; tries++) {
    const big = r() < 0.25;
    const w = big ? ri(7, 11) : ri(3, 7), h = big ? ri(7, 10) : ri(3, 7);
    const x = ri(2, W - w - 3), y = ri(2, H - h - 3);
    if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  const SHAPES = ['rect', 'pillars', 'cross', 'round', 'lshape', 'cave', 'rect'];
  rooms.forEach((rm, i) => {
    let shape = pick(SHAPES);
    if (i === 0) shape = 'rect';
    if ((shape === 'pillars' || shape === 'cross') && (rm.w < 6 || rm.h < 6)) shape = 'round';
    if (shape === 'lshape' && (rm.w < 5 || rm.h < 5)) shape = 'rect';
    rm.shape = shape;
    for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
      const lx = xx - rm.x, ly = yy - rm.y, ex = rm.w - 1 - lx, ey = rm.h - 1 - ly;
      let on = true;
      if (shape === 'round') on = !((lx === 0 || ex === 0) && (ly === 0 || ey === 0));
      if (shape === 'cross') { const bx = Math.abs(xx - rm.cx) <= Math.max(1, rm.w >> 2), by = Math.abs(yy - rm.cy) <= Math.max(1, rm.h >> 2); on = bx || by; }
      if (shape === 'lshape') on = lx < Math.ceil(rm.w / 2) || ly >= Math.floor(rm.h / 2);
      if (on) set(xx, yy);
    }
    // 列柱の広間: 内側に柱を立てる(柱は壊せる壁)
    if (shape === 'pillars') for (let yy = rm.y + 1; yy < rm.y + rm.h - 1; yy += 2) for (let xx = rm.x + 1; xx < rm.x + rm.w - 1; xx += 2) if (Math.abs(xx - rm.cx) + Math.abs(yy - rm.cy) > 1) set(xx, yy, 0);
    set(rm.cx, rm.cy); // 中央は必ず床
  });
  // 洞窟の部屋: 縁を崩して自然な形に
  for (const rm of rooms) if (rm.shape === 'cave') {
    for (let k = 0; k < rm.w * rm.h * 0.5; k++) {
      const xx = ri(rm.x - 1, rm.x + rm.w), yy = ri(rm.y - 1, rm.y + rm.h);
      const edge = xx <= rm.x || yy <= rm.y || xx >= rm.x + rm.w - 1 || yy >= rm.y + rm.h - 1;
      if (edge) set(xx, yy, r() < 0.55 ? 1 : 0);
    }
    set(rm.cx, rm.cy);
  }
  // ---- 回廊: 幅1〜2、途中で曲がる ----
  const carve = (a, b) => {
    let x = a.cx, y = a.cy;
    const wide = r() < 0.3;
    const mx = ri(Math.min(a.cx, b.cx), Math.max(a.cx, b.cx)), my = ri(Math.min(a.cy, b.cy), Math.max(a.cy, b.cy));
    const dig = (x, y) => { set(x, y); if (wide) { set(x + 1, y); set(x, y + 1); } };
    const goX = tx => { while (x !== tx) { dig(x, y); x += Math.sign(tx - x); } };
    const goY = ty => { while (y !== ty) { dig(x, y); y += Math.sign(ty - y); } };
    if (r() < 0.5) { goX(mx); goY(my); goX(b.cx); goY(b.cy); } else { goY(my); goX(mx); goY(b.cy); goX(b.cx); }
    dig(x, y);
  };
  const connected = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    let best = null, bd = 1e9, bi = -1;
    for (const c of connected) rest.forEach((o, i) => { const d = Math.abs(c.cx - o.cx) + Math.abs(c.cy - o.cy); if (d < bd) { bd = d; best = [c, o]; bi = i; } });
    carve(best[0], best[1]); connected.push(best[1]); rest.splice(bi, 1);
  }
  for (let i = 0; i < 3; i++) carve(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);
  // 行き止まりの小部屋(物置)をいくつか
  for (let k = 0; k < 4; k++) {
    const rm = pick(rooms), dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    let x = rm.cx, y = rm.cy, len = ri(3, 7);
    while (grid[y * W + x] && x > 2 && y > 2 && x < W - 3 && y < H - 3) { x += dir[0]; y += dir[1]; }
    for (let s = 0; s < len; s++) { set(x, y); x += dir[0]; y += dir[1]; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy);
  }

  const dist = bfs(grid, rooms[0].cx, rooms[0].cy);
  let portalRoom = rooms[1], far = -1;
  for (const rm of rooms) { const d = dist[rm.cy * W + rm.cx]; if (d > far) { far = d; portalRoom = rm; } }
  // 聖域の部屋(開始と転移陣の間あたり)
  const sCands = rooms.filter(rm => rm !== rooms[0] && rm !== portalRoom && rm.w >= 4 && rm.h >= 4 && rm.shape !== 'pillars');
  const sx = rooms[0].cx, sy = rooms[0].cy, px = portalRoom.cx, py = portalRoom.cy;
  const midScore = rm => Math.abs(Math.hypot(rm.cx - sx, rm.cy - sy) - Math.hypot(rm.cx - px, rm.cy - py)) + Math.hypot(rm.cx - sx, rm.cy - sy) * 0.1;
  const sanctRoom = sCands.sort((a, b) => midScore(a) - midScore(b))[0] || null;

  const used = new Set();
  // ---- 高台と階段: 部屋の一辺に高い足場を作り、階段で上がれるようにする ----
  const hgt = new Float32Array(W * H);
  const plats = [];
  for (const rm of rooms) {
    if (rm === rooms[0] || rm === portalRoom || rm === sanctRoom || rm.w < 4 || rm.h < 4 || r() > 0.85) continue;
    const sides = rm.w * rm.h >= 42 ? [ri(0, 1), ri(2, 3)] : [ri(0, 3)]; // 広い部屋は二方に高台
    for (const side of sides) {
    const top = pick([1.2, 1.8, 2.4, 2.4]);
    const along = side < 2 ? rm.h : rm.w;
    const depth = Math.max(1, Math.min(Math.floor(along * 0.4), Math.floor(along / 2) - 1));
    const cells = [];
    for (let yy = rm.y - 1; yy <= rm.y + rm.h; yy++) for (let xx = rm.x - 1; xx <= rm.x + rm.w; xx++) {
      if (!grid[yy * W + xx]) continue;
      const inside = side === 0 ? yy < rm.y + depth : side === 1 ? yy >= rm.y + rm.h - depth : side === 2 ? xx < rm.x + depth : xx >= rm.x + rm.w - depth;
      if (inside && !(xx === rm.cx && yy === rm.cy) && xx >= rm.x && xx < rm.x + rm.w && yy >= rm.y && yy < rm.y + rm.h) { hgt[yy * W + xx] = top; cells.push([xx, yy]); }
    }
    if (!cells.length) continue;
    // 階段: 高台の縁から部屋の内側へ、一段ずつ下りる
    const [ix, iy] = side === 0 ? [0, 1] : side === 1 ? [0, -1] : side === 2 ? [1, 0] : [-1, 0];
    const edge = cells.filter(([xx, yy]) => !hgt[(yy + iy) * W + xx + ix] && grid[(yy + iy) * W + xx + ix]);
    const start = edge.length ? pick(edge) : null;
    if (start) {
      let [xx, yy] = start, hh = top;
      while (hh > 0.01) { xx += ix; yy += iy; hh = Math.round((hh - 0.6) * 10) / 10; if (!grid[yy * W + xx] || (xx === rm.cx && yy === rm.cy)) break; hgt[yy * W + xx] = Math.max(0, hh); }
    }
    plats.push({ rm, cells, top });
    }
  }
  const cellPos = (cx, cy, jitter = 0) => new THREE.Vector3((cx + 0.5 + (r() - 0.5) * jitter) * CELL, hgt[cy * W + cx] || 0, (cy + 0.5 + (r() - 0.5) * jitter) * CELL);
  const floorCellsIn = rm => { const out = []; for (let yy = rm.y - 1; yy <= rm.y + rm.h; yy++) for (let xx = rm.x - 1; xx <= rm.x + rm.w; xx++) if (grid[yy * W + xx]) out.push([xx, yy]); return out; };
  // 調度品の置かれていない床から選ぶ (魔物や宝が家具に埋まらないように)
  const randomCellIn = rm => { const all = floorCellsIn(rm); const free = all.filter(([xx, yy]) => !used.has(xx + "," + yy)); const c = pick(free.length ? free : all); return cellPos(c[0], c[1], 0.6); };
  const wallSide = (xx, yy) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => !grid[(yy + dy) * W + xx + dx]);

  // ---- 部屋の主題と調度品 ----
  const THEMES = ['library', 'crypt', 'storage', 'shrine', 'ruin'];
  const decor = [];
  rooms.forEach((rm, i) => {
    rm.theme = rm.shape === 'cave' ? 'ruin' : i === 0 ? 'storage' : pick(THEMES);
    if (rm === sanctRoom) return;
    const cells = floorCellsIn(rm).filter(([xx, yy]) => !(xx === rm.cx && yy === rm.cy));
    const nearWall = cells.filter(([xx, yy]) => wallSide(xx, yy).length);
    const inner = cells.filter(([xx, yy]) => !wallSide(xx, yy).length);
    const place = (type, list, n, opt = {}) => {
      for (let k = 0; k < n && list.length; k++) {
        const c = list.splice(Math.floor(r() * list.length), 1)[0], key = c[0] + ',' + c[1];
        if (used.has(key)) continue; used.add(key);
        const ws = wallSide(c[0], c[1]); const d = ws.length ? pick(ws) : null;
        // 壁際の物は壁に寄せ、壁に背を向ける
        const off = d && opt.wall ? 0.32 : (r() - 0.5) * 0.4;
        const pos = new THREE.Vector3((c[0] + 0.5 + (d ? d[0] * off : (r() - 0.5) * 0.4)) * CELL, hgt[c[1] * W + c[0]] || 0, (c[1] + 0.5 + (d ? d[1] * off : (r() - 0.5) * 0.4)) * CELL);
        decor.push({ type, pos, rot: d ? Math.atan2(-d[0], -d[1]) : r() * Math.PI * 2, s: 0.9 + r() * 0.25 });
      }
    };
    const area = rm.w * rm.h;
    if (rm.theme === 'library') { place('shelf', nearWall, Math.ceil(area / 8), { wall: true }); place('desk', inner, 1); place('books', cells, 3); place('candles', cells, 2); }
    if (rm.theme === 'crypt') { place('coffin', inner.length ? inner : cells, Math.ceil(area / 14)); place('bones', cells, 3); place('candles', nearWall, 2, { wall: true }); }
    if (rm.theme === 'storage') { place('oilbarrel', nearWall, Math.max(1, Math.ceil(area / 20)), { wall: true }); place('barrel', nearWall, Math.ceil(area / 12), { wall: true }); place('crate', nearWall, Math.ceil(area / 10), { wall: true }); place('rubble', cells, 1); }
    if (rm.theme === 'shrine') { place('statue', nearWall, 1, { wall: true }); place('candles', cells, 4); place('brokenPillar', inner, 1); }
    if ((rm.theme === 'ruin' || rm.theme === 'crypt') && r() < 0.7) place('puddle', inner.length ? inner : cells, 1);
    if (area >= 30 && r() < 0.5) place('crack', inner.length ? inner : cells, 1);
    if (rm.theme !== 'storage' && r() < 0.25) place('oilbarrel', nearWall, 1, { wall: true });
    if (rm.theme === 'ruin') { place('rubble', cells, Math.ceil(area / 8)); place('stalagmite', cells, Math.ceil(area / 10)); place('bones', cells, 1); }
  });
  // 回廊にも少し瓦礫
  for (let k = 0; k < 10; k++) { const x = ri(2, W - 3), y = ri(2, H - 3); if (grid[y * W + x] && !used.has(x + ',' + y)) { used.add(x + ',' + y); decor.push({ type: r() < 0.6 ? 'rubble' : 'bones', pos: cellPos(x, y, 0.6), rot: r() * 6.28, s: 0.7 + r() * 0.3 }); } }

  const spawns = [], scrolls = [], chests = [], herbs = [], crystals = [], torches = [];
  rooms.forEach((rm, i) => {
    if (i !== 0 && rm !== sanctRoom) {
      const n = ri(1, 2) + Math.floor(floor / 2) + (rm.w * rm.h > 50 ? 1 : 0);
      for (let k = 0; k < n; k++) spawns.push({ pos: randomCellIn(rm), type: pickEnemy(r, floor) });
    }
    if (rm === portalRoom && (floor % 3 === 0 || floor === FINAL_FLOOR)) {
      const final = floor === FINAL_FLOOR, kind = final ? null : ({ 3: 'mirror', 6: 'bell', 0: 'collapse' })[floor % 9];
      spawns.push({ pos: cellPos(rm.cx, rm.cy), type: kind === 'mirror' ? 'scribe' : 'golem', boss: true, final, bossKind: kind });
    }
    const chestP = rm.theme === 'storage' || rm.theme === 'crypt' ? 0.6 : 0.35;
    if (r() < chestP && i !== 0) chests.push(randomCellIn(rm));
    if (r() < (rm.theme === 'ruin' ? 0.9 : 0.45)) herbs.push(randomCellIn(rm));
    // 壁沿いの松明と魔晶
    for (const [xx, yy] of floorCellsIn(rm)) {
      for (const [dx, dy] of wallSide(xx, yy)) {
        const p = new THREE.Vector3((xx + 0.5 + dx * 0.47) * CELL, 2.6 + Math.min(2.2, hgt[yy * W + xx] || 0) * 0.5, (yy + 0.5 + dy * 0.47) * CELL);
        const k = (xx * 31 + yy * 17 + dx * 5 + dy * 3) % 9;
        if (k === 0 && r() < (rm.theme === 'ruin' ? 0.3 : 0.7)) torches.push({ pos: p, dir: [dx, dy], cell: [xx + dx, yy + dy] });
        else if (k === 4 && r() < (rm.theme === 'ruin' ? 0.45 : 0.15)) crystals.push({ pos: new THREE.Vector3(p.x, (hgt[yy * W + xx] || 0) + 0.9 + r() * 1.2, p.z), dir: [dx, dy] });
      }
    }
  });
  for (const pl of plats) if (r() < 0.65) { const c = pick(pl.cells); chests.push(cellPos(c[0], c[1], 0.4)); }
  // 古文書(言霊の手掛かり): 毎階2〜3。書庫に置かれやすい
  const scrollRooms = rooms.slice(1).filter(rm => rm !== sanctRoom).sort((a, b) => (b.theme === 'library') - (a.theme === 'library') || r() - 0.5).slice(0, ri(2, 3));
  for (const rm of scrollRooms) scrolls.push(randomCellIn(rm));

  return { seed, floor, grid, hgt, plats, rooms, start: rooms[0], portalRoom, sanctRoom, portal: cellPos(portalRoom.cx, portalRoom.cy), spawns, scrolls, chests, herbs, crystals, torches, decor };
}

function pickEnemy(r, floor) {
  const v = r();
  if (floor >= 2 && v < 0.14) return 'scribe';
  if (floor >= 2 && v < 0.28) return 'wraith';
  if (floor >= 4 && v < 0.3) return 'golem';
  if (v < 0.6) return 'skeleton';
  return 'slime';
}

export function bfs(grid, sx, sy, hgt = null, climb = STEP) {
  const d = new Int16Array(W * H).fill(-1);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || !grid[sy * W + sx]) return d;
  const q = new Int32Array(W * H); let h = 0, t = 0;
  q[t++] = sy * W + sx; d[sy * W + sx] = 0;
  while (h < t) {
    const c = q[h++], cx = c % W, cy = (c / W) | 0;
    const nb = [c - 1, c + 1, c - W, c + W];
    for (let k = 0; k < 4; k++) {
      const n = nb[k];
      if (k === 0 && cx === 0) continue; if (k === 1 && cx === W - 1) continue;
      if (n < 0 || n >= W * H || !grid[n] || d[n] >= 0) continue;
      if (hgt && hgt[c] - hgt[n] > climb) continue; // n から c へは登れない
      d[n] = d[c] + 1; q[t++] = n;
    }
  }
  return d;
}

function buildStructure(dg) {
  const group = new THREE.Group(); group.userData.structure = true;
  const floors = [], walls = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (dg.grid[y * W + x]) floors.push([x, y]);
    else {
      let adj = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && dg.grid[ny * W + nx]) adj = true;
      }
      if (adj) walls.push([x, y]);
    }
  }
  const m = new THREE.Matrix4();
  const floorMat = new THREE.MeshStandardMaterial({ ...TEX.floor, color: 0xb8aa98, roughness: 1, metalness: 0.0, normalScale: new THREE.Vector2(1.2, 1.2) });
  const fg = new THREE.PlaneGeometry(CELL, CELL); fg.rotateX(-Math.PI / 2);
  const fm = new THREE.InstancedMesh(fg, floorMat, floors.length);
  const hg = dg.hgt || new Float32Array(W * H);
  floors.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, hg[y * W + x] || 0, (y + 0.5) * CELL); fm.setMatrixAt(i, m); });
  fm.receiveShadow = true; group.add(fm);
  const raised = floors.filter(([x, y]) => hg[y * W + x] > 0);
  if (raised.length) {
    const bg = new THREE.BoxGeometry(CELL, 1, CELL); bg.translate(0, 0.5, 0);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ ...TEX.wall, color: 0xa89884, roughness: 1 }), raised.length);
    const s = new THREE.Matrix4();
    raised.forEach(([x, y], i) => { const h = hg[y * W + x] - 0.01; m.makeTranslation((x + 0.5) * CELL, 0, (y + 0.5) * CELL); s.makeScale(1, h, 1); m.multiply(s); bm.setMatrixAt(i, m); });
    bm.castShadow = true; bm.receiveShadow = true; group.add(bm);
  }
  const ceilMat = new THREE.MeshStandardMaterial({ ...TEX.ceil, color: 0x777066, roughness: 1 });
  const cg = new THREE.PlaneGeometry(CELL, CELL); cg.rotateX(Math.PI / 2);
  const cm = new THREE.InstancedMesh(cg, ceilMat, floors.length);
  floors.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, WALL_H, (y + 0.5) * CELL); cm.setMatrixAt(i, m); });
  group.add(cm);
  const wallMat = new THREE.MeshStandardMaterial({ ...TEX.wall, color: 0xc8b8a4, roughness: 1, normalScale: new THREE.Vector2(1.5, 1.5) });
  const wg = new THREE.BoxGeometry(CELL, WALL_H, CELL); wg.translate(0, WALL_H / 2, 0);
  const wm = new THREE.InstancedMesh(wg, wallMat, walls.length);
  walls.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, 0, (y + 0.5) * CELL); wm.setMatrixAt(i, m); });
  wm.castShadow = true; wm.receiveShadow = true; group.add(wm);
  return group;
}

export function buildMeshes(dg) {
  if (!TEX) TEX = { wall: stoneWall(), floor: stoneFloor(), ceil: ceilingTex(), flame: glowSprite('rgba(255,140,40,0.9)') };
  const group = new THREE.Group();
  group.add(buildStructure(dg));
  // 松明
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.8, roughness: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2614, roughness: 0.9 });
  dg.torchObjs = [];
  for (const t of dg.torches) {
    const tg = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.7, 6), woodMat);
    stick.rotation.x = t.dir[1] * 0.4; stick.rotation.z = -t.dir[0] * 0.4;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), bracketMat);
    br.position.set(t.dir[0] * 0.15, -0.2, t.dir[1] * 0.15); br.lookAt(new THREE.Vector3(t.dir[0], -0.2, t.dir[1]));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffaa55 }));
    flame.position.set(-t.dir[0] * 0.12, 0.45, -t.dir[1] * 0.12); flame.scale.set(0.7, 1.0, 1);
    const core = flame.clone(); core.scale.set(0.3, 0.45, 1); core.material = core.material.clone(); core.material.color.set(0xffeecc);
    tg.add(stick, br, flame, core);
    tg.position.copy(t.pos).add(new THREE.Vector3(-t.dir[0] * 0.15, 0, -t.dir[1] * 0.15));
    group.add(tg);
    dg.torchObjs.push({ group: tg, flame, core, cell: t.cell, light: new THREE.Vector3().copy(tg.position).add(new THREE.Vector3(-t.dir[0] * 0.4, 0.5, -t.dir[1] * 0.4)), phase: Math.random() * 10 });
  }
  buildDecor(dg, group);
  return group;
}

// 壁が壊れたあと: 床・天井・壁を作り直し、壊れた壁に付いていた松明を外す
export function rebuildStructure(dg, group) {
  const old = group.children.find(o => o.userData.structure);
  if (old) { group.remove(old); old.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
  group.add(buildStructure(dg));
  dg.torchObjs = dg.torchObjs.filter(t => {
    if (t.cell && dg.grid[t.cell[1] * W + t.cell[0]]) { group.remove(t.group); return false; }
    return true;
  });
}
// 壊せる壁か(外周は壊せない)
export const breakable = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;

// ---- 高さ ----
export function heightAt(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= W || cz >= H) return 0;
  return G.dungeon?.hgt?.[cz * W + cx] || 0;
}
// 足元(feet)から見て登れないほど高いマスに体が掛かるか
function tooHigh(x, z, r, feet, step = STEP) {
  if (!G.dungeon?.hgt) return false;
  return heightAt(x - r, z - r) - feet > step || heightAt(x + r, z - r) - feet > step || heightAt(x - r, z + r) - feet > step || heightAt(x + r, z + r) - feet > step;
}

// ---- 衝突判定 ----
export function isWallAt(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= W || cz >= H) return true;
  return !G.dungeon.grid[cz * W + cx];
}

function blockedByObstacle(x, z, r, team) {
  for (const o of G.obstacles) {
    if (o.team === team) continue;
    // 壁はOBB: 中心, 向き, 半幅
    const dx = x - o.pos.x, dz = z - o.pos.z;
    const lx = dx * o.cos + dz * o.sin, lz = -dx * o.sin + dz * o.cos;
    if (Math.abs(lx) < o.half + r && Math.abs(lz) < 0.35 + r) return true;
  }
  return false;
}

function blockedBySolid(x, z, r) {
  for (const s of G.dungeon?.solids || []) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < (s.r + r) * (s.r + r)) return true; }
  return false;
}

export function collides(x, z, r, team) {
  return isWallAt(x - r, z - r) || isWallAt(x + r, z - r) || isWallAt(x - r, z + r) || isWallAt(x + r, z + r) || blockedByObstacle(x, z, r, team) || blockedBySolid(x, z, r);
}

// step: 一度に越えられる段差 (魔物はよじ登れるので大きい)
export function moveWithCollision(pos, dx, dz, r, team, step = STEP) {
  const feet = pos.y || 0;
  if (!collides(pos.x + dx, pos.z, r, team) && !tooHigh(pos.x + dx, pos.z, r, feet, step)) pos.x += dx;
  if (!collides(pos.x, pos.z + dz, r, team) && !tooHigh(pos.x, pos.z + dz, r, feet, step)) pos.z += dz;
}
// 地面に沿わせる: 段差は上がり、高い所からは落ちる
export function settleY(pos, dt, vy = null) {
  const g = heightAt(pos.x, pos.z);
  if (pos.y > g + 0.01) pos.y = Math.max(g, pos.y - 9 * dt);
  else if (pos.y < g - 0.01) pos.y = Math.min(g, pos.y + (g - pos.y > 0.8 ? 6 : 12) * dt); // 高い段はよじ登る
  else pos.y = g;
}

export function lineOfSight(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), steps = Math.ceil(d / (CELL * 0.25));
  for (let i = 1; i < steps; i++) { const t = i / steps; if (isWallAt(a.x + dx * t, a.z + dz * t)) return false; }
  return true;
}

export function cellOf(p) { return [Math.floor(p.x / CELL), Math.floor(p.z / CELL)]; }

// 流れ場: 目標地点への最短経路方向
export function flowDir(field, pos) {
  const [cx, cz] = cellOf(pos);
  const here = field[cz * W + cx];
  if (here < 0) return null;
  let best = null, bd = here;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const v = field[nz * W + nx];
    if (v < 0) continue;
    if (dx && dz && (field[cz * W + nx] < 0 || field[nz * W + cx] < 0)) continue; // 角抜け防止
    if (v < bd) { bd = v; best = [nx, nz]; }
  }
  if (!best) return null;
  return new THREE.Vector3((best[0] + 0.5) * CELL - pos.x, 0, (best[1] + 0.5) * CELL - pos.z).normalize();
}

// 照準レイを床/壁まで飛ばす
export function raycastGrid(origin, dir, maxDist = 30) {
  const p = origin.clone(); const step = dir.clone().multiplyScalar(0.25);
  for (let d = 0; d < maxDist; d += 0.25) {
    p.add(step);
    const gh = heightAt(p.x, p.z);
    if (p.y <= gh + 0.05) { p.y = gh; return p; }
    if (isWallAt(p.x, p.z) || p.y >= WALL_H) { p.sub(step); p.y = Math.max(0, p.y); return p; }
  }
  return p;
}
