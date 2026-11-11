// 入るたびに形を変える迷宮: 生成・メッシュ化・衝突判定・経路探索
import * as THREE from 'three';
import { G, seeded } from './state.js';
import { stoneWall, stoneFloor, ceilingTex, glowSprite } from './textures.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './layout.js';

export const CELL = 4, WALL_H = 6.4, W = 52, H = 52;
export const DRAGON_HALL_HEIGHT = 16;
export function ceilingAt(x, z, dg = G.dungeon) {
  const room = dg?.portalRoom, cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  return room?.mod === 'dragon_hall' && cx >= room.x && cx < room.x + room.w && cy >= room.y && cy < room.y + room.h
    ? (dg.hgt[room.cy * W + room.cx] || 0) + DRAGON_HALL_HEIGHT : WALL_H;
}
export const STEP = 0.7;
export const CLIMB = 2.6; // 魔物がよじ登れる高さ // 歩いて登れる段差の高さ。これより高い所は跳んで登る
export const FINAL_FLOOR = 10; // 大目標: この層の最奥に『原初の魔導書』が眠る
let TEX = null;

// 迷宮の入口の広場: 敵はいない。北の門(転移陣)から第1層へ
function makeHub(seed) {
  const grid = new Uint8Array(W * H), hgt = new Float32Array(W * H);
  const x0 = 20, y0 = 21, w = 11, h = 10;
  const cells = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { grid[y * W + x] = 1; cells.push([x, y]); }
  // 門の前の奥まった通路
  const gx = x0 + (w >> 1);
  for (let y = y0 - 2; y < y0; y++) { grid[y * W + gx] = 1; cells.push([gx, y]); }
  const cellPos = (cx, cy) => new THREE.Vector3((cx + 0.5) * CELL, 0, (cy + 0.5) * CELL);
  const room = { id: 0, mod: 'hub', kind: 'room', x: x0, y: y0, w, h, cx: gx, cy: y0 + 6, cells, flat: true, theme: 'shrine' };
  const torches = [], decor = [];
  for (const [xx, yy] of cells) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (grid[(yy + dy) * W + xx + dx]) continue;
    if ((xx + yy) % 3 === 0) torches.push({ pos: new THREE.Vector3((xx + 0.5 + dx * 0.47) * CELL, 2.8, (yy + 0.5 + dy * 0.47) * CELL), dir: [dx, dy], cell: [xx + dx, yy + dy] });
  }
  // 門の両脇の像、隅の樽や木箱
  decor.push({ type: 'statue', pos: cellPos(gx - 1, y0).add(new THREE.Vector3(0, 0, -1.2)), rot: 0, s: 1.2 });
  decor.push({ type: 'statue', pos: cellPos(gx + 1, y0).add(new THREE.Vector3(0, 0, -1.2)), rot: 0, s: 1.2 });
  for (const [cx, cy, t] of [[x0, y0 + h - 1, 'barrel'], [x0 + 1, y0 + h - 1, 'crate'], [x0 + w - 1, y0 + h - 1, 'crate'], [x0 + w - 1, y0 + 3, 'barrel'], [x0, y0 + 3, 'oilbarrel']]) decor.push({ type: t, pos: cellPos(cx, cy), rot: Math.random() * 6, s: 1 });
  for (let k = 0; k < 6; k++) decor.push({ type: 'moss', pos: cellPos(x0 + Math.floor(Math.random() * w), y0 + Math.floor(Math.random() * h)), rot: 0, s: 1 });
  decor.push({ type: 'vines', pos: cellPos(x0, y0 + 5).add(new THREE.Vector3(-1.3, 0, 0)), rot: Math.PI / 2, s: 1 });
  decor.push({ type: 'vines', pos: cellPos(x0 + w - 1, y0 + 6).add(new THREE.Vector3(1.3, 0, 0)), rot: -Math.PI / 2, s: 1 });
  // 得意属性の祭壇: 南側に弧を描いて六つ
  const ELS = ['fire', 'ice', 'thunder', 'wind', 'holy', 'void'];
  const c = cellPos(gx, y0 + 6);
  const shrines = ELS.map((el, i) => { const a = Math.PI * (0.15 + 0.7 * i / 5); return { el, pos: c.clone().add(new THREE.Vector3(-Math.cos(a) * 11, 0, Math.sin(a) * 6.5)) }; });
  const braziers = [cellPos(gx - 2, y0 + 1), cellPos(gx + 2, y0 + 1)];
  return {
    hub: true, seed, floor: 0, grid, hgt, plats: [], rooms: [room], start: room, portalRoom: room, sanctRoom: room,
    portal: cellPos(gx, y0 - 1), spawns: [], scrolls: [], chests: [], herbs: [], crystals: [], torches, decor, braziers, shrines,
    secrets: [], richChests: [], roomEvents: [], mushrooms: [], oddShrooms: [], gasTraps: [],
  };
}
export function generate(seed, floor) {
  if (floor === 0) return makeHub(seed);
  const r = seeded(seed);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = arr => arr[Math.floor(r() * arr.length)];
  // ---- 間取り: 部屋の型を扉でつないで組み上げる (layout.js) ----
  const { grid, hgt, rooms, plats, secrets } = buildLayout(r, floor, W, H);
  const realRooms = rooms.filter(rm => rm.kind === 'room');
  const dist = bfs(grid, rooms[0].cx, rooms[0].cy);
  // 転移陣: 最初の部屋から最も遠い部屋
  let portalRoom = realRooms.find(rm => rm !== rooms[0]) || rooms[1], far = -1;
  // 竜の部屋は回避できる広さの平地を優先する。物置や柱の迷路を戦場にしない。
  const arenas = realRooms.filter(rm => rm.mod === 'dragon_hall');
  for (const rm of arenas.length ? arenas : realRooms) { if (rm === rooms[0]) continue; const d = dist[rm.cy * W + rm.cx]; if (d > far) { far = d; portalRoom = rm; } }
  // 選んだ部屋の柱を取り払い、段差のない戦場にする。外周の壁と出入口は保つ。
  const arenaHeight = hgt[portalRoom.cy * W + portalRoom.cx] || 0;
  portalRoom.cells = [];
  for (let y = portalRoom.y; y < portalRoom.y + portalRoom.h; y++) for (let x = portalRoom.x; x < portalRoom.x + portalRoom.w; x++) {
    grid[y * W + x] = 1; hgt[y * W + x] = arenaHeight; portalRoom.cells.push([x, y]);
  }
  portalRoom.flat = true;
  // 聖域の部屋(開始と転移陣の間あたり、平らな部屋)
  const sCands = realRooms.filter(rm => rm !== rooms[0] && rm !== portalRoom && rm.flat && rm.cells.length >= 9 && rm.mod !== 'pillars' && rm.mod !== 'crypt' && rm.mod !== 'gallery');
  const sx = rooms[0].cx, sy = rooms[0].cy, px = portalRoom.cx, py = portalRoom.cy;
  const midScore = rm => Math.abs(Math.hypot(rm.cx - sx, rm.cy - sy) - Math.hypot(rm.cx - px, rm.cy - py)) + Math.hypot(rm.cx - sx, rm.cy - sy) * 0.1;
  const sanctRoom = rooms[0]; // 聖域は降り立った部屋だけ (途中に安全地帯は無い)
  const used = new Set();
  for (const [x, y] of portalRoom.cells) used.add(x + ',' + y);
  const cellPos = (cx, cy, jitter = 0) => new THREE.Vector3((cx + 0.5 + (r() - 0.5) * jitter) * CELL, hgt[cy * W + cx] || 0, (cy + 0.5 + (r() - 0.5) * jitter) * CELL);
  const floorCellsIn = rm => rm.cells ? rm.cells.filter(([xx, yy]) => grid[yy * W + xx]) : [];
  // 調度品の置かれていない床から選ぶ (魔物や宝が家具に埋まらないように)
  const randomCellIn = rm => { const all = floorCellsIn(rm); const free = all.filter(([xx, yy]) => !used.has(xx + "," + yy)); const c = pick(free.length ? free : all); return cellPos(c[0], c[1], 0.6); };
  const wallSide = (xx, yy) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => !grid[(yy + dy) * W + xx + dx]);

  // ---- 部屋の主題と調度品 ----
  // 部屋の主題(25): 書庫・墓所・物置・祠・廃墟 / 牢獄・錬金工房・鍛冶場・食堂・厨房・兵舎・武器庫・宝物庫・玉座の間・拷問部屋・地下庭園・浴場・天文室・写本室・標本室・闘技場・酒蔵・鉱坑・祭祀場・作戦室・からくりの間
  const THEMES = ['library', 'crypt', 'storage', 'shrine', 'ruin', 'prison', 'alchemy', 'forge', 'dining', 'kitchen', 'barracks', 'armory', 'treasury', 'throne', 'torture', 'garden', 'bath', 'observatory', 'scriptorium', 'specimen', 'arena', 'cellar', 'mine', 'ritual', 'warroom', 'clockwork'];
  const RARE = { treasury: 0.3, throne: 0.5, arena: 0.6, ritual: 0.6 }; // 珍しい部屋
  const pickTheme = () => { for (let k = 0; k < 8; k++) { const t = pick(THEMES); if (r() < (RARE[t] ?? 1)) return t; } return 'ruin'; };
  const decor = [];
  rooms.forEach((rm, i) => {
    if (rm.kind !== 'room') { rm.theme = 'corridor'; return; }
    rm.theme = rm.theme || (i === 0 ? 'storage' : pickTheme());
    if (rm === portalRoom) { rm.theme = 'arena'; return; } // 床の予兆と逃げ道を家具で隠さない
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
    // 壁際を一面埋める(書庫は書架、墓所は納骨棚)。出入口には掛からない
    const lineWalls = (type, chance = 1, depth = 0.72) => {
      for (const [xx, yy] of nearWall) for (const d of wallSide(xx, yy)) {
        if (r() > chance) continue;
        const pos = new THREE.Vector3((xx + 0.5 + d[0] * (0.5 - depth / 2 / CELL)) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5 + d[1] * (0.5 - depth / 2 / CELL)) * CELL);
        decor.push({ type, pos, rot: Math.atan2(-d[0], -d[1]), s: 1 });
      }
    };
    // 部屋の中ほどに、列をそろえて置く
    const rows = (type, list, every = 2, rot = 0) => {
      for (const [xx, yy] of list) {
        if ((xx + yy) % every || used.has(xx + ',' + yy)) continue;
        used.add(xx + ',' + yy);
        decor.push({ type, pos: new THREE.Vector3((xx + 0.5) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5) * CELL), rot, s: 1 });
      }
    };
    const center = () => new THREE.Vector3((rm.cx + 0.5) * CELL, hgt[rm.cy * W + rm.cx] || 0, (rm.cy + 0.5) * CELL);
    if (rm.theme === 'library') {
      lineWalls('wallshelf');
      decor.push({ type: 'rug', pos: center(), rot: rm.w > rm.h ? Math.PI / 2 : 0, s: 1 });
      decor.push({ type: 'chandelier', pos: center(), rot: 0, s: 1 });
      rows('readtable', inner.slice(), 2, rm.w > rm.h ? 0 : Math.PI / 2);
      place('lectern', inner, 1); place('bookpile', cells, 2 + Math.floor(area / 20));
    }
    if (rm.theme === 'crypt') {
      lineWalls('wallniche', 0.85);
      decor.push({ type: 'sarcophagus', pos: center(), rot: rm.w > rm.h ? Math.PI / 2 : 0, s: 1 });
    }
    if (rm.theme === 'storage') place('cratestack', nearWall, Math.ceil(area / 7), { wall: true });
    if (rm.theme === 'shrine') { decor.push({ type: 'rug', pos: center(), rot: rm.w > rm.h ? Math.PI / 2 : 0, s: 1 }); rows('pew', inner.slice(), 2, 0); }
    // ---- 追加の主題 ----
    const T = rm.theme, wide = rm.w > rm.h, along = wide ? Math.PI / 2 : 0;
    const innerL = inner.slice();
    if (T === 'prison') { lineWalls('cellbars', 0.9, 2.6); lineWalls('shackles', 0.4, 0.12); decor.push({ type: 'chains', pos: center(), rot: 0, s: 1 }); place('bones', cells, 2); }
    if (T === 'alchemy') { lineWalls('flaskshelf', 0.6, 0.5); decor.push({ type: 'cauldron', pos: center(), rot: 0, s: 1 }); rows('alembic', innerL, 3, along); place('bookpile', cells, 1); }
    if (T === 'forge') { lineWalls('weaponrack', 0.4, 0.45); place('furnace', nearWall, 1, { wall: true }); place('anvil', innerL, 2); place('armorstand', cells, 1); }
    if (T === 'dining') { rows('longtable', innerL, 2, along); decor.push({ type: 'chandelier', pos: center(), rot: 0, s: 1 }); lineWalls('banner', 0.25, 0.12); }
    if (T === 'kitchen') { place('hearth', nearWall, 1, { wall: true }); lineWalls('hangmeat', 0.3, 1.6); place('barrel', nearWall, 2, { wall: true }); rows('alembic', innerL, 4, along); }
    if (T === 'barracks') { lineWalls('bunk', 0.5, 1); place('footlocker', cells, Math.ceil(area / 10)); place('armorstand', nearWall, 1, { wall: true }); }
    if (T === 'armory') { lineWalls('weaponrack', 0.7, 0.45); lineWalls('shieldwall', 0.4, 0.12); rows('armorstand', innerL, 2, along); }
    if (T === 'treasury') { decor.push({ type: 'goldpile', pos: center(), rot: 0, s: 1 }); place('goldpile', innerL, 2); lineWalls('banner', 0.3, 0.12); }
    if (T === 'throne') { lineWalls('banner', 0.6, 0.12); decor.push({ type: 'rug', pos: center(), rot: along, s: 1 }); place('throne', nearWall, 1, { wall: true }); rows('pillar', innerL, 3, 0); }
    if (T === 'torture') { lineWalls('shackles', 0.6, 0.12); place('cage', cells, 2); decor.push({ type: 'chains', pos: center(), rot: 0, s: 1 }); place('bones', cells, 3); }
    if (T === 'garden') { lineWalls('roots', 0.7, 0.3); place('bush', cells, Math.ceil(area / 5)); decor.push({ type: 'fountain', pos: center(), rot: 0, s: 1 }); place('shrooms', cells, 3); }
    if (T === 'bath') { for (const [xx, yy] of innerL) decor.push({ type: 'pool', pos: new THREE.Vector3((xx + 0.5) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5) * CELL), rot: 0, s: 1 }); lineWalls('banner', 0.15, 0.12); place('candles', nearWall, 4, { wall: true }); }
    if (T === 'observatory') { lineWalls('starchart', 0.5, 0.12); decor.push({ type: 'orrery', pos: center(), rot: 0, s: 1 }); place('telescope', innerL, 1); place('desk', cells, 1); }
    if (T === 'scriptorium') { lineWalls('scrollrack', 0.8, 0.55); rows('desk', innerL, 2, along); place('candles', cells, 3); }
    if (T === 'specimen') { lineWalls('flaskshelf', 0.4, 0.5); rows('specimen', innerL, 2, 0); place('bones', cells, 2); }
    if (T === 'arena') { decor.push({ type: 'arenaring', pos: center(), rot: 0, s: 1 }); lineWalls('weaponrack', 0.3, 0.45); lineWalls('banner', 0.3, 0.12); }
    if (T === 'cellar') { lineWalls('winerack', 0.8, 1); place('barrel', cells, 2); place('candles', cells, 2); }
    if (T === 'mine') { lineWalls('minebeam', 0.5, 0.4); place('minecart', innerL, 1); place('rubble', cells, 3); place('stalagmite', cells, 2); }
    if (T === 'ritual') { decor.push({ type: 'ritualcircle', pos: center(), rot: 0, s: 1 }); place('obelisk', cells, 4); place('candles', nearWall, 3, { wall: true }); }
    if (T === 'warroom') { decor.push({ type: 'maptable', pos: center(), rot: along, s: 1 }); lineWalls('banner', 0.5, 0.12); lineWalls('shieldwall', 0.3, 0.12); }
    if (T === 'clockwork') { lineWalls('gearwall', 0.6, 0.2); place('rubble', cells, 1); }
    if (rm.theme === 'library-old') { place('shelf', nearWall, Math.ceil(area / 8), { wall: true }); place('desk', inner, 1); place('books', cells, 3); place('candles', cells, 2); }
    if (rm.theme === 'crypt') { place('coffin', inner.length ? inner : cells, Math.ceil(area / 14)); place('bones', cells, 3); place('candles', nearWall, 2, { wall: true }); }
    if (rm.theme === 'storage') { place('oilbarrel', nearWall, Math.max(1, Math.ceil(area / 20)), { wall: true }); place('barrel', nearWall, Math.ceil(area / 12), { wall: true }); place('crate', nearWall, Math.ceil(area / 10), { wall: true }); place('rubble', cells, 1); }
    if (rm.theme === 'shrine') { place('statue', nearWall, 1, { wall: true }); place('candles', cells, 4); place('brokenPillar', inner, 1); }
    if ((rm.theme === 'ruin' || rm.theme === 'crypt') && r() < 0.7) place('puddle', inner.length ? inner : cells, 1);
    if (area >= 30 && r() < 0.5) place('crack', inner.length ? inner : cells, 1);
    if (rm.theme !== 'storage' && r() < 0.25) place('oilbarrel', nearWall, 1, { wall: true });
    // どの部屋にも調べられる樽・木箱を少し
    if (rm.theme !== 'storage') place(r() < 0.5 ? 'barrel' : 'crate', nearWall, 1 + Math.floor(area / 24) + (r() < 0.5 ? 1 : 0), { wall: true });
    place('moss', cells, Math.ceil(area / (rm.theme === 'ruin' || rm.theme === 'crypt' ? 10 : 22)));
    if (r() < (rm.theme === 'ruin' ? 0.9 : 0.4)) place('vines', nearWall, 1 + Math.floor(area / 25), { wall: true });
    if (r() < 0.5) place('shrooms', nearWall, 1 + Math.floor(area / 30), { wall: true });
    if (rm.theme === 'ruin') { place('rubble', cells, Math.ceil(area / 8)); place('stalagmite', cells, Math.ceil(area / 10)); place('bones', cells, 1); }
  });
  // 回廊にも少し瓦礫
  for (let k = 0; k < 10; k++) { const x = ri(2, W - 3), y = ri(2, H - 3); if (grid[y * W + x] && !used.has(x + ',' + y)) { used.add(x + ',' + y); decor.push({ type: r() < 0.6 ? 'rubble' : 'bones', pos: cellPos(x, y, 0.6), rot: r() * 6.28, s: 0.7 + r() * 0.3 }); } }

  const spawns = [], scrolls = [], chests = [], herbs = [], crystals = [], torches = [], mushrooms = [];
  const richChests = [];
  rooms.forEach((rm, i) => {
    if (rm.kind === 'secret' || rm.kind === 'sealed') {
      const cs = floorCellsIn(rm).sort(() => r() - 0.5);
      const at = k => { const c = cs[k % cs.length]; used.add(c[0] + ',' + c[1]); return cellPos(c[0], c[1], 0.3); };
      richChests.push(at(0));
      herbs.push(at(1));
      if (rm.kind === 'sealed') scrolls.push(at(2));
      else if (r() < 0.5) richChests.push(at(2));
      crystals.push(...floorCellsIn(rm).flatMap(([xx, yy]) => wallSide(xx, yy).slice(0, 1).map(([dx, dy]) => ({ pos: new THREE.Vector3((xx + 0.5 + dx * 0.36) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5 + dy * 0.36) * CELL), dir: [dx, dy] }))).slice(0, 2));
      return;
    }
    if (i !== 0 && rm !== sanctRoom && rm !== portalRoom) {
      const room = rm.kind === 'room';
      // 1部屋あたりの平均: 1層 約0.8体 → 5層 約1.9体 → 10層 約3.3体
      const n = room ? Math.floor(0.5 + floor * 0.28 + (rm.cells.length > 30 ? 0.35 : 0) + r()) : (r() < 0.1 + floor * 0.05 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const type = pickEnemy(r, floor);
        const pack = (type === 'ghoul' || type === 'bat') && room && floor >= 2 ? ri(1, Math.min(2, floor - 1)) : 0; // 群れ(2層から)
        for (let q = 0; q <= pack; q++) spawns.push({ pos: randomCellIn(rm), type });
      }
    }
    if (rm === portalRoom && (floor % 3 === 0 || floor === FINAL_FLOOR)) {
      const final = floor === FINAL_FLOOR;
      spawns.push({ pos: cellPos(rm.cx, rm.cy), type: 'dragon', boss: true, final, bossKind: 'dragon' });
    }
    const chestP = rm.kind !== 'room' ? 0.05 : rm.theme === 'storage' || rm.theme === 'crypt' || rm.mod === 'closet' ? 0.7 : 0.35;
    if (r() < chestP && i !== 0) chests.push(randomCellIn(rm));
    if (r() < (rm.kind !== 'room' ? 0.12 : rm.theme === 'ruin' ? 0.9 : 0.45)) herbs.push(randomCellIn(rm));
    // 壁沿いの松明と魔晶
    for (const [xx, yy] of floorCellsIn(rm)) {
      for (const [dx, dy] of wallSide(xx, yy)) {
        const p = new THREE.Vector3((xx + 0.5 + dx * 0.47) * CELL, 2.6 + Math.min(2.2, hgt[yy * W + xx] || 0) * 0.5, (yy + 0.5 + dy * 0.47) * CELL);
        const k = (xx * 31 + yy * 17 + dx * 5 + dy * 3) % 9;
        if (k === 0 && r() < (rm.theme === 'ruin' ? 0.3 : rm.kind !== 'room' ? 0.45 : 0.7)) torches.push({ pos: p, dir: [dx, dy], cell: [xx + dx, yy + dy] });
        else if (k === 4 && r() < (rm.theme === 'ruin' ? 0.45 : 0.15)) crystals.push({ pos: new THREE.Vector3((xx + 0.5 + dx * 0.36) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5 + dy * 0.36) * CELL), dir: [dx, dy] });
        else if (k === 7 && rm.kind === 'room' && r() < (rm.theme === 'ruin' || rm.theme === 'crypt' ? 0.5 : 0.2)) mushrooms.push(new THREE.Vector3((xx + 0.5 + dx * 0.33 + (r() - 0.5) * 0.2) * CELL, hgt[yy * W + xx] || 0, (yy + 0.5 + dy * 0.33 + (r() - 0.5) * 0.2) * CELL));
      }
    }
  });
  // 魔物の数の上限 (重くなりすぎないように)。部屋の主は残す
  const cap = 8 + floor * 4;
  while (spawns.filter(x => !x.boss).length > cap) { const i = spawns.findIndex((x, k) => !x.boss && r() < 0.15); if (i >= 0) spawns.splice(i, 1); }
  for (const pl of plats) if (r() < 0.65) { const c = pick(pl.cells); chests.push(cellPos(c[0], c[1], 0.4)); }
  // 古文書(言霊の手掛かり): 毎階2〜3。書庫に置かれやすい
  const scrollRooms = realRooms.slice(1).filter(rm => rm !== sanctRoom).sort((a, b) => (b.theme === 'library') - (a.theme === 'library') || r() - 0.5).slice(0, ri(2, 3));
  for (const rm of scrollRooms) scrolls.push(randomCellIn(rm));

  // 部屋の仕掛け: 術で解く謎・試練の碑・祈りの祭壇。半分ほどの部屋に一つ
  const roomEvents = [];
  const evRooms = realRooms.filter(rm => rm !== rooms[0] && rm !== sanctRoom && rm !== portalRoom).sort(() => r() - 0.5);
  const EV = [['flames', 3], ['frozen', 2], ['tablet', 2], ['trial', floor >= 2 ? 2 : 0.6], ['altar', 1.5]];
  let lore = Math.floor(r() * 10);
  for (const rm of evRooms.slice(0, Math.max(2, Math.round(evRooms.length * 0.5)))) {
    const freeIn = floorCellsIn(rm).filter(([xx, yy]) => !used.has(xx + ',' + yy) && !(xx === rm.cx && yy === rm.cy));
    const inner = freeIn.filter(([xx, yy]) => !wallSide(xx, yy).length), edge = freeIn.filter(([xx, yy]) => wallSide(xx, yy).length);
    let v = r() * EV.reduce((a, e) => a + e[1], 0), type = 'altar';
    for (const [t, w] of EV) if ((v -= w) <= 0) { type = t; break; }
    const take = list => { if (!list.length) return null; const c = list.splice(Math.floor(r() * list.length), 1)[0]; used.add(c[0] + ',' + c[1]); return c; };
    const wallRot = c => { const ws = wallSide(c[0], c[1]); const d = ws[0]; return d ? Math.atan2(-d[0], -d[1]) : 0; };
    const wallPos = (c, k = 0.3) => { const d = wallSide(c[0], c[1])[0] || [0, 0]; return new THREE.Vector3((c[0] + 0.5 + d[0] * k) * CELL, hgt[c[1] * W + c[0]] || 0, (c[1] + 0.5 + d[1] * k) * CELL); };
    if (type === 'flames') {
      const pool = (inner.length >= 3 ? inner : freeIn).slice(), spots = [];
      for (let k = 0; k < 30 && spots.length < 3 && pool.length; k++) { const c = pool[Math.floor(r() * pool.length)]; if (spots.some(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) < 2)) continue; spots.push(c); used.add(c[0] + ',' + c[1]); }
      if (spots.length < 2) continue;
      roomEvents.push({ type, spots: spots.map(c => cellPos(c[0], c[1])), reward: cellPos(rm.cx, rm.cy) });
    } else if (type === 'tablet' || type === 'altar') {
      const c = take(edge.length ? edge : freeIn); if (!c) continue;
      roomEvents.push({ type, pos: wallPos(c), rot: wallRot(c), lore: lore++ });
    } else {
      const c = take(inner.length ? inner : freeIn); if (!c) continue;
      roomEvents.push({ type, pos: cellPos(c[0], c[1]) });
    }
  }

  // 仲間と解く仕掛け: 部屋の仕掛けの無い部屋に、毎階1〜2つ
  const coopEvents = [];
  const evUsed = new Set(evRooms.slice(0, Math.max(2, Math.round(evRooms.length * 0.5))));
  const coopRooms = evRooms.filter(rm => !evUsed.has(rm) && rm.cells.length >= 16);
  const CO = [['plates', 3], ['chorus', 2], ['relay', 3], ['orb', floor >= 2 ? 2.5 : 0]];
  const spread = (list, n, gap) => { const pool = list.slice(), out = []; for (let k = 0; k < 60 && out.length < n && pool.length; k++) { const c = pool[Math.floor(r() * pool.length)]; if (out.some(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) < gap)) continue; out.push(c); used.add(c[0] + ',' + c[1]); } return out; };
  for (const rm of coopRooms.slice(0, floor === 0 ? 0 : 1 + (r() < 0.55 ? 1 : 0))) {
    const freeIn = floorCellsIn(rm).filter(([xx, yy]) => !used.has(xx + ',' + yy) && !(xx === rm.cx && yy === rm.cy));
    const inner = freeIn.filter(([xx, yy]) => !wallSide(xx, yy).length);
    let v = r() * CO.reduce((a, e) => a + e[1], 0), type = 'plates';
    for (const [t, w] of CO) if ((v -= w) <= 0) { type = t; break; }
    if (type === 'plates') { const s = spread(inner.length >= 4 ? inner : freeIn, 4, 2); if (s.length >= 2) coopEvents.push({ type, spots: s.map(c => cellPos(c[0], c[1])) }); }
    else if (type === 'relay') { const s = spread(freeIn, 7, 3); if (s.length >= 3) coopEvents.push({ type, spots: s.map(c => cellPos(c[0], c[1])) }); }
    else if (type === 'chorus') coopEvents.push({ type, pos: cellPos(rm.cx, rm.cy) });
    else {
      const c = spread(inner.length ? inner : freeIn, 1, 1)[0]; if (!c) continue;
      const far = realRooms.filter(o => o !== rm && o !== sanctRoom).sort((a, b) => Math.hypot(b.cx - rm.cx, b.cy - rm.cy) - Math.hypot(a.cx - rm.cx, a.cy - rm.cy))[0];
      if (!far) continue;
      coopEvents.push({ type, pos: cellPos(c[0], c[1]), target: cellPos(far.cx, far.cy) });
    }
  }

  // 篝火台: 広い部屋の中ほどに置き、部屋全体を照らす (暗すぎて魔物の姿が見えないのを防ぐ)
  const braziers = [];
  for (const rm of realRooms) {
    if (rm === sanctRoom || rm.cells.length < 20) continue;
    const want = Math.min(3, Math.floor(rm.cells.length / 22));
    const inner = rm.cells.filter(([xx, yy]) => !wallSide(xx, yy).length && !used.has(xx + ',' + yy) && !(xx === rm.cx && yy === rm.cy));
    const picked = [];
    for (let k = 0; k < 40 && picked.length < want && inner.length; k++) {
      const c = inner[Math.floor(r() * inner.length)];
      if (picked.some(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) < 3)) continue;
      picked.push(c); used.add(c[0] + ',' + c[1]);
    }
    for (const c of picked) braziers.push(cellPos(c[0], c[1]));
  }
  const SEAL_WORDS = ['fire', 'heal', 'ward', 'light', 'might'];
  for (const s of secrets) if (s.kind === 'sealed') s.word = pick(SEAL_WORDS);
  // 怪し茸(紫): 茸の一部を入れ替え、少なければ足す
  const oddShrooms = [];
  // 怪し茸は置かない(声の異変は避けられない魔物の技で起きる)
  // 笑気の罠: 回廊や部屋の床に、層ごとに数か所
  const gasTraps = [];
  const trapCells = rooms.filter(rm => rm !== rooms[0] && rm !== sanctRoom && rm !== portalRoom).flatMap(rm => floorCellsIn(rm)).filter(([xx, yy]) => !used.has(xx + ',' + yy));
  for (let k = 0; k < 2 + Math.floor(floor / 3) && trapCells.length; k++) { const c = trapCells.splice(Math.floor(r() * trapCells.length), 1)[0]; used.add(c[0] + ',' + c[1]); gasTraps.push(cellPos(c[0], c[1], 0.5)); }
  return { coopEvents, oddShrooms, gasTraps, roomEvents, mushrooms, secrets, richChests, seed, floor, grid, hgt, plats, rooms: rooms.filter(rm => rm.kind !== 'secret' && rm.kind !== 'sealed'), start: rooms[0], portalRoom, sanctRoom, portal: cellPos(portalRoom.cx, portalRoom.cy), spawns, scrolls, chests, herbs, crystals, torches, decor, braziers };
}

// 出現表: [種類, 重み, 出始める層, 層ごとの重みの変化]
const ENEMY_TABLE = [
  ['skeleton', 5, 1, -0.35], ['slime', 3.5, 1, -0.35], ['bat', 2.2, 1, 0], ['ghoul', 2, 1, 0.1],
  ['scribe', 1.5, 2, 0.1], ['wraith', 1.5, 2, 0.1], ['spider', 1.6, 2, 0.15], ['imp', 1.2, 3, 0.2],
  ['knight', 1.2, 4, 0.25], ['golem', 0.9, 4, 0.15], ['ogre', 0.8, 5, 0.2], ['lich', 0.6, 6, 0.15],
];
function pickEnemy(r, floor) {
  const list = ENEMY_TABLE.filter(e => floor >= e[2]).map(([t, w, f0, dw]) => [t, Math.max(0.3, w + dw * (floor - f0))]);
  let v = r() * list.reduce((a, e) => a + e[1], 0);
  for (const [t, w] of list) { if ((v -= w) <= 0) return t; }
  return list[0][0];
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
  floors.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, ceilingAt((x + 0.5) * CELL, (y + 0.5) * CELL, dg), (y + 0.5) * CELL); cm.setMatrixAt(i, m); });
  group.add(cm);
  const wallMat = new THREE.MeshStandardMaterial({ ...TEX.wall, color: 0xc8b8a4, roughness: 1, normalScale: new THREE.Vector2(1.5, 1.5) });
  const wg = new THREE.BoxGeometry(CELL, WALL_H, CELL); wg.translate(0, WALL_H / 2, 0);
  const wm = new THREE.InstancedMesh(wg, wallMat, walls.length);
  walls.forEach(([x, y], i) => { m.makeTranslation((x + 0.5) * CELL, 0, (y + 0.5) * CELL); wm.setMatrixAt(i, m); });
  wm.castShadow = true; wm.receiveShadow = true; group.add(wm);
  // 高い広間と通常の回廊の天井差を塞ぐ。下部の出入口は開けたままにする。
  const arena = dg.portalRoom;
  if (arena?.mod === 'dragon_hall') {
    const top = ceilingAt((arena.cx + .5) * CELL, (arena.cy + .5) * CELL, dg);
    const h = top - WALL_H, cx = (arena.x + arena.w / 2) * CELL, cz = (arena.y + arena.h / 2) * CELL;
    for (const [x, z, width, depth] of [[cx, arena.y * CELL, arena.w * CELL, .3], [cx, (arena.y + arena.h) * CELL, arena.w * CELL, .3],
      [arena.x * CELL, cz, .3, arena.h * CELL], [(arena.x + arena.w) * CELL, cz, .3, arena.h * CELL]]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(width, h, depth), wallMat);
      upper.position.set(x, WALL_H + h / 2, z); upper.castShadow = true; upper.receiveShadow = true; group.add(upper);
    }
  }
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
  // 篝火台 (台座・鉄の鉢・炎)
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.6, roughness: 0.55 });
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0c06, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 1 });
  for (const p of dg.braziers || []) {
    const bg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.25, 10), stoneMat); base.position.y = 0.12;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), stoneMat); post.position.y = 0.7;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.26, 0.3, 14, 1, true), ironMat); bowl.position.y = 1.3; bowl.material.side = THREE.DoubleSide;
    const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), coalMat); coal.position.y = 1.38;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffaa55 }));
    flame.position.y = 1.9; flame.scale.set(1.2, 1.7, 1);
    const core = flame.clone(); core.material = core.material.clone(); core.material.color.set(0xffeecc); core.scale.set(0.55, 0.8, 1); core.position.y = 1.75;
    for (const m of [base, post, bowl]) { m.castShadow = true; m.receiveShadow = true; }
    bg.add(base, post, bowl, coal, flame, core);
    bg.position.copy(p); group.add(bg);
    dg.torchObjs.push({ group: bg, flame, core, cell: null, big: true, light: p.clone().add(new THREE.Vector3(0, 2.2, 0)), phase: Math.random() * 10 });
    dg._brz = (dg._brz || []).concat([{ x: p.x, z: p.z, r: 0.45 }]);
  }
  buildDecor(dg, group);
  // 巨竜の広間は壁の松明から中央まで遠い。頭・翼と床の逃げ道を高所の灯りで照らす。
  // 影なしの4灯に限定し、通路上に当たり判定のある家具を増やさない。
  if (dg.portalRoom?.mod === 'dragon_hall') {
    const center = dg.portal, ceiling = ceilingAt(center.x, center.z, dg);
    const iron = new THREE.MeshStandardMaterial({ color: 0x453728, metalness: .6, roughness: .6 });
    for (const [dx, dz, color] of [[-11, -11, 0xffd3a0], [11, 11, 0xffd3a0], [-11, 11, 0xaac8ff], [11, -11, 0xaac8ff]]) {
      const lamp = new THREE.Group(); lamp.position.set(center.x + dx, center.y + 12, center.z + dz);
      lamp.add(new THREE.PointLight(color, 500, 44, 2));
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.38), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }));
      crystal.scale.y = 1.6; lamp.add(crystal);
      const crown = new THREE.Mesh(new THREE.TorusGeometry(.65, .07, 6, 12), iron); crown.rotation.x = Math.PI / 2; lamp.add(crown);
      const drop = ceiling - lamp.position.y;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, drop, 5), iron); chain.position.y = drop / 2; lamp.add(chain);
      group.add(lamp);
    }
  }
  for (const b of dg._brz || []) dg.solids.push(b); // 篝火台にはぶつかる
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
    if (isWallAt(p.x, p.z) || p.y >= ceilingAt(p.x, p.z)) { p.sub(step); p.y = Math.max(0, p.y); return p; }
  }
  return p;
}
