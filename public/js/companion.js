// 他の魔導師の姿(精霊の子)。精霊から生まれた、まだ形の定まらない子。
//   体は一つの、角の取れた「かたまり」(頭も胴も分かれていない)。黒い粒の目が二つ(ときどき瞬く)。細い腕で大きな魔導書を抱え、短い脚でよちよち歩く。
//   体の形は皆同じ。違いは、色と、身に着ける物で出す(頭・目もと・首・服・背中・手・足の七つの枠)。
// 姿は LOOK_PARTS の組み合わせで決まる。持ち主が「姿を変える」画面で選び、短い文字列にして仲間へ送る。
//   着る物を足す時は LOOK_PARTS の names に名前を足し(必ず後ろへ。途中へ入れると保存済みの姿がずれる)、下の「着る物」の所に形を足す
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOOK_PARTS = [
  { key: 'eyes', label: '目', names: ['粒', 'まんまる', 'ほそめ', 'はなれ目', 'たて長'] },
  { key: 'head', label: '頭', names: ['なし', 'つの', 'とんがり帽', '冠', '芽', 'かぶと', 'ずきん'] },
  { key: 'face', label: '目もと', names: ['なし', '丸めがね', '片めがね', '目かくし', '口布'] },
  { key: 'neck', label: '首', names: ['なし', '襟巻き', '鈴', '蝶むすび'] },
  { key: 'wear', label: '服', names: ['なし', '前掛け', '帯', 'すそ布', '胸当て', 'たすき'] },
  { key: 'back', label: '背中', names: ['なし', '羽', '背負い箱', '外套', '尾'] },
  { key: 'hands', label: '手', names: ['素手', '手袋', '腕輪'] },
  { key: 'feet', label: '足', names: ['素足', '長靴'] },
  { key: 'mark', label: '腹の紋', names: ['輪と線', '三角', '菱', '渦', '三つ星', '波', 'なし'] },
  { key: 'halo', label: '光の輪', names: ['一重', '二重', '三つ玉', 'なし'] },
  { key: 'top', label: '頭の上', names: ['結晶', '玉', '三角錐', '立方', '輪', 'なし'] },
  { key: 'tone', label: '色合い', names: ['ふつう', 'あわい', 'こい', 'くすみ'] },
];
export const DEFAULT_LOOK = { hue: 28, hue2: 220, ...Object.fromEntries(LOOK_PARTS.map(p => [p.key, 0])) };
const clampI = (v, n) => { v = Math.floor(+v); return v >= 0 && v < n ? v : 0; };
const wrapHue = h => ((Math.round(h) % 360) + 360) % 360;
// 姿 ⇔ 文字列(仲間へ送る・保存する)。体の色相、着る物の色相、その後に LOOK_PARTS の順で番号が並ぶ。頭の「w」は並びの版
export const lookToStr = l => 'w' + [wrapHue(l.hue), wrapHue(l.hue2), ...LOOK_PARTS.map(p => l[p.key] | 0)].join('.');
export function parseLook(s) {
  const str = String(s || ''), a = str.replace(/^w/, '').split('.').map(Number), l = { ...DEFAULT_LOOK };
  if (a.length < 2 || !a.every(Number.isFinite)) return null;
  l.hue = wrapHue(a[0]);
  if (!str.startsWith('w') || a.length !== LOOK_PARTS.length + 2) { l.hue2 = (l.hue + 190) % 360; return l; }     // 並びが違う版の姿: 色だけ引き継ぐ
  l.hue2 = wrapHue(a[1]);
  LOOK_PARTS.forEach((p, i) => { l[p.key] = clampI(a[i + 2] ?? 0, p.names.length); });
  return l;
}
export function randomLook() {
  const l = { hue: Math.floor(Math.random() * 360), hue2: Math.floor(Math.random() * 360) };
  for (const p of LOOK_PARTS) l[p.key] = Math.floor(Math.random() * p.names.length);
  if (l.mark === 6 && Math.random() < 0.7) l.mark = 0;
  return l;
}
// 色だけ分かっている時(古い版の仲間など)の姿
export function lookFromColor(c) { const h = {}; new THREE.Color(c).getHSL(h); const hue = Math.round(h.h * 360); return { ...DEFAULT_LOOK, hue, hue2: (hue + 190) % 360 }; }
const TONES = [[0.55, 0.46], [0.4, 0.58], [0.72, 0.36], [0.26, 0.42]];      // [彩度, 明るさ]
export function lookColor(l) { const [s, li] = TONES[l.tone] || TONES[0]; return new THREE.Color().setHSL(l.hue / 360, s, li); }

// 体の形(皆同じ): [幅, 高さ, 奥行き, 丸み, 上のすぼまり, 傾き]
const BODY = [0.66, 0.9, 0.5, 0.5, 0.2, 0.06];
// 角の取れた、上へ少しすぼまった塊
function blockRaw(w, h, d, round, taper, lean, seg = 8) {
  let g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); s.copy(v).normalize().multiplyScalar(1.18);
    v.lerp(s, round);
    const k = 1 - taper * (v.y + 1) / 2;
    p.setXYZ(i, v.x * k * w / 2 + lean * (v.y + 1) * w / 2, v.y * h / 2, v.z * k * d / 2);
  }
  g.computeVertexNormals();
  return g;
}
// 体: 上が明るく、下へ行くほど濃い
function bodyGeo() {
  const g = blockRaw(...BODY), p = g.attributes.position, h = BODY[1], col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5, n = Math.sin(p.getX(i) * 31 + p.getY(i) * 17) * Math.sin(p.getZ(i) * 29 + p.getY(i) * 11);
    const k = 0.5 + 0.62 * Math.pow(Math.max(0, Math.min(1, y)), 0.8) + n * 0.035;
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// 体に沿う布: 体と同じ形を少し膨らませ、keep(面の中心) が真の面だけ残す。flare > 0 なら下へ行くほど広がる
let SHELL_SRC = null;
function shell(keep, inflate = 0.02, flare = 0) {
  SHELL_SRC ||= blockRaw(...BODY, 22);
  const p = SHELL_SRC.attributes.position, n = SHELL_SRC.attributes.normal, idx = SHELL_SRC.index, out = [], c = new THREE.Vector3(), hh = BODY[1] / 2;
  const a = []; for (let k = 0; k < 6; k++) a.push(new THREE.Vector3());
  // 面は四角(三角二枚)ごとに残すか決める。三角ごとに決めると、縁がのこぎりの歯のようにぎざぎざになる
  for (let i = 0; i + 5 < idx.count; i += 6) {
    c.set(0, 0, 0);
    for (let k = 0; k < 6; k++) { const j = idx.getX(i + k); a[k].set(p.getX(j) + n.getX(j) * inflate, p.getY(j) + n.getY(j) * inflate, p.getZ(j) + n.getZ(j) * inflate); c.add(a[k]); }
    c.multiplyScalar(1 / 6);
    if (!keep(c)) continue;
    for (let k = 0; k < 6; k++) { const f = 1 + flare * Math.max(0, (0.1 - a[k].y) / hh); out.push(a[k].x * f, a[k].y, a[k].z * f); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return mergeSmooth(g);
}
// 縁以外をなめらかに見せる(同じ位置の頂点をまとめてから、面の向きを計算する)
function mergeSmooth(g) { const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m; }
// 体の表面で、前(dir = -1)か後ろ(dir = 1)の (x, y) にいちばん近い所
function surfAt(geo, x, y, dir = -1) {
  const p = geo.attributes.position; let best = 1e9; const out = new THREE.Vector3(x, y, dir * 0.25);
  for (let i = 0; i < p.count; i++) { if (p.getZ(i) * dir <= 0) continue; const d = (p.getX(i) - x) ** 2 + (p.getY(i) - y) ** 2; if (d < best) { best = d; out.set(x, y, p.getZ(i)); } }
  return out;
}
// 腹の紋の絵
function markTex(kind, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; g.translate(64, 64);
  let r = seed * 9301 + 49297; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const ring = (rad, w, dash) => { g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.arc(0, 0, rad, 0, 6.2832); g.stroke(); g.setLineDash([]); };
  if (kind === 0) { ring(50, 5); ring(40, 2, [3, 7]); g.lineWidth = 6; const n = 3 + Math.floor(rnd() * 2), rot = rnd() * 6.28; for (let i = 0; i < n; i++) { const a = rot + i / n * 6.2832, r0 = rnd() < 0.5 ? 0 : 12, r1 = 22 + rnd() * 12; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); } g.beginPath(); g.arc(0, 0, 5, 0, 6.2832); g.fill(); }
  else if (kind === 1) { for (const [k, w] of [[50, 6], [26, 4]]) { g.lineWidth = w; g.beginPath(); for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * 6.2832; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * k, Math.sin(a) * k + 6); } g.stroke(); } }
  else if (kind === 2) { for (const [k, w] of [[52, 6], [30, 4]]) { g.lineWidth = w; g.beginPath(); g.moveTo(0, -k); g.lineTo(k * 0.7, 0); g.lineTo(0, k); g.lineTo(-k * 0.7, 0); g.closePath(); g.stroke(); } g.beginPath(); g.arc(0, 0, 6, 0, 6.2832); g.fill(); }
  else if (kind === 3) { g.lineWidth = 6; g.beginPath(); for (let i = 0; i <= 90; i++) { const a = i / 90 * 6.2832 * 2.6, rad = 6 + i / 90 * 46; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } g.stroke(); }
  else if (kind === 4) { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i / 3 * 6.2832; g.beginPath(); g.arc(Math.cos(a) * 30, Math.sin(a) * 30, 11, 0, 6.2832); g.fill(); } ring(54, 3, [2, 9]); }
  else if (kind === 5) { g.lineWidth = 6; for (const dy of [-26, 0, 26]) { g.beginPath(); for (let x = -46; x <= 46; x += 4) g[x === -46 ? 'moveTo' : 'lineTo'](x, dy + Math.sin(x / 46 * Math.PI * 2) * 9); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// look = 姿。色の数値だけ渡してもよい
export function makeCompanion(lookOrColor) {
  const look = typeof lookOrColor === 'object' && lookOrColor ? { ...DEFAULT_LOOK, ...lookOrColor } : lookFromColor(lookOrColor ?? 0xd8a060);
  const g = new THREE.Group();
  const main = lookColor(look), lightC = main.clone().lerp(new THREE.Color(0xffffff), 0.65);
  const bodyM = new THREE.MeshStandardMaterial({ color: main, roughness: 0.6, metalness: 0, emissive: main, emissiveIntensity: 0.04, vertexColors: true });   // 精霊の子は、内側からほのかに光る
  // 輪郭の光: 視線と直交する面ほど明るくなり、丸みが分かる
  const rimCol = { value: main.clone().lerp(new THREE.Color(0xffffff), 0.6) };
  bodyM.onBeforeCompile = sh => {
    sh.uniforms.rimCol = rimCol;
    const rim = `#include <emissivemap_fragment>
  totalEmissiveRadiance += rimCol * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6) * 0.26;`;
    sh.fragmentShader = `uniform vec3 rimCol;
` + sh.fragmentShader.replace('#include <emissivemap_fragment>', rim);
  };
  const darkM = new THREE.MeshStandardMaterial({ color: main.clone().multiplyScalar(0.34), roughness: 0.8 });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x0c0a10, roughness: 0.25 });
  const shineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const crystalM = new THREE.MeshStandardMaterial({ color: main, emissive: main, emissiveIntensity: 2, roughness: 0.2, flatShading: true });
  const glowM = () => new THREE.MeshBasicMaterial({ color: lightC, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  // 着る物の材質: 布(着る物の色)・濃い布・金物・金
  const cloth = new THREE.Color().setHSL(look.hue2 / 360, 0.5, 0.4);
  const clothM = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.85, side: THREE.DoubleSide });
  const cloth2M = new THREE.MeshStandardMaterial({ color: cloth.clone().multiplyScalar(0.55), roughness: 0.85, side: THREE.DoubleSide });
  const metalM = new THREE.MeshStandardMaterial({ color: 0x8e9098, roughness: 0.4, metalness: 0.75, side: THREE.DoubleSide });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd8b050, roughness: 0.35, metalness: 0.8 });
  const blackM = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.5, side: THREE.DoubleSide });
  const sh = m => { m.castShadow = true; return m; };
  const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); return m; };

  const [bw, bh, bd] = BODY, hh = bh / 2, CY = 0.87, lean = BODY[5] * bw * 0.6;     // CY = 体の中心の高さ
  const rig = new THREE.Group(); g.add(rig);                       // 歩く時に揺れる全体
  const geo = bodyGeo();
  const body = sh(new THREE.Mesh(geo, bodyM)); body.position.y = CY; rig.add(body);
  const EY = 0.2;                                                  // 目の高さ(体の中心から)
  // 目: 黒い粒。前(-Z)の少し上に置く
  const E = [[0.125, 0.038, 1, 1.25], [0.13, 0.055, 1, 1], [0.13, 0.05, 1, 0.38], [0.2, 0.034, 1, 1.2], [0.11, 0.034, 0.8, 2.1]][look.eyes] || [0.125, 0.038, 1, 1.25];   // [左右の離れ, 大きさ, 横, 縦]
  const eyes = [], eyeAt = [];
  for (const sx of [-1, 1]) {
    const at = surfAt(geo, sx * E[0] + lean, EY); eyeAt.push(at);
    const e = new THREE.Group(); e.position.set(at.x, at.y, at.z - 0.004);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(E[1], 14, 10), eyeM); ball.scale.set(E[2], E[3], 0.45); e.add(ball);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(E[1] * 0.24, 8, 6), shineM); shine.position.set(-E[1] * 0.3, E[1] * 0.45 * Math.min(1.3, E[3]), -E[1] * 0.42); e.add(shine);
    e.userData.open = 1; body.add(e); eyes.push(e);
  }
  // 脚: 短い棒と平たい足
  const legTop = CY - hh + 0.05, legLen = Math.max(0.12, legTop - 0.06), legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.15, legTop, 0);
    leg.add(M(new THREE.CylinderGeometry(0.045, 0.04, legLen, 8), darkM, 0, -legLen / 2, 0));
    const boots = look.feet === 1;
    const foot = M(new THREE.SphereGeometry(boots ? 0.1 : 0.085, 12, 8), boots ? cloth2M : darkM, 0, -legLen - 0.01, -0.035); foot.scale.set(1, boots ? 0.62 : 0.5, 1.45); leg.add(foot);
    if (boots) { leg.add(M(new THREE.CylinderGeometry(0.07, 0.064, legLen * 0.62, 10), cloth2M, 0, -legLen + legLen * 0.3, 0)); const cuff = M(new THREE.TorusGeometry(0.072, 0.014, 6, 16), clothM, 0, -legLen + legLen * 0.62, 0); cuff.rotation.x = Math.PI / 2; leg.add(cuff); }
    rig.add(leg); legs.push(leg);
  }
  // 大きな魔導書(体の前に浮かせて抱える)と、手・細い腕
  const bz = -bd / 2 - 0.19, BY = 0.66;      // 本は低めに抱える(腹の紋や服が隠れないように)
  const book = new THREE.Group(); book.position.set(0, BY, bz); book.rotation.x = 0.55; rig.add(book);
  book.add(M(new THREE.BoxGeometry(0.46, 0.014, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a1a20, roughness: 0.7 })));
  for (const sx of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.016, 0.27), new THREE.MeshStandardMaterial({ color: 0xe8dcbc, roughness: 0.9 })); pg.position.set(sx * 0.108, 0.013, 0); pg.rotation.z = sx * 0.1; book.add(pg); }
  const hands = [], arms = [], UP = new THREE.Vector3(0, 1, 0), vb = new THREE.Vector3();
  const link = (m, a, b) => { vb.subVectors(b, a); const len = vb.length() || 0.001; m.position.copy(a).addScaledVector(vb, 0.5); m.quaternion.setFromUnitVectors(UP, vb.normalize()); m.scale.set(1, len, 1); };
  for (const sx of [-1, 1]) {
    const glove = look.hands === 1;
    const h = new THREE.Group(); h.position.set(sx * 0.285, BY - 0.03, bz + 0.02); rig.add(h); hands.push(h);
    h.add(M(new THREE.SphereGeometry(glove ? 0.074 : 0.058, 12, 8), glove ? cloth2M : darkM));
    if (glove) { const cuff = M(new THREE.TorusGeometry(0.058, 0.018, 6, 16), clothM, sx * 0.03, 0.02, 0.05); cuff.rotation.set(0.5, sx * 0.6, 0); h.add(cuff); }
    if (look.hands === 2) { const ring = M(new THREE.TorusGeometry(0.05, 0.013, 6, 16), goldM, sx * 0.035, 0.03, 0.06); ring.rotation.set(0.5, sx * 0.6, 0); h.add(ring); }
    const shoulder = new THREE.Vector3(sx * (bw / 2 - 0.05) + lean * 0.5, CY - 0.02, 0);
    const arm = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), darkM)); rig.add(arm); arms.push({ sx, shoulder, arm });
  }
  // 腹の紋: 精霊のしるし
  let mark = null;
  if (look.mark !== 6 && ![1, 3, 4].includes(look.wear)) {                              // 前を覆う服の時は、紋は隠れる
    const at = surfAt(geo, lean * 0.4, -bh * 0.2);
    mark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: markTex(look.mark, look.hue + 1), color: lightC, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    mark.position.set(at.x, at.y, at.z - 0.012); mark.rotation.set(-0.06, Math.PI, 0); body.add(mark);
  }

  // ===== 着る物(すべて体の子にして、体と一緒に息をする) =====
  const add = m => { body.add(m); return m; };
  const topY = hh + 0.0, tx = lean * 1.6;                          // 頭のてっぺん(体は上へ行くほど少し傾く)
  let topUp = 0;                                                   // 頭に物を載せた分、頭上の飾りを上へ逃がす
  // --- 頭 ---
  if (look.head === 1) { for (const sx of [-1, 1]) { const h = add(M(new THREE.ConeGeometry(0.06, 0.2, 10), cloth2M, tx + sx * 0.17, topY - 0.02, 0)); h.rotation.z = -sx * 0.45; } topUp = 0.1; }
  if (look.head === 2) { const hat = new THREE.Group(); hat.position.set(tx, topY - 0.07, 0); hat.rotation.z = -0.1; const brim = M(new THREE.CylinderGeometry(0.4, 0.42, 0.025, 28), clothM); const cone = M(new THREE.ConeGeometry(0.26, 0.52, 20), clothM, 0, 0.27, 0); const band = M(new THREE.CylinderGeometry(0.262, 0.268, 0.05, 20, 1, true), goldM, 0, 0.04, 0); hat.add(brim, cone, band); add(hat); topUp = 0.5; }
  if (look.head === 3) { const cr = new THREE.Group(); cr.position.set(tx, topY - 0.03, 0); cr.add(M(new THREE.CylinderGeometry(0.2, 0.19, 0.08, 20, 1, true), goldM)); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832; cr.add(M(new THREE.ConeGeometry(0.035, 0.09, 4), goldM, Math.cos(a) * 0.195, 0.08, Math.sin(a) * 0.195)); } goldM.side = THREE.DoubleSide; add(cr); topUp = 0.14; }
  if (look.head === 4) { const leafM = new THREE.MeshStandardMaterial({ color: 0x5a9a3a, roughness: 0.7, side: THREE.DoubleSide }); const sp = new THREE.Group(); sp.position.set(tx, topY - 0.01, 0); sp.add(M(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 6), leafM, 0, 0.08, 0)); for (const sx of [-1, 1]) { const l = M(new THREE.SphereGeometry(0.07, 10, 8), leafM, sx * 0.065, 0.17, 0); l.scale.set(1, 0.22, 0.55); l.rotation.z = sx * 0.5; sp.add(l); } add(sp); topUp = 0.2; }
  if (look.head === 5) { add(M(shell(c => c.y > 0.3, 0.02), metalM)); add(M(new THREE.BoxGeometry(0.03, 0.1, 0.3), metalM, tx, topY + 0.04, 0)); topUp = 0.1; }
  if (look.head === 6) add(M(shell(c => c.y > 0.02 && !(c.z < -0.02 && c.y < 0.37 && Math.abs(c.x - lean) < 0.27), 0.03), clothM));
  // --- 目もと ---
  if (look.face === 1 || look.face === 2) {
    if (look.face === 1) add(M(shell(c => Math.abs(c.y - EY) < 0.035, 0.012), blackM));                                    // 留め帯
    eyeAt.forEach((at, i) => { if (look.face === 2 && i === 0) return; const rimR = Math.max(0.075, E[1] * 1.6); const rim = add(M(new THREE.TorusGeometry(rimR, 0.016, 8, 24), look.face === 1 ? metalM : goldM, at.x, at.y, at.z - 0.03)); const glass = add(M(new THREE.CircleGeometry(rimR, 24), new THREE.MeshStandardMaterial({ color: 0x9ad0e8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, side: THREE.DoubleSide }), at.x, at.y, at.z - 0.03)); rim.castShadow = glass.castShadow = false; });
  }
  if (look.face === 3) { add(M(shell(c => Math.abs(c.y - EY) < 0.075 && c.z < 0.08, 0.016), blackM)); for (const e of eyes) e.visible = false; }
  if (look.face === 4) add(M(shell(c => c.y > -0.13 && c.y < EY - 0.09 && c.z < 0.1, 0.018), clothM));
  // --- 首(目の下あたり) ---
  if (look.neck === 1) { add(M(shell(c => c.y > -0.07 && c.y < 0.05, 0.035), clothM)); const tail = add(M(new THREE.BoxGeometry(0.09, 0.26, 0.03), clothM, lean + 0.15, -0.17, -bd / 2 - 0.05)); tail.rotation.z = -0.12; }
  if (look.neck === 2) { add(M(shell(c => c.y > -0.03 && c.y < 0.02, 0.014), cloth2M)); const at = surfAt(geo, lean * 0.6, -0.04); add(M(new THREE.SphereGeometry(0.04, 12, 10), goldM, at.x, at.y - 0.01, at.z - 0.035)); }
  if (look.neck === 3) { const at = surfAt(geo, lean * 0.6, -0.02); for (const sx of [-1, 1]) { const b = add(M(new THREE.ConeGeometry(0.055, 0.11, 4), clothM, at.x + sx * 0.055, at.y, at.z - 0.03)); b.rotation.z = sx * Math.PI / 2; b.scale.z = 0.5; } add(M(new THREE.SphereGeometry(0.025, 8, 6), cloth2M, at.x, at.y, at.z - 0.04)); }
  // --- 服 ---
  if (look.wear === 1) { add(M(shell(c => c.z < -0.02 && c.y < -0.06 && Math.abs(c.x - lean * 0.3) < 0.26, 0.022), clothM)); add(M(shell(c => Math.abs(c.y + 0.08) < 0.022, 0.016), cloth2M)); }   // 前掛けと、その紐
  if (look.wear === 2) { add(M(shell(c => Math.abs(c.y + 0.26) < 0.045, 0.02), cloth2M)); const at = surfAt(geo, 0, -0.26); add(M(new THREE.BoxGeometry(0.09, 0.07, 0.02), goldM, at.x, at.y, at.z - 0.03)); }
  if (look.wear === 3) { add(M(shell(c => c.y < -0.14, 0.022, 0.32), clothM)); add(M(shell(c => Math.abs(c.y + 0.14) < 0.03, 0.03), cloth2M)); }
  if (look.wear === 4) { add(M(shell(c => c.z < -0.03 && c.y < 0.06 && c.y > -0.34, 0.024), metalM)); }
  if (look.wear === 5) { add(M(shell(c => Math.abs(c.y - (c.x * 1.0 - 0.14)) < 0.055, 0.02), clothM)); }
  // --- 背中 ---
  let wings = null;
  if (look.back === 1) { wings = []; const sgeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.34, 0.16), new THREE.Vector2(0.3, -0.04), new THREE.Vector2(0.2, -0.12), new THREE.Vector2(0.04, -0.14)])); for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.1, 0.04, bd / 2 - 0.02); const m = new THREE.Mesh(sgeo, new THREE.MeshStandardMaterial({ color: cloth, emissive: cloth, emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); m.scale.x = sx; w.add(m); w.userData.sx = sx; add(w); wings.push(w); } }
  if (look.back === 2) { const at = surfAt(geo, 0, -0.05, 1); add(M(new THREE.BoxGeometry(0.34, 0.36, 0.17), cloth2M, at.x, at.y, at.z + 0.085)); add(M(new THREE.BoxGeometry(0.36, 0.05, 0.19), clothM, at.x, at.y + 0.19, at.z + 0.085)); for (const sx of [-1, 1]) add(M(shell(c => Math.abs(c.x - sx * 0.16) < 0.028 && c.y > -0.25 && c.y < 0.2, 0.014), cloth2M)); }
  if (look.back === 3) add(M(shell(c => c.z > -0.03 && c.y < 0.1, 0.03, 0.38), clothM));
  if (look.back === 4) { const at = surfAt(geo, 0, -0.3, 1); [[0, 0.075], [0.09, 0.06], [0.17, 0.045], [0.23, 0.03]].forEach(([d, r], i) => add(M(new THREE.SphereGeometry(r, 10, 8), darkM, at.x, at.y + i * 0.025, at.z + d))); }

  // 腰のまわりの光: 輪(一重・二重)か、回る三つの玉
  const HR = Math.max(bw, bd) / 2 + (look.wear === 3 || look.back === 3 ? 0.26 : 0.14), halos = [], orbs = [];
  if (look.halo === 0 || look.halo === 1) for (let i = 0; i <= look.halo; i++) { const h = new THREE.Mesh(new THREE.TorusGeometry(HR + i * 0.05, 0.007, 5, 56), glowM()); h.position.y = 0.72; h.userData.k = i ? -1 : 1; rig.add(h); halos.push(h); }
  if (look.halo === 2) for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glowM()); o.material.opacity = 0.95; rig.add(o); orbs.push(o); }
  const motes = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), glowM()); m.userData = { a: Math.random() * 6.28, r: HR - 0.05 + Math.random() * 0.14, h: 0.5 + Math.random() * 0.8, w: 0.5 + Math.random() * 0.7 }; rig.add(m); motes.push(m); }
  // 頭の上の飾り(詠唱すると強く光る)
  const TOPY = CY + hh + 0.28 + topUp;
  const topGeo = [() => new THREE.OctahedronGeometry(0.07, 0), () => new THREE.SphereGeometry(0.065, 14, 10), () => new THREE.ConeGeometry(0.075, 0.13, 3), () => new THREE.BoxGeometry(0.095, 0.095, 0.095), () => new THREE.TorusGeometry(0.07, 0.02, 6, 20)][look.top];
  const crystal = new THREE.Mesh(topGeo ? topGeo() : new THREE.OctahedronGeometry(0.001, 0), crystalM);
  if (look.top === 0) crystal.scale.y = 1.5;
  if (look.top === 3) crystal.rotation.set(0.6, 0, 0.6);
  crystal.visible = look.top !== 5; crystal.position.set(tx, TOPY, 0); rig.add(crystal);

  // 目の高さを、見る側の目線(約1.6m)に合わせる: 全体を1.5倍に
  g.scale.setScalar(1.5);
  let t = Math.random() * 10, blink = 2 + Math.random() * 3, blinkT = 0, walk = 0, chantK = 0, castK = 0;
  g.userData = {
    companion: true, crystal, look,
    // s = { speed, chanting, cast, downed }
    tick(dt, s) {
      t += dt;
      const moving = Math.min(1, (s.speed || 0) / 2.2);
      walk += dt * (5 + moving * 6) * (moving > 0.05 ? 1 : 0);
      chantK += ((s.chanting ? 1 : 0) - chantK) * Math.min(1, dt * 6);
      castK = s.cast ? 1 : Math.max(0, castK - dt * 3);
      // よちよち歩き: 左右に揺れ、弾む。立っている時は、ゆっくり息をする
      const sw = Math.sin(walk);
      rig.rotation.z = sw * 0.09 * moving + Math.sin(t * 0.9) * 0.015;
      rig.position.y = Math.abs(Math.cos(walk)) * 0.045 * moving;
      legs[0].rotation.x = sw * 0.7 * moving; legs[1].rotation.x = -sw * 0.7 * moving;
      const breathe = 1 + Math.sin(t * 1.7) * 0.015 + chantK * 0.05 + castK * 0.08;
      body.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      body.position.y = CY + (breathe - 1) * hh;
      body.rotation.x = -chantK * 0.1 - castK * 0.16 + moving * 0.06;                  // 詠唱中は少しのけぞる
      // 瞬き
      blink -= dt; if (blink <= 0) { blink = 2.2 + Math.random() * 3.5; blinkT = 0.13; }
      blinkT = Math.max(0, blinkT - dt);
      const open = blinkT > 0 ? 0.12 : 1;
      for (const e of eyes) { e.userData.open += (open - e.userData.open) * Math.min(1, dt * 40); e.scale.y = e.userData.open; }
      // 本と手と腕: 詠唱中は高く掲げる。腕は体の脇から手へ伸びる
      const by = BY + chantK * 0.16 + Math.sin(t * 2.1) * 0.012 + castK * 0.05;
      book.position.y = by; book.rotation.x = 0.55 - chantK * 0.25;
      hands.forEach((h, i) => { h.position.y = by - 0.03 + Math.sin(t * 2.1 + i) * 0.008; });
      for (const a of arms) link(a.arm, a.shoulder, hands[a.sx < 0 ? 0 : 1].position);
      if (wings) for (const w of wings) w.rotation.y = w.userData.sx * (0.5 + Math.sin(t * (3 + chantK * 6)) * 0.35);
      // 腰の光と、漂う粒
      for (const h of halos) { const k = h.userData.k; h.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.22 * k, k < 0 ? Math.cos(t * 0.5) * 0.25 : 0, (t * 0.6 + chantK * t * 2) * k); h.position.y = 0.72 + Math.sin(t * 1.1) * 0.03 + chantK * 0.12; h.material.opacity = 0.55 + chantK * 0.4; }
      orbs.forEach((o, i) => { const a = t * (1.1 + chantK * 3) + i * 2.094; o.position.set(Math.cos(a) * HR, 0.72 + Math.sin(t * 1.4 + i * 2) * 0.1 + chantK * 0.12, Math.sin(a) * HR); });
      if (mark) mark.material.opacity = 0.6 + Math.sin(t * 2.3) * 0.12 + chantK * 0.35;
      for (const m of motes) { const u = m.userData, a = u.a + t * u.w; m.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * u.w * 1.7 + u.a) * 0.12, Math.sin(a) * u.r); }
      crystal.rotation.y += dt * (1.2 + chantK * 9);
      crystal.position.y = TOPY + Math.sin(t * 2.4) * 0.03 + chantK * 0.08;
    },
  };
  return g;
}
