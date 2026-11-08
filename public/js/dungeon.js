// 入るたびに形を変える迷宮: 生成・メッシュ化・衝突判定・経路探索
import * as THREE from 'three';
import { G, seeded } from './state.js';
import { stoneWall, stoneFloor, ceilingTex, glowSprite } from './textures.js';

export const CELL = 4, WALL_H = 5.2, W = 46, H = 46;
let TEX = null;

export function generate(seed, floor) {
  const r = seeded(seed);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const want = 7 + Math.min(6, floor);
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const w = ri(4, 8), h = ri(4, 8);
    const x = ri(1, W - w - 2), y = ri(1, H - h - 2);
    if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const rm of rooms) for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) grid[yy * W + xx] = 1;
  // 最近傍で繋ぐ(MST風) + 余分な回廊でループを作る
  const connected = [rooms[0]], rest = rooms.slice(1);
  const carve = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = r() < 0.5;
    const stepX = () => { while (x !== b.cx) { grid[y * W + x] = 1; x += Math.sign(b.cx - x); } };
    const stepY = () => { while (y !== b.cy) { grid[y * W + x] = 1; y += Math.sign(b.cy - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    grid[y * W + x] = 1;
  };
  while (rest.length) {
    let best = null, bd = 1e9, bi = -1;
    for (const c of connected) rest.forEach((o, i) => { const d = Math.abs(c.cx - o.cx) + Math.abs(c.cy - o.cy); if (d < bd) { bd = d; best = [c, o]; bi = i; } });
    carve(best[0], best[1]); connected.push(best[1]); rest.splice(bi, 1);
  }
  for (let i = 0; i < 2; i++) carve(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);

  const dist = bfs(grid, rooms[0].cx, rooms[0].cy);
  let portalRoom = rooms[1], far = -1;
  for (const rm of rooms) { const d = dist[rm.cy * W + rm.cx]; if (d > far) { far = d; portalRoom = rm; } }

  const cellPos = (cx, cy, jitter = 0) => new THREE.Vector3((cx + 0.5 + (r() - 0.5) * jitter) * CELL, 0, (cy + 0.5 + (r() - 0.5) * jitter) * CELL);
  const randomCellIn = rm => cellPos(ri(rm.x, rm.x + rm.w - 1), ri(rm.y, rm.y + rm.h - 1), 0.6);

  const spawns = [], scrolls = [], chests = [], herbs = [], crystals = [], torches = [];
  rooms.forEach((rm, i) => {
    if (i !== 0) {
      const n = ri(1, 2) + Math.floor(floor / 2);
      for (let k = 0; k < n; k++) spawns.push({ pos: randomCellIn(rm), type: pickEnemy(r, floor) });
    }
    if (rm === portalRoom && floor % 3 === 0) spawns.push({ pos: cellPos(rm.cx, rm.cy), type: 'golem', boss: true });
    if (r() < 0.45 && i !== 0) chests.push(randomCellIn(rm));
    if (r() < 0.6) herbs.push(randomCellIn(rm));
    // 壁沿いの松明と魔晶
    for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of dirs) {
        if (grid[(yy + dy) * W + xx + dx]) continue;
        const p = new THREE.Vector3((xx + 0.5 + dx * 0.47) * CELL, 2.6, (yy + 0.5 + dy * 0.47) * CELL);
        const k = (xx * 31 + yy * 17 + dx * 5 + dy * 3) % 9;
        if (k === 0 && r() < 0.7) torches.push({ pos: p, dir: [dx, dy] });
        else if (k === 4 && r() < 0.18) crystals.push({ pos: new THREE.Vector3(p.x, 0.9 + r() * 1.5, p.z), dir: [dx, dy] });
      }
    }
  });
  // 古文書(言霊の手掛かり): 毎階2〜3
  const scrollRooms = rooms.slice(1).sort(() => r() - 0.5).slice(0, ri(2, 3));
  for (const rm of scrollRooms) scrolls.push(randomCellIn(rm));

  return { seed, floor, grid, rooms, start: rooms[0], portalRoom, portal: cellPos(portalRoom.cx, portalRoom.cy), spawns, scrolls, chests, herbs, crystals, torches };
}

function pickEnemy(r, floor) {
  const v = r();
  if (floor >= 2 && v < 0.2) return 'wraith';
  if (floor >= 4 && v < 0.3) return 'golem';
  if (v < 0.6) return 'skeleton';
  return 'slime';
}

export function bfs(grid, sx, sy) {
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
      d[n] = d[c] + 1; q[t++] = n;
    }
  }
  return d;
}

export function buildMeshes(dg) {
  if (!TEX) TEX = { wall: stoneWall(), floor: stoneFloor(), ceil: ceilingTex(), flame: glowSprite('rgba(255,140,40,0.9)') };
  const group = new THREE.Group();
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
  floors.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, 0, (y + 0.5) * CELL); fm.setMatrixAt(i, m); });
  fm.receiveShadow = true; group.add(fm);

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
    dg.torchObjs.push({ group: tg, flame, core, light: new THREE.Vector3().copy(tg.position).add(new THREE.Vector3(-t.dir[0] * 0.4, 0.5, -t.dir[1] * 0.4)), phase: Math.random() * 10 });
  }
  return group;
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

export function collides(x, z, r, team) {
  return isWallAt(x - r, z - r) || isWallAt(x + r, z - r) || isWallAt(x - r, z + r) || isWallAt(x + r, z + r) || blockedByObstacle(x, z, r, team);
}

export function moveWithCollision(pos, dx, dz, r, team) {
  if (!collides(pos.x + dx, pos.z, r, team)) pos.x += dx;
  if (!collides(pos.x, pos.z + dz, r, team)) pos.z += dz;
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
    if (p.y <= 0.05) { p.y = 0; return p; }
    if (isWallAt(p.x, p.z) || p.y >= WALL_H) { p.sub(step); p.y = Math.max(0, p.y); return p; }
  }
  return p;
}
