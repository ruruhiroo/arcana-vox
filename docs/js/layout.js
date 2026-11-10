// 迷宮の間取り: 手作りの「部屋の型」を、扉と扉でつないで組み上げる
// 型には床の高さ(段・高台・吹き抜け)も描いてあり、階段の型で高さの違う区画どうしをつなぐ。
// 書式:  . 床(高さ0)   1〜4 高い床(×0.6m)   # 柱(壊せる壁)   空白 型の外
//        doors: 扉の位置 [x, y] (型の縁にある床)。扉の外へ一マスの通路を挟んで次の型がつながる
export const MODULES = [
  // ---- 回廊 ----
  { id: 'hall_s', kind: 'corridor', w: 5, rows: ['.', '.', '.', '.', '.'], doors: [[0, 0], [0, 4]] },
  { id: 'hall_l', kind: 'corridor', w: 4, rows: ['.', '.', '.', '.', '.', '.', '.', '.'], doors: [[0, 0], [0, 7]] },
  { id: 'hall_turn', kind: 'corridor', w: 4, rows: ['.  ', '.  ', '...'], doors: [[0, 0], [2, 2, 'e']] },
  { id: 'hall_t', kind: 'corridor', w: 3, rows: ['...', ' . ', ' . '], doors: [[0, 0], [2, 0], [1, 2]] },
  { id: 'hall_x', kind: 'corridor', w: 2, rows: [' . ', '...', ' . '], doors: [[1, 0], [0, 1], [2, 1], [1, 2]] },
  { id: 'hall_wide', kind: 'corridor', w: 2, rows: ['..', '..', '..', '..', '..', '..'], doors: [[0, 0], [1, 5]] },
  { id: 'hall_zig', kind: 'corridor', w: 2, rows: ['.  ', '.. ', ' ..', '  .'], doors: [[0, 0], [2, 3]] },
  // ---- 階段 (高さの違う区画をつなぐ) ----
  { id: 'stairs', kind: 'stairs', w: 4, rows: ['.', '.', '1', '2', '3', '4'], doors: [[0, 0], [0, 5]] },
  { id: 'stairs_w', kind: 'stairs', w: 2, rows: ['..', '..', '11', '22', '33', '44', '44'], doors: [[0, 0], [1, 6]] },
  { id: 'stairs_turn', kind: 'stairs', w: 2, rows: ['.  ', '1  ', '234'], doors: [[0, 0], [2, 2, 'e']] },
  { id: 'ramp_short', kind: 'stairs', w: 2, rows: ['.', '1', '2', '2'], doors: [[0, 0], [0, 3]] },
  // ---- 部屋 ----
  { id: 'room_s', kind: 'room', w: 3, rows: ['...', '...', '...'], doors: [[1, 0], [0, 1], [2, 1], [1, 2]] },
  { id: 'room_m', kind: 'room', w: 4, rows: ['....', '....', '....', '....', '....'], doors: [[1, 0], [0, 3], [3, 2], [2, 4]] },
  { id: 'closet', kind: 'room', w: 2, rows: ['..', '..'], doors: [[0, 0]], theme: 'storage' },
  { id: 'pillars', kind: 'room', w: 3, rows: ['.......', '.#...#.', '.......', '...#...', '.......', '.#...#.', '.......'], doors: [[3, 0], [0, 3], [6, 3], [3, 6]] },
  { id: 'gallery', kind: 'room', w: 2, rows: ['...', '...', '#.#', '...', '...', '#.#', '...', '...', '...'], doors: [[1, 0], [0, 4], [2, 6], [1, 8]], theme: 'library' },
  { id: 'balcony', kind: 'room', w: 3, rows: ['333333', '333333', '.....2', '.....1', '......', '......'], doors: [[2, 0], [0, 4], [5, 4], [2, 5]] },
  { id: 'pit', kind: 'room', w: 2, rows: ['2222222', '2222222', '22...22', '22...12', '22...22', '2222222', '2222222'], doors: [[3, 0], [0, 3], [6, 3], [3, 6]] },
  { id: 'dais', kind: 'room', w: 3, rows: ['.......', '..111..', '..121..', '..111..', '.......'], doors: [[3, 0], [0, 2], [6, 2], [3, 4]], theme: 'shrine' },
  { id: 'twotier', kind: 'room', w: 3, rows: ['222222', '222222', '1.....', '......', '......'], doors: [[3, 0], [0, 4], [5, 3]] },
  { id: 'crypt', kind: 'room', w: 2, rows: ['.....', '.#.#.', '.....', '.#.#.', '.....', '.#.#.', '.....'], doors: [[2, 0], [0, 2], [4, 4], [2, 6]], theme: 'crypt' },
  { id: 'library', kind: 'room', w: 2, rows: ['.......', '.......', '.......', '.......', '.......', '.......'], doors: [[3, 0], [0, 2], [6, 3], [3, 5]], theme: 'library' },
  { id: 'cave', kind: 'room', w: 2, rows: [' .... ', '......', '..... ', ' .....', '......', ' ...  '], doors: [[2, 0], [0, 1], [5, 3], [2, 5]], theme: 'ruin' },
  { id: 'round', kind: 'room', w: 2, rows: ['  ...  ', ' ..... ', '.......', '.......', '.......', ' ..... ', '  ...  '], doors: [[3, 0], [0, 3], [6, 3], [3, 6]] },
  { id: 'loft', kind: 'room', w: 2, rows: ['......', '.4444.', '.4..4.', '.4..3.', '.4442.', '....1.'], doors: [[2, 0], [0, 3], [5, 2], [0, 5]] },
  { id: 'court', kind: 'room', w: 1, rows: ['.........', '.#.....#.', '.........', '...111...', '...1.1...', '...111...', '.........', '.#.....#.', '.........'], doors: [[4, 0], [0, 4], [8, 4], [4, 8]], big: true },
];

const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
const LV = 0.6, MAXH = 2.4;

// 型を 90° ずつ回したものを用意する
function rotate(m, k) {
  let rows = m.rows.map(r => r.padEnd(Math.max(...m.rows.map(x => x.length))));
  const CW = { n: 'e', e: 's', s: 'w', w: 'n' };
  let doors = m.doors.map(d => d.slice());
  for (let i = 0; i < k; i++) {
    const h = rows.length, w = rows[0].length;
    const nr = [];
    for (let x = 0; x < w; x++) { let s = ''; for (let y = h - 1; y >= 0; y--) s += rows[y][x]; nr.push(s); }
    doors = doors.map(([x, y, dir]) => [h - 1 - y, x, dir && CW[dir]]);
    rows = nr;
  }
  const h = rows.length, w = rows[0].length;
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (c === ' ' || c === '#') continue;
    cells.push({ x, y, h: c === '.' ? 0 : (+c) * LV });
  }
  const at = (x, y) => cells.find(c => c.x === x && c.y === y);
  const ds = doors.map(([x, y, dir]) => ({ x, y, dir: dir || (y === 0 ? 'n' : y === h - 1 ? 's' : x === 0 ? 'w' : 'e'), h: at(x, y)?.h ?? 0 }));
  const pillars = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') pillars.push({ x, y });
  return { ...m, rows, w: m.w, cw: w, ch: h, cells, doors: ds, pillars };
}
const VARIANTS = MODULES.flatMap(m => [0, 1, 2, 3].map(k => rotate(m, k)));
// 隠し部屋の型(どの向きの扉からでも入れるよう、四辺の中ほどに扉)
const SECRET_MODS = [
  { id: 'vault', kind: 'secret', rows: ['...', '...', '...'], doors: [[1, 0], [1, 2], [0, 1], [2, 1]] },
  { id: 'vault_l', kind: 'secret', rows: ['....', '....', '....'], doors: [[1, 0], [2, 2], [0, 1], [3, 1]] },
  { id: 'nook', kind: 'secret', rows: ['..', '..'], doors: [[0, 0, 'n'], [1, 1, 's'], [0, 1, 'w'], [1, 0, 'e']] },
];
const SECRET_VARIANTS = SECRET_MODS.flatMap(m => [0, 1].map(k => rotate(m, k)));

export function buildLayout(r, floor, W, H) {
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const want = Math.min(26, 13 + floor);   // 区画の数 (深いほど広い)
  for (let attempt = 0; attempt < 12; attempt++) {
    const owner = new Int16Array(W * H).fill(-1);
    const grid = new Uint8Array(W * H), hgt = new Float32Array(W * H);
    const rooms = [];
    const open = [];
    const free = (gx, gy) => gx >= 1 && gy >= 1 && gx < W - 1 && gy < H - 1;
    const fits = (v, ox, oy, elev) => {
      for (const c of v.cells) {
        const gx = ox + c.x, gy = oy + c.y, hh = elev + c.h;
        if (!free(gx, gy) || hh < -0.01 || hh > MAXH + 0.01) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && owner[ny * W + nx] >= 0) return false;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny * W + nx]) return false; // 通路にも触れない
        }
      }
      return true;
    };
    const place = (v, ox, oy, elev) => {
      const id = rooms.length;
      const cells = [];
      for (const c of v.cells) { const gx = ox + c.x, gy = oy + c.y; grid[gy * W + gx] = 1; hgt[gy * W + gx] = Math.max(0, elev + c.h); owner[gy * W + gx] = id; cells.push([gx, gy]); }
      const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x + 1, h = Math.max(...ys) - y + 1;
      // 中心に近い床
      const mx = x + w / 2 - 0.5, my = y + h / 2 - 0.5;
      const cc = cells.slice().sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0];
      const rm = { id, mod: v.id, kind: v.kind, x, y, w, h, cx: cc[0], cy: cc[1], cells, shape: v.id, theme: v.theme || null, flat: v.cells.every(c => c.h === v.cells[0].h), elev, big: !!v.big };
      rooms.push(rm);
      for (const d of v.doors) open.push({ x: ox + d.x, y: oy + d.y, dir: d.dir, h: elev + d.h, room: id });
      return rm;
    };
    // 最初の部屋: 平らな部屋を中央付近に
    const first = pick(VARIANTS.filter(v => v.kind === 'room' && v.cells.every(c => c.h === 0) && v.doors.length >= 3 && !v.big));
    place(first, (W >> 1) - (first.cw >> 1) + ri(-4, 4), (H >> 1) - (first.ch >> 1) + ri(-4, 4), 0);
    let fails = 0;
    let bigPlaced = false;
    while (rooms.length < want && open.length && fails < 900) {
      const di = Math.floor(r() * open.length), d = open[di];
      const from = rooms[d.room];
      // 回廊の先は部屋、部屋の先は回廊か階段が多い (部屋どうしが直に並びすぎないように)
      const roll = r();
      let kind = from.kind === 'room' ? (roll < 0.62 ? 'corridor' : roll < 0.82 ? 'stairs' : 'room') : (roll < 0.68 ? 'room' : roll < 0.84 ? 'corridor' : 'stairs');
      const cands = VARIANTS.filter(v => v.kind === kind && (!v.big || (!bigPlaced && rooms.length > 4)) && (v.id !== 'closet' || r() < 0.4));
      const v = pick(cands);
      const dl = v.doors.filter(x => x.dir === OPP[d.dir]);
      if (!dl.length) { fails++; continue; }
      const vd = pick(dl);
      const [dx, dy] = DIRS[d.dir];
      const tx = d.x + dx * 2, ty = d.y + dy * 2;      // 新しい型の扉の位置 (間に一マスの通路)
      const ox = tx - vd.x, oy = ty - vd.y, elev = d.h - vd.h;
      const gx = d.x + dx, gy = d.y + dy;
      if (!free(gx, gy) || grid[gy * W + gx] || !fits(v, ox, oy, elev)) { fails++; continue; }
      place(v, ox, oy, elev);
      if (v.big) bigPlaced = true;
      grid[gy * W + gx] = 1; hgt[gy * W + gx] = d.h;      // つなぎの通路
      open.splice(di, 1);
      const ni = open.findIndex(o => o.x === tx && o.y === ty);
      if (ni >= 0) open.splice(ni, 1);
    }
    const nRooms = rooms.filter(rm => rm.kind === 'room').length;
    if (nRooms < 6 && attempt < 11) continue;
    // 輪: 向かい合う扉が一マス挟んで並んでいれば(高さも同じなら)つなぐ。行き止まりばかりにならないように
    for (const a of open) {
      const [dx, dy] = DIRS[a.dir];
      const gx = a.x + dx, gy = a.y + dy, bx = a.x + dx * 2, by = a.y + dy * 2;
      if (!free(gx, gy) || grid[gy * W + gx]) continue;
      if (bx < 0 || by < 0 || bx >= W || by >= H || !grid[by * W + bx]) continue;
      if (owner[by * W + bx] === a.room || Math.abs(hgt[by * W + bx] - a.h) > 0.65) continue;
      grid[gy * W + gx] = 1; hgt[gy * W + gx] = Math.max(a.h, hgt[by * W + bx]);
    }
    // 隠し部屋: 使われずに残った扉の先、壁一枚(1マス)向こうに小部屋を置く。その1マスは壁のまま
    //   secret = ひびの入った壁(攻撃の術で砕ける) / sealed = 封印の扉(刻まれた言霊を唱えると開く)
    const secrets = [];
    const wantSecret = 1 + (floor >= 3 ? 1 : 0) + (floor >= 7 ? 1 : 0), wantSealed = floor >= 2 ? 1 + (floor >= 6 ? 1 : 0) : (r() < 0.6 ? 1 : 0);
    const cand = open.slice().sort(() => r() - 0.5);
    for (const a of cand) {
      const nS = secrets.filter(s => s.kind === 'secret').length, nZ = secrets.filter(s => s.kind === 'sealed').length;
      if (nS >= wantSecret && nZ >= wantSealed) break;
      const kind = nZ < wantSealed && (nS >= wantSecret || r() < 0.5) ? 'sealed' : 'secret';
      const [dx, dy] = DIRS[a.dir];
      const gx = a.x + dx, gy = a.y + dy;
      if (!free(gx, gy) || grid[gy * W + gx]) continue;
      // 壁の1マスが、扉以外の床と接していない(よそから素通りできない)こと
      let touch = 0;
      for (const [ex, ey] of Object.values(DIRS)) if (grid[(gy + ey) * W + gx + ex]) touch++;
      if (touch !== 1) continue;
      const opts = SECRET_VARIANTS.filter(v => v.doors.some(d => d.dir === OPP[a.dir])).sort(() => r() - 0.5);
      for (const v of opts) {
        const vd = v.doors.find(d => d.dir === OPP[a.dir]);
        const ox = a.x + dx * 2 - vd.x, oy = a.y + dy * 2 - vd.y;
        if (!fits(v, ox, oy, a.h)) continue;
        const nOpen = open.length;
        const rm = place({ ...v, doors: [] }, ox, oy, a.h);
        open.length = nOpen;
        rm.kind = kind;
        secrets.push({ kind, cell: [gx, gy], from: [a.x, a.y], dir: a.dir, room: rm.id, h: a.h });
        break;
      }
    }
    // 柱
    // (柱は壁として残る = 壊せる)
    // 高台: 部屋の中の、周りより高い床
    const plats = [];
    for (const rm of rooms) {
      if (rm.kind !== 'room' || rm.flat) continue;
      const base = Math.min(...rm.cells.map(([x, y]) => hgt[y * W + x]));
      const top = Math.max(...rm.cells.map(([x, y]) => hgt[y * W + x]));
      const cells = rm.cells.filter(([x, y]) => hgt[y * W + x] >= top - 0.01 && top - base >= 1.1);
      if (cells.length) plats.push({ rm, cells, top });
    }
    return { grid, hgt, rooms, plats, secrets };
  }
  throw new Error('layout failed');
}
