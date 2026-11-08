// 外部アセット無しでリアル寄りの質感を出すための手続き的テクスチャ生成
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makeNoise(size, seed) {
  const r = rng(seed);
  const octaves = [];
  for (let o = 0; o < 5; o++) {
    const n = 4 << o; const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = r();
    octaves.push({ n, g });
  }
  return (x, y) => { // x,y in [0,1) — タイル可能
    let v = 0, amp = 0.5, tot = 0;
    for (const { n, g } of octaves) {
      const fx = x * n, fy = y * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % n) * n + (x0 % n)], b = g[(y0 % n) * n + ((x0 + 1) % n)];
      const c = g[((y0 + 1) % n) * n + (x0 % n)], d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
      v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      tot += amp; amp *= 0.5;
    }
    return v / tot;
  };
}

// height(x,y)->0..1, color(x,y,h)->[r,g,b]
function bake(size, heightFn, colorFn, strength = 2.5) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = heightFn(x / size, y / size);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const cc = mk(), nc = mk(), rc = mk();
  const ci = cc.getContext('2d').createImageData(size, size);
  const ni = nc.getContext('2d').createImageData(size, size);
  const ri = rc.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, h = H[i];
    const hl = H[y * size + ((x - 1 + size) % size)], hr = H[y * size + ((x + 1) % size)];
    const hu = H[((y - 1 + size) % size) * size + x], hd = H[((y + 1) % size) * size + x];
    let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const [r, g, b, rough] = colorFn(x / size, y / size, h);
    ci.data.set([r, g, b, 255], i * 4);
    ni.data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, nz * 255, 255], i * 4);
    const rv = rough * 255; ri.data.set([rv, rv, rv, 255], i * 4);
  }
  cc.getContext('2d').putImageData(ci, 0, 0);
  nc.getContext('2d').putImageData(ni, 0, 0);
  rc.getContext('2d').putImageData(ri, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(cc, true), normalMap: tex(nc), roughnessMap: tex(rc) };
}

export function stoneWall() {
  const n = makeNoise(256, 11), n2 = makeNoise(256, 23);
  const rows = 6, cols = 3;
  const brick = (x, y) => {
    const row = Math.floor(y * rows);
    const off = (row % 2) * 0.5;
    const bx = (x * cols + off) % 1, by = (y * rows) % 1;
    const id = row * 7 + Math.floor(x * cols + off);
    const ex = Math.min(bx, 1 - bx) * cols * 2.0, ey = Math.min(by, 1 - by) * 2.2;
    return { e: Math.min(ex, ey), id };
  };
  return bake(512, (x, y) => {
    const { e } = brick(x, y);
    const mortar = Math.min(1, e / 0.12);
    return mortar * (0.55 + 0.45 * n(x, y)) * (0.85 + 0.15 * n2(x * 3 % 1, y * 3 % 1));
  }, (x, y, h) => {
    const { e, id } = brick(x, y);
    const tint = ((id * 9301 + 49297) % 233280) / 233280;
    const base = 70 + tint * 35 + n(x, y) * 40;
    const moss = Math.max(0, n2(x, y) - 0.62) * 3;
    if (e < 0.12) return [38, 34, 30, 0.98];
    return [base * (1 - moss * 0.4), base * 0.93 + moss * 10, base * 0.84 * (1 - moss * 0.3), 0.75 + h * 0.2];
  }, 4);
}

export function stoneFloor() {
  const n = makeNoise(256, 5), n2 = makeNoise(256, 77);
  const tile = (x, y) => {
    const t = 3; const bx = (x * t) % 1, by = (y * t) % 1;
    const id = Math.floor(x * t) * 13 + Math.floor(y * t) * 7;
    return { e: Math.min(bx, 1 - bx, by, 1 - by) * t, id };
  };
  return bake(512, (x, y) => {
    const { e } = tile(x, y);
    const groove = Math.min(1, e / 0.06);
    const crack = Math.abs(n2(x, y) - 0.5) < 0.012 ? 0.6 : 1;
    return groove * (0.6 + 0.4 * n(x, y)) * crack;
  }, (x, y, h) => {
    const { e, id } = tile(x, y);
    const tint = ((id * 9301 + 49297) % 233280) / 233280;
    const v = 55 + tint * 25 + n(x, y) * 45;
    const wet = Math.max(0, n2(x * 2 % 1, y * 2 % 1) - 0.6) * 2.5; // 濡れた部分は艶やかに
    if (e < 0.06) return [28, 25, 22, 1];
    return [v, v * 0.95, v * 0.88, Math.max(0.25, 0.85 - wet * 0.6 - h * 0.1)];
  }, 3);
}

export function ceilingTex() {
  const n = makeNoise(256, 99);
  return bake(256, (x, y) => n(x, y), (x, y, h) => {
    const v = 30 + h * 40; return [v, v * 0.95, v * 0.9, 0.95];
  }, 3);
}

export function glowSprite(color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function runeCircleTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256); g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.shadowColor = '#fff'; g.shadowBlur = 12; g.lineWidth = 6;
  g.beginPath(); g.arc(0, 0, 240, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i * 2 / 6) * Math.PI * 2; g.lineTo(Math.cos(a) * 200, Math.sin(a) * 200); }
  g.stroke();
  g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2; g.save(); g.rotate(a); g.fillText(glyphs[i], 0, -220); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function textSprite(text, opts = {}) {
  const { size = 40, color = '#fff', bg = 'rgba(0,0,0,0)', width = 1024, font = 'serif', lines = 1 } = opts;
  const lineH = size * 1.3;
  const c = document.createElement('canvas'); c.width = width; c.height = lines === 1 ? size * 2 : Math.ceil(lineH * lines + size * 0.7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  // 長い詠唱文は複数行に折り返す (空白や読点で区切り、それでも長ければ文字単位)
  const wrap = (g, txt, maxW) => {
    const out = []; let cur = '';
    for (const ch of [...txt]) {
      const next = cur + ch;
      if (g.measureText(next).width > maxW && cur) {
        const cut = Math.max(cur.lastIndexOf(' '), cur.lastIndexOf('、'));
        if (cut > cur.length * 0.4) { out.push(cur.slice(0, cut + 1).trim()); cur = cur.slice(cut + 1) + ch; }
        else { out.push(cur); cur = ch; }
      } else cur = next;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  sp.userData.set = (txt, col = color) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (!txt) { t.needsUpdate = true; sp.visible = false; return; }
    sp.visible = true;
    g.font = `bold ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    let rows = lines === 1 ? [txt] : wrap(g, txt, c.width - 40);
    if (rows.length > lines) { rows = rows.slice(0, lines); rows[lines - 1] = rows[lines - 1].slice(0, -1) + '…'; }
    const w = Math.min(c.width - 10, Math.max(...rows.map(r => g.measureText(r).width)) + 30);
    const top = (c.height - rows.length * lineH) / 2;
    g.fillStyle = bg; g.fillRect((c.width - w) / 2, lines === 1 ? 4 : top - size * 0.3, w, lines === 1 ? c.height - 8 : rows.length * lineH + size * 0.6);
    rows.forEach((r, i) => {
      const y = lines === 1 ? c.height / 2 : top + lineH * (i + 0.5);
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(r, c.width / 2, y, c.width - 20);
      g.fillStyle = col; g.fillText(r, c.width / 2, y, c.width - 20);
    });
    t.needsUpdate = true;
  };
  sp.scale.set(width / 160, c.height / 160, 1);
  sp.userData.set(text);
  return sp;
}
