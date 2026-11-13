import { makeItemGrip, itemGripProfile } from './item-grip.js';
import { makeBookHand, makeReachHand } from './fphand.js';
// 一人称の手元: 片手で抱える魔導書(開いた頁に呪文が書かれている)
// 頁は Canvas に描き、めくると書き換わる。右クリックで顔の前に掲げて読む。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G, seeded } from './state.js';
import { glowSprite, runeCircleTex } from './textures.js';
import { rubyPieces } from './lexicon.js';
import { itemModel } from './icons3d.js';
import { makeModel } from './glbmodels.js';

const W = 0.15, H = 0.21; // 片頁の大きさ

// ---------- 質感 ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
// 属性ごとの装丁: 革の色・箔の色・紋章の字・光の色
export const EL_COVER = {
  fire: { base: '#5c1610', trim: '#f0a850', ch: '炎', glow: 0xff6a20, ribbon: 0xc02a10 },
  ice: { base: '#14324e', trim: '#cfeaff', ch: '氷', glow: 0x7fd8ff, ribbon: 0x3a8ad0 },
  thunder: { base: '#2c1a4c', trim: '#f0dc70', ch: '雷', glow: 0xd8b0ff, ribbon: 0xe0c040 },
  wind: { base: '#163e2e', trim: '#d0eab0', ch: '風', glow: 0x80ffb8, ribbon: 0x40a070 },
  holy: { base: '#e2d6b4', trim: '#c49a3a', ch: '聖', glow: 0xffe48a, ribbon: 0xf0f0e0 },
  void: { base: '#160c22', trim: '#a070d8', ch: '闇', glow: 0xa050ff, ribbon: 0x401060 },
};
// 紋章だけを描いた光の型(表紙の紋が属性の色に光る)
function emblemTex(ch) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h); /* 革全体がうっすら属性の色を帯びる */
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2, 70, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 84px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, w / 2, h / 2 + 4);
  });
}
function leatherTex(base, trim, seed, ch = null) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = seeded(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // 革のしぼ
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,220,200'},${r() * 0.07})`; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s); }
    const vg = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // 金の箔押し枠
    g.strokeStyle = trim; g.lineWidth = 6; g.strokeRect(28, 28, w - 56, h - 56);
    g.lineWidth = 2; g.strokeRect(44, 44, w - 88, h - 88);
    g.beginPath(); g.arc(w / 2, h / 2, 70, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 54, 0, Math.PI * 2); g.stroke();
    if (ch) {
      // 誓った属性の紋章
      g.fillStyle = base; g.beginPath(); g.arc(w / 2, h / 2, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = trim; g.font = '700 84px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, h / 2 + 4);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 150, h / 2 + Math.sin(a) * 150, 12, 0, Math.PI * 2); g.stroke(); }
    } else {
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 54, h / 2 + Math.sin(a) * 54); g.lineTo(w / 2 + Math.cos(a + 2.35) * 54, h / 2 + Math.sin(a + 2.35) * 54); g.stroke(); }
    }
  });
}
const edgeTex = canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,90,50,${0.12 + Math.random() * 0.12})`; g.fillRect(0, y, w, 1); }
});
function parchment(g, w, h, seed) {
  const r = seeded(seed);
  g.fillStyle = '#efe0bd'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,80,30,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3); }
  const vg = g.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(110,70,20,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// 頁の傷み: 引っかき傷・擦れて薄れたインク・染み・インクの飛沫。strength を下げると控えめ(詠唱文は読めるままに)
function wear(g, w, h, seed, strength = 1) {
  const r = seeded(seed);
  g.save();
  // 擦れて薄れた所(羊皮紙の色が上からにじむ)
  for (let i = 0; i < 7 * strength; i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(232,216,178,${0.22 + r() * 0.2 * strength})`); gr.addColorStop(1, 'rgba(232,216,178,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // 引っかき傷(細く長い線が文字を横切る。明るい線と、その脇の影)
  g.lineCap = 'round';
  for (let i = 0; i < 9 * strength; i++) {
    let x = r() * w, y = r() * h; const a = r() * Math.PI, len = 40 + r() * 170, n = 6;
    for (const [col, off, lw] of [['rgba(244,232,200,0.55)', 0, 1.6], ['rgba(70,40,10,0.22)', 1.6, 1]]) {
      g.strokeStyle = col; g.lineWidth = lw * (0.6 + r() * 0.8); g.beginPath(); g.moveTo(x + off, y + off);
      let px = x, py = y;
      for (let k = 1; k <= n; k++) { px += Math.cos(a) * len / n + (r() - 0.5) * 5; py += Math.sin(a) * len / n + (r() - 0.5) * 5; g.lineTo(px + off, py + off); }
      g.stroke();
    }
  }
  // 染み(輪じみ)
  for (let i = 0; i < 3 * strength; i++) {
    const x = r() * w, y = r() * h, rad = 26 + r() * 60;
    g.strokeStyle = `rgba(110,70,25,${0.1 + r() * 0.1})`; g.lineWidth = 2 + r() * 3; g.beginPath(); g.ellipse(x, y, rad, rad * (0.7 + r() * 0.4), r() * 3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(120,80,30,0.05)'; g.fill();
  }
  // インクの飛沫
  for (let i = 0; i < 14 * strength; i++) { g.fillStyle = `rgba(30,14,4,${0.25 + r() * 0.4})`; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * r() * 3.2, 0, Math.PI * 2); g.fill(); }
  // 縁の欠けと焼け
  for (let i = 0; i < 10; i++) {
    const side = Math.floor(r() * 4), t = r(), x = side === 0 ? 0 : side === 1 ? w : t * w, y = side === 2 ? 0 : side === 3 ? h : t * h, rad = 14 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(60,34,10,0.5)'); gr.addColorStop(1, 'rgba(60,34,10,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

// ふりがな付きの文章を折り返して描く
function drawRuby(g, pieces, x, y, maxW, size, color, rubyColor) {
  const rs = Math.round(size * 0.42), lineH = size * 1.78;
  g.textBaseline = 'alphabetic';
  const width = p => { g.font = `600 ${size}px "Shippori Mincho B1", serif`; const a = g.measureText(p.t).width; if (!p.r) return a; g.font = `${rs}px serif`; return Math.max(a, g.measureText(p.r).width); };
  // 言霊の一節(空白区切り)ごとに改行し、それでも収まらなければ「、」や文字の切れ目で折る
  const groups = [[]];
  for (const p of pieces) { if (p.t === ' ') { if (groups[groups.length - 1].length) groups.push([]); } else groups[groups.length - 1].push({ ...p, w: width(p) }); }
  const lines = [];
  for (const grp of groups) {
    if (!grp.length) continue;
    let line = []; let lw = 0;
    for (const p of grp) {
      if (lw + p.w > maxW && line.length) {
        // 直前の「、」で折れるならそこで
        const ci = line.map(q => q.t).lastIndexOf('、');
        if (ci >= 0 && ci < line.length - 1 && ci > line.length * 0.4) { const rest = line.splice(ci + 1); lines.push(line); line = rest; lw = rest.reduce((s, q) => s + q.w, 0); }
        else { lines.push(line); line = []; lw = 0; }
      }
      line.push(p); lw += p.w;
    }
    if (line.length) lines.push(line);
  }
  lines.forEach((ln, i) => {
    let cx = x; const by = y + i * lineH + rs + size;
    for (const p of ln) {
      g.font = `600 ${size}px "Shippori Mincho B1", serif`; g.fillStyle = color; g.textAlign = 'center';
      g.fillText(p.t, cx + p.w / 2, by);
      if (p.r) { g.font = `${rs}px serif`; g.fillStyle = rubyColor; g.fillText(p.r, cx + p.w / 2, by - size * 0.98); }
      cx += p.w;
    }
  });
  return lines.length * lineH;
}
function wrapPlain(g, text, maxW) {
  const out = []; let cur = '';
  for (const ch of text) { if (g.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; }
  if (cur) out.push(cur); return out;
}

// ---------- 手 ----------
const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6bb9d, roughness: 0.8, metalness: 0, emissive: 0x2a0c04, emissiveIntensity: 0 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x293955, roughness: 0.9 });
const cuffMat = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.85, roughness: 0.35 });
function capsule(r, len) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), skinMat); }
// side: -1 左手 / +1 右手。本の下端の外側の角を、親指を頁に掛けて支える形
function makeHand(side, w = W, h = H) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.085, 0.026, 3, 0.011), skinMat);
  palm.position.set(side * (w * 0.78), -h / 2 + 0.03, -0.034); palm.rotation.z = side * -0.38;
  g.add(palm);
  // 外側の縁を回り込む指(関節が本の縁から覗く)
  for (let k = 0; k < 4; k++) {
    const len = [0.028, 0.032, 0.03, 0.024][k];
    const f1 = capsule(0.0088, len); f1.rotation.x = Math.PI / 2;
    f1.position.set(side * (w + 0.017), -h / 2 + 0.024 + k * 0.021, -0.016);
    const f2 = capsule(0.0082, len * 0.7); f2.rotation.z = Math.PI / 2;
    f2.position.set(side * (w + 0.006), -h / 2 + 0.024 + k * 0.021, 0.004);
    g.add(f1, f2);
  }
  // 親指: 頁の上に掛ける
  const t1 = capsule(0.0105, 0.03); t1.rotation.z = side * 1.0; t1.position.set(side * (w * 0.86), -h / 2 + 0.035, 0.016);
  const t2 = capsule(0.0095, 0.022); t2.rotation.z = side * 0.75; t2.position.set(side * (w * 0.74), -h / 2 + 0.052, 0.02);
  const nail = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8c0a8, roughness: 0.3 }));
  nail.scale.set(1, 1.2, 0.4); nail.position.set(side * (w * 0.7), -h / 2 + 0.058, 0.028);
  g.add(t1, t2, nail);
  // 手首〜前腕と袖 (手前下へ伸びる)
  const ax = new THREE.Vector3(0, -0.78, 0.62).normalize();
  const rot = -Math.atan2(0.62, 0.78);
  const wristBase = new THREE.Vector3(side * (w * 0.84), -h / 2 - 0.004, -0.03);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.031, 0.16, 14), skinMat);
  arm.position.copy(wristBase).addScaledVector(ax, 0.08); arm.rotation.x = rot;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.06, 0.24, 18, 1, true), sleeveMat);
  sleeve.material.side = THREE.DoubleSide;
  sleeve.position.copy(wristBase).addScaledVector(ax, 0.2); sleeve.rotation.x = rot;
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.006, 8, 24), cuffMat);
  cuff.position.copy(wristBase).addScaledVector(ax, 0.085); cuff.rotation.x = rot + Math.PI / 2;
  g.add(arm, sleeve, cuff);
  return g;
}

// 開いた本を片手で支える手: 掌で背表紙を下から受け、親指で左頁・小指で右頁を押さえる
function makeSpineHand() {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.075, 0.03, 3, 0.012), skinMat);
  palm.position.set(0.004, -H * 0.3, -0.048); g.add(palm);
  // 親指: 本の下の縁を表から軽く押さえる。頁の文字にかからないよう、縁ぎりぎりに留める
  // (頁の面より手前に浮かせ、紙を突き抜けないようにする)
  // (表側に指を出すと不自然な形に見えるため、指はすべて本の裏側に回す)
  // 残りの指: 右の表紙の裏に回り、下の縁から関節が覗く
  for (let k = 0; k < 3; k++) {
    const f = capsule(0.0092, 0.03); f.rotation.z = Math.PI / 2 - 0.15;
    f.position.set(0.03 + k * 0.022, -H / 2 + 0.004 - k * 0.002, -0.034); g.add(f);
  }
  // 手首〜前腕と袖 (下手前へ)
  const ax = new THREE.Vector3(0.15, -0.75, 0.64).normalize();
  const wristBase = new THREE.Vector3(0.01, -H / 2 - 0.012, -0.05);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), ax);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.17, 14), skinMat);
  arm.position.copy(wristBase).addScaledVector(ax, 0.085); arm.quaternion.copy(q);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, 0.26, 18, 1, true), sleeveMat);
  sleeve.material.side = THREE.DoubleSide;
  sleeve.position.copy(wristBase).addScaledVector(ax, 0.22); sleeve.quaternion.copy(q);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.006, 8, 24), cuffMat);
  cuff.position.copy(wristBase).addScaledVector(ax, 0.09);
  cuff.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  g.add(arm, sleeve, cuff);
  return g;
}

// ---------- 魔導書 ----------
function makeGrimoire() {
  const root = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ map: leatherTex('#4a1418', '#d6ad5a', 7), roughness: 0.7, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x7a5e2c, metalness: 0.6, roughness: 0.6 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.9 });
  const pages = {};
  for (const side of [-1, 1]) {
    const half = new THREE.Group(); half.rotation.y = side * -0.2; root.add(half);
    const cover = new THREE.Mesh(new RoundedBoxGeometry(W + 0.014, H + 0.016, 0.008, 2, 0.003), leather);
    cover.position.set(side * (W / 2 + 0.006), 0, -0.016); half.add(cover);
    const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.018), edgeMat);
    block.position.set(side * W / 2, 0, -0.004); half.add(block);
    // 頁面: 綴じ目に向かって膨らむ曲面
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 900;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(W, H, 20, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const u = (pos.getX(i) / W + 0.5); const fromSpine = side < 0 ? 1 - u : u; pos.setZ(i, Math.sin(Math.min(1, fromSpine * 1.6) * Math.PI) * 0.004 + (1 - fromSpine) * 0.003); }
    geo.computeVertexNormals();
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xc4b392 }) /* 光源の影響を受けない紙: 白飛び・にじみで文字が読めなくならないように */);
    face.position.set(side * W / 2, 0, 0.0075); half.add(face);
    pages[side < 0 ? 'left' : 'right'] = { canvas, tex, mat: face.material };
    // 金の角金具
    for (const sy of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.011), gold);
      c.position.set(side * (W + 0.006), sy * (H / 2 + 0.002), -0.016); c.rotation.z = Math.PI / 4; half.add(c);
    }
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H + 0.016, 12, 1, false, Math.PI / 2, Math.PI), leather);
  spine.rotation.y = Math.PI; spine.position.z = -0.02; root.add(spine);
  for (const y of [-0.06, 0, 0.06]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0022, 6, 16, Math.PI), gold); band.rotation.set(Math.PI / 2, 0, Math.PI); band.position.set(0, y, -0.02); root.add(band); }
  // 栞紐
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.008, H * 0.55), new THREE.MeshStandardMaterial({ color: 0x8a0f1c, roughness: 0.6, side: THREE.DoubleSide }));
  ribbon.position.set(0.012, -H * 0.3, 0.012); /* 属性で色が変わる */ ribbon.rotation.z = 0.08; root.add(ribbon);
  // めくれる頁
  const turnPivot = new THREE.Group(); root.add(turnPivot);
  // 紙は綴じ目から順に起き上がり、外の縁が遅れてついてくる(しなる)。表には今まで開いていた頁、裏には次に開く頁が書かれている
  const LN = 16, LEAF_A0 = 0.2 + 0.06, LEAF_A1 = Math.PI - 0.2 - 0.06;   // 頁の面の、わずかに上
  const leafGeo = new THREE.PlaneGeometry(W, H, LN, 1);
  const snap = () => { const c = document.createElement('canvas'); c.width = 640; c.height = 900; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return { canvas: c, tex: t }; };
  const prev = { left: snap(), right: snap() };
  const mirrored = canvas => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; return t; };
  const backTex = { left: mirrored(pages.left.canvas), prevLeft: mirrored(prev.left.canvas) };
  const leafFront = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0xc4b392, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));   // 下の頁と重なる所で、必ず手前に描く
  const leafBack = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0xc4b392, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  turnPivot.add(leafFront, leafBack); turnPivot.position.z = 0.0085; turnPivot.visible = false;
  const leaf = { geo: leafGeo, front: leafFront, back: leafBack, prev, backTex, n: LN,
    // angle: 0 = 右の頁の上に寝ている / π = 左の頁の上。lag = 外の縁の遅れ(rad)
    bend(angle, lag) {
      const pos = leafGeo.attributes.position, dx = W / LN;
      let x = 0, z = 0;
      for (let i = 0; i <= LN; i++) {
        if (i) { const u = (i - 0.5) / LN, th = Math.max(LEAF_A0, Math.min(LEAF_A1, angle - lag * Math.pow(u, 1.6))); x += Math.cos(th) * dx; z += Math.sin(th) * dx; }
        for (const row of [0, 1]) { const k = row * (LN + 1) + i; pos.setX(k, x); pos.setZ(k, z + Math.sin(Math.min(1, i / LN * 1.6) * Math.PI) * 0.003); }
      }
      pos.needsUpdate = true;
    } };
  // 詠唱中の光
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  glow.position.set(0, 0, 0.05); glow.scale.setScalar(0.2);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: runeCircleTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffd090 }));
  ring.position.set(0, 0, 0.06);
  // 綴じ目の宝玉: 誓った属性の色に灯る(持っていると手前に見える)
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), new THREE.MeshStandardMaterial({ color: 0x302018, emissive: 0x000000, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.25 }));
  gem.scale.set(1, 1.4, 0.7); gem.position.set(0, -H / 2 - 0.004, 0.006); root.add(gem);
  root.add(glow, ring, makeSpineHand());
  leaf.a0 = LEAF_A0; leaf.a1 = LEAF_A1;
  return { root, pages, glow, ring, turnPivot, leather, gold, ribbon, gem, edgeMat, leaf };
}

function makeTextbook() {
  const root = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ map: leatherTex('#5a3c22', '#9a8058', 3), roughness: 0.75 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.9 });
  const bw = 0.15, bh = 0.21;
  const body = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, 0.04, 2, 0.004), leather);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.008, bh - 0.012, 0.034), edgeMat); pages.position.x = 0.006;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.045), new THREE.MeshStandardMaterial({ map: canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#d8c08a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#3a2412'; g.font = 'bold 64px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('教 本', w / 2, h / 2); }), roughness: 0.6 }));
  label.position.set(0, 0.03, 0.0205);
  root.add(body, pages, label, makeHand(1, bw / 2 + 0.01, bh));
  return { root };
}

// 魔力薬を飲む手: 瓶を握った右手。持ち上げ → 傾けて飲み干す → 下ろす
function makeDrinkRig() {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  const S = 0.11;
  const holder = new THREE.Group(); holder.scale.setScalar(S); tilt.add(holder);
  // 握り: 掌は瓶の右側、四本の指が手前を回り込み、親指は奥
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.07, 0.06, 3, 0.012), skinMat);
  palm.position.set(0.05, 0.035, 0); tilt.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = capsule(0.0085, 0.05); f.rotation.z = Math.PI / 2; f.rotation.y = -0.35;
    f.position.set(0.012, 0.012 + i * 0.016, 0.042); tilt.add(f);
  }
  const th = capsule(0.009, 0.04); th.rotation.z = Math.PI / 2 - 0.5; th.position.set(0.02, 0.06, -0.04); tilt.add(th);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.2, 14), skinMat);
  arm.position.set(0.13, -0.06, 0.02); arm.rotation.z = 1.0; arm.rotation.x = -0.25; root.add(arm); // 前腕は傾けず、右下から伸ばす
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.064, 0.26, 18, 1, true), sleeveMat);
  sleeve.position.set(0.25, -0.14, 0.04); sleeve.rotation.z = 1.0; sleeve.rotation.x = -0.25; root.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.007, 8, 20), cuffMat);
  cuff.position.set(0.175, -0.088, 0.025); cuff.rotation.y = Math.PI / 2; cuff.rotation.x = 1.0; root.add(cuff);
  root.visible = false;
  const rig = { root, tilt, liquid: null };
  // 瓶の模型を入れ直す(Blender の模型が読み込めた後に呼ぶ)
  rig.setBottle = () => {
    holder.clear();
    const b = itemModel('ether'); if (!b) return;
    holder.add(b);
    rig.liquid = b.getObjectByName('liquid') || b.children[1] || null;
    b.traverse(o => { o.renderOrder = 11; });
  };
  rig.setBottle();
  return rig;
}

// 魔晶を叩く小槌(右手)と、宝箱の蓋に掛ける両手
function makeToolRig() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.75 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.4, metalness: 0.75 });
  const hammer = new THREE.Group();
  const tg = new THREE.Group(); tg.rotation.y = Math.PI / 2; hammer.add(tg); // 尖った側を前(打つ方)へ向ける
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.28, 8), wood); handle.position.y = 0.09; tg.add(handle);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.045, 0.045, 2, 0.008), iron); head.position.y = 0.22; tg.add(head);
  const pick = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), iron); pick.rotation.z = -Math.PI / 2; pick.position.set(0.09, 0.22, 0); tg.add(pick);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.07, 0.05, 3, 0.012), skinMat); palm.position.set(0.028, 0.0, 0); hammer.add(palm);
  for (let i = 0; i < 4; i++) { const f = capsule(0.0085, 0.035); f.rotation.x = Math.PI / 2; f.position.set(-0.004, -0.025 + i * 0.017, 0.028); hammer.add(f); }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.22, 14), skinMat); arm.position.set(0.09, -0.1, 0.02); arm.rotation.z = 0.9; hammer.add(arm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.064, 0.26, 18, 1, true), sleeveMat); sleeve.position.set(0.2, -0.18, 0.03); sleeve.rotation.z = 0.9; hammer.add(sleeve);
  root.add(hammer);
  const hands = new THREE.Group();
  for (const side of [-1, 1]) {
    const h = new THREE.Group();
    const pm = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.03, 0.08, 3, 0.012), skinMat); h.add(pm);
    for (let i = 0; i < 4; i++) { const f = capsule(0.009, 0.04); f.rotation.x = Math.PI / 2 + 0.5; f.position.set(-0.027 + i * 0.018, 0.012, -0.06); h.add(f); }
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.24, 14), skinMat); a.rotation.x = Math.PI / 2 - 0.35; a.position.set(0, -0.04, 0.12); h.add(a);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.064, 0.26, 18, 1, true), sleeveMat); sl.rotation.x = Math.PI / 2 - 0.35; sl.position.set(0, -0.09, 0.27); h.add(sl);
    h.position.set(side * 0.13, 0, 0); h.rotation.z = side * -0.15;
    hands.add(h);
  }
  root.add(hands);
  root.visible = false;
  return { root, hammer, hands };
}

// 右手に持った道具(魔晶・薬・巻物…どれでも)
function makeHeldRig(){const root=new THREE.Group(),holder=new THREE.Group(),hand=new THREE.Group();root.add(holder,hand);root.visible=false;return {root,holder,hand,key:null};}

// Blender で作った手に差し替える(読み込めた後に呼ぶ)。仮の手(箱と筒)は隠す
const PRIM_MATS = () => [skinMat, sleeveMat, cuffMat];
function hidePrimHands(root) { const ms = PRIM_MATS(); root.traverse(o => { if (o.isMesh && ms.includes(o.material) && !o.userData.blHand) o.visible = false; }); }
function blHand(key, parent, pos, rot, mirror = false) {
  const m = itemModel(key); if (!m) return null;
  m.position.set(...pos); m.rotation.set(...rot);
  if (mirror) m.scale.x = -1;
  m.traverse(o => { o.renderOrder = 11; o.userData.blHand = true; if (o.isMesh) o.frustumCulled = false; });
  parent.add(m);
  return m;
}

export function buildViewModel(camera) {
  const holder = new THREE.Group();
  const grim = makeGrimoire();
  const text = makeTextbook();
  text.root.rotation.set(0.25, -0.45, 0.12); text.root.position.set(0.04, -0.02, -0.04); text.root.scale.setScalar(0.8);
  holder.add(grim.root, text.root);
  holder.traverse(o => { o.renderOrder = 10; });
  camera.add(holder);
  const heldRig = makeHeldRig();
  heldRig.root.traverse(o => { o.renderOrder = 11; });
  camera.add(heldRig.root);
  const tool = makeToolRig();
  tool.root.traverse(o => { o.renderOrder = 11; });
  camera.add(tool.root);
  const drink = makeDrinkRig();
  drink.root.traverse(o => { o.renderOrder = 11; });
  camera.add(drink.root);
  const st = { kick: 0, swap: 0, flip: 0, flipDir: 1, read: 0 };
  let bookEl = null, lastPage = null;
  // 誓った属性で装丁を変える: 革・箔・紋章の光・栞紐・詠唱の光
  function setElement(el) {
    el = EL_COVER[el] ? el : null;
    if (el === bookEl) return;
    bookEl = el;
    const c = EL_COVER[el];
    const L = grim.leather;
    L.map?.dispose(); L.emissiveMap?.dispose();
    L.map = c ? leatherTex(c.base, c.trim, 7, c.ch) : leatherTex('#4a1418', '#d6ad5a', 7);
    L.emissiveMap = c ? emblemTex(c.ch) : null;
    L.emissive.setHex(c ? c.glow : 0x000000); L.emissiveIntensity = c ? 1.4 : 0;
    L.needsUpdate = true;
    grim.gold.color.setHex(c ? new THREE.Color(c.trim).lerp(new THREE.Color(0x7a5e2c), 0.55).getHex() : 0x7a5e2c);
    grim.ribbon.material.color.setHex(c ? c.ribbon : 0x8a0f1c);
    grim.glow.material.color.setHex(c ? c.glow : 0xffb060);
    grim.ring.material.color.setHex(c ? c.glow : 0xffd090);
    grim.gem.material.color.setHex(c ? c.glow : 0x302018); grim.gem.material.emissive.setHex(c ? c.glow : 0x000000);
    tintBook();
    if (lastPage) renderPages(...lastPage);
  }
  // 彫った魔導書(models/fp-grimoire.glb)の革を、誓った属性の色に染める
  function tintBook() {
    if (!grim.forged) return;
    const c = EL_COVER[bookEl];
    grim.forged.traverse(o => {
      if (!o.isMesh || o.material.name !== 'tint') return;
      o.material.color.set(c ? c.base : '#4a1418').multiplyScalar(1.7);
      o.material.emissive.setHex(c ? c.glow : 0x000000); o.material.emissiveIntensity = c ? 0.05 : 0;
    });
  }

  function renderPages(spell, idx, total, info) {
    const L = grim.pages.left, R = grim.pages.right;
    if (lastPage && lastPage[1] !== idx) for (const s of ['left', 'right']) { const p = grim.leaf.prev[s]; p.canvas.getContext('2d').drawImage(grim.pages[s].canvas, 0, 0); p.tex.needsUpdate = true; grim.leaf.backTex.prevLeft.needsUpdate = true; }
    lastPage = [spell, idx, total, info];
    let g = L.canvas.getContext('2d');
    parchment(g, 640, 900, 11 + idx);
    // 頁の魔法陣に、誓った属性の紋を薄く刷る
    const cv = EL_COVER[bookEl];
    if (cv) {
      g.save(); g.globalAlpha = 0.34; g.fillStyle = '#' + new THREE.Color(cv.glow).getHexString();
      g.font = '700 190px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(cv.ch, 320, 338); g.restore(); g.textBaseline = 'alphabetic';
    }
    // 左頁: 頁番号・呪文名・式・覚え書き
    g.textAlign = 'center'; g.fillStyle = '#7a4a1a'; g.font = '28px serif';
    g.fillText(total ? `— 第 ${idx + 1} 頁 / ${total} —` : '— 白紙 —', 320, 70);
    g.strokeStyle = 'rgba(150,70,20,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(320, 330, 150, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(320, 330, 120, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.beginPath(); g.moveTo(320 + Math.cos(a) * 120, 330 + Math.sin(a) * 120); g.lineTo(320 + Math.cos(a + 2.7) * 120, 330 + Math.sin(a + 2.7) * 120); g.stroke(); }
    if (spell) {
      g.fillStyle = '#2a1206'; g.font = '600 58px "Shippori Mincho B1", serif';
      g.fillText(spell.name || '無名の呪文', 320, 180);
      g.fillStyle = '#6a3410'; g.font = '26px serif';
      wrapPlain(g, info.formula, 540).slice(0, 3).forEach((ln, i) => g.fillText(ln, 320, 520 + i * 36));
      g.fillText(`消費魔力 ${info.cost}`, 320, 640);
      if (info.tier) { g.fillStyle = info.tier === '名詠' ? '#9a5a00' : '#3a4a7a'; g.font = '600 30px serif'; g.fillText(info.tier === '名詠' ? '— 名詠の文 (威力+30%) —' : '— 整詠の文 (威力+12%) —', 320, 600); }
      g.fillStyle = '#4a2a10'; g.font = 'italic 25px serif'; g.textAlign = 'left';
      wrapPlain(g, spell.memo || '', 520).slice(0, 5).forEach((ln, i) => g.fillText(ln, 60, 710 + i * 34));
    } else {
      g.fillStyle = '#4a2a10'; g.font = '30px serif'; g.fillText('魔導書(Tab)で呪文を書き記せ', 320, 520);
    }
    wear(g, 640, 900, 301 + idx * 7, 1);
    L.tex.needsUpdate = true; grim.leaf.backTex.left.needsUpdate = true;
    // 右頁: 唱える詠唱文 (ふりがな付き・大きく)
    g = R.canvas.getContext('2d');
    parchment(g, 640, 900, 23 + idx);
    g.textAlign = 'center'; g.fillStyle = '#7a4a1a'; g.font = '28px serif'; g.fillText('— 詠 唱 —', 320, 70);
    if (spell?.text) {
      const pieces = rubyPieces(spell.text);
      // 長さに応じて字の大きさを決める
      const len = pieces.reduce((s, p) => s + p.t.length, 0);
      const size = len > 70 ? 40 : len > 50 ? 46 : 54;
      drawRuby(g, pieces, 44, 100, 552, size, '#120600', '#8a3410');
    }
    g.textAlign = 'center'; g.fillStyle = 'rgba(120,60,20,0.7)'; g.font = '22px serif';
    g.fillText('声に出して唱え切れ', 320, 860);
    wear(g, 640, 900, 577 + idx * 13, 0.55); // 詠唱文は読めるよう、傷みは控えめ
    R.tex.needsUpdate = true;
  }

  function setHeld(which, key = null) {
    grim.root.visible = which === 'grimoire';
    text.root.visible = which === 'textbook';
    heldRig.root.visible = which === 'item' && !!key;
    if (which === 'item' && key && heldRig.key !== key) {
      heldRig.holder.clear(); heldRig.key = key;
      const m = key.startsWith('gear_')?G.carriedModel?.(key):itemModel(key.startsWith('scroll_')?'scroll':key);
      if (m) {
        // 手のひらに収まる大きさにそろえる
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        const sc = .16 / Math.max(size.x,size.y,size.z,.01);
        m.position.sub(c); const w = new THREE.Group(); w.add(m); w.scale.setScalar(sc); const profile=itemGripProfile(key,size.clone().multiplyScalar(sc));w.position.y=profile.offset;heldRig.hand.clear();heldRig.hand.add(makeItemGrip(profile));
        w.traverse(o => { o.renderOrder = 11; });
        heldRig.holder.add(w);
      }
    }
  }

  // 毎フレーム: 歩行の揺れ・詠唱の光・掲げる動き・頁めくり
  // 飲む動き (k: 0→1 で進む。-1 なら飲んでいない)
  const ease = x => x * x * (3 - 2 * x);
  function updateDrink(k) {
    drink.root.visible = k >= 0;
    if (k < 0) return 0;
    const up = k < 0.25 ? ease(k / 0.25) : k > 0.82 ? ease(1 - (k - 0.82) / 0.18) : 1; // 持ち上げ・下ろし
    const sip = k < 0.15 ? 0 : k > 0.82 ? 1 - ease((k - 0.82) / 0.18) : ease(Math.min(1, (k - 0.15) / 0.22)); // 傾き
    const lv = k < 0.3 ? 1 : Math.max(0.08, 1 - (k - 0.3) / 0.45);
    drink.root.position.set(0.2 - 0.17 * up - 0.02 * sip, -0.5 + 0.3 * up + 0.08 * sip + Math.sin(k * 40) * 0.002 * sip, -0.46 + 0.12 * sip);
    drink.tilt.rotation.set(1.75 * sip, 0, 0.35 * (1 - up) - 0.1 * sip);
    if (drink.liquid) drink.liquid.scale.y = lv;
    return up;
  }
  // 掘る・こじ開ける動き
  function updateTool(work, time) {
    tool.root.visible = !!work;
    if (!work) return 0;
    const crystal = work.kind === 'crystal';
    tool.hammer.visible = crystal; tool.hands.visible = !crystal;
    if (crystal) {
      const seg = (work.prog * 3) % 1; // 三度の打ち込み。各区切りの終わりで当たる
      const raise = seg < 0.65 ? ease(seg / 0.65) : 1 - ease((seg - 0.65) / 0.35);
      tool.hammer.scale.setScalar(0.62);
      // 振り上げ: 柄を立てて後ろへ / 振り下ろし: 前下の魔晶へ打ち込む
      tool.hammer.position.set(0.12 + 0.08 * raise, -0.27 + 0.1 * raise, -0.5 + 0.06 * raise);
      tool.hammer.rotation.set(-0.9 + 1.4 * raise, 0.25, 0);
    } else {
      const lift = ease(Math.min(1, work.prog * 1.3));
      tool.hands.scale.setScalar(0.7);
      tool.hands.position.set(0, -0.27 + 0.07 * lift + Math.sin(time * 40) * 0.003, -0.62);
      tool.hands.rotation.set(-0.15 - 0.2 * lift, 0, 0);
    }
    return 1;
  }
  function update(dt, { bob, chanting, chantWords, reading, alive, time, drinkK = -1, work = null }) {
    const dUp = updateDrink(alive ? drinkK : -1);
    const wUp = updateTool(alive ? work : null, time);
    // 手に持った道具: 歩くと揺れる。飲む・掘る間は隠す
    if (heldRig.root.visible || heldRig.key) {
      const show = grim.root.visible === false && text.root.visible === false && heldRig.key && dUp === 0 && !work && alive;
      heldRig.root.visible = !!show;
      heldRig.root.position.set(0.24 + Math.cos(bob * 0.5) * 0.01, -0.26 + Math.abs(Math.sin(bob * 0.5)) * 0.01 - st.swap * 0.2 - st.kick * 0.05, -0.48);
      heldRig.root.rotation.set(-0.25 - st.kick * 0.6, -0.35, 0.08);
      heldRig.holder.rotation.y = 0;
    }
    st.swap = Math.max(st.swap, dUp * 0.9, wUp * 0.9);
    st.kick = Math.max(0, st.kick - dt * 4);
    st.swap = Math.max(0, st.swap - dt * 3);
    st.read += ((reading ? 1 : 0) - st.read) * Math.min(1, dt * 9);
    const r = st.read, e = r * r * (3 - 2 * r);
    const sway = 1 - e * 0.85;
    const bx = 0.36 + Math.cos(bob * 0.5) * 0.012 * sway, by = -0.22 + Math.abs(Math.sin(bob * 0.5)) * 0.012 * sway + (chanting ? 0.04 : 0) - st.swap * 0.25;
    holder.position.set(bx + (0.0 - bx) * e, by + (-0.07 - by) * e, -0.56 + (-0.4 + 0.56) * e - st.kick * 0.1);
    holder.rotation.set(-0.6 + (chanting ? 0.2 : 0) + (0.42 + (chanting ? -0.2 : 0)) * e - st.kick * 0.3, -0.42 * (1 - e), 0.0);
    holder.scale.setScalar(0.62 + 0.3 * e);
    // 頁めくり
    if (st.flip > 0) {
      const lf = grim.leaf, fwd = st.flipDir > 0, PL = grim.pages.left, PR = grim.pages.right;
      if (!st.flipping) {   // めくり始め: 紙の表に今までの頁、裏に次の頁。めくり終えるまで、紙の下になる側は前の頁のまま
        st.flipping = true;
        lf.front.material.map = fwd ? lf.prev.right.tex : PR.tex; lf.back.material.map = fwd ? lf.backTex.left : lf.backTex.prevLeft;
        lf.front.material.needsUpdate = lf.back.material.needsUpdate = true;
        (fwd ? PL : PR).mat.map = (fwd ? lf.prev.left : lf.prev.right).tex;
      }
      st.flip = Math.max(0, st.flip - dt * 2.1);
      const k = 1 - st.flip, e2 = k * k * (3 - 2 * k);
      const ang = lf.a0 + (lf.a1 - lf.a0) * (fwd ? e2 : 1 - e2);
      lf.bend(ang, Math.sin(k * Math.PI) * 1.05 * (fwd ? 1 : -1));
      const shade = 0.72 + 0.28 * Math.abs(Math.cos(ang));          // 立っている間は陰る
      lf.front.material.color.setHex(0xc4b392).multiplyScalar(shade); lf.back.material.color.setHex(0xc4b392).multiplyScalar(shade);
      grim.turnPivot.visible = st.flip > 0;
      if (st.flip <= 0) { st.flipping = false; PL.mat.map = PL.tex; PR.mat.map = PR.tex; }
    }
    const ck = chanting ? 1 : 0;
    grim.glow.scale.setScalar(0.08 + ck * 0.1 + st.kick * 0.3 + Math.sin(time * 10) * 0.01);
    grim.glow.material.opacity = (ck * 0.35 + st.kick * 0.4) * (1 - e * 0.9);
    grim.ring.material.opacity += ((chanting ? 0.5 * (1 - e * 0.6) : 0) - grim.ring.material.opacity) * Math.min(1, dt * 8);
    grim.ring.rotation.z += dt * (1 + (chantWords || 0) * 0.6);
    holder.visible = alive;
  }
  return {
    holder, renderPages, setHeld, update, setElement, get readAmount() { return st.read; }, get flipAmount() { return st.flip; },
    refreshItems() {
      drink.setBottle(); heldRig.key = null; // 手に持った物は、次に持ち替えた時に彫った手で組み直す
      if (!grim.forged) { const b = makeModel('fp-grimoire');
        if (b) { const old = [grim.leather, grim.gold, grim.edgeMat];
          grim.root.traverse(o => { if (o.isMesh && old.includes(o.material)) o.visible = false; });
          b.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.frustumCulled = false; o.renderOrder = 10; o.castShadow = false; } });
          grim.forged = b; grim.root.add(b); tintBook(); } }
      // 彫った手(骨入り)に差し替える: 魔導書・教本を支える手、小槌を握る手、蓋に掛ける両手
      if (!grim.hand) { const h = makeBookHand({}); if (h) { hidePrimHands(grim.root); grim.hand = h; grim.root.add(h.root); } }
      if (!text.hand) { const h = makeBookHand({ x: 0.03, bottom: -0.105, back: -0.02, thumb: { abd: 1.15 } }); if (h) { hidePrimHands(text.root); text.hand = h; text.root.add(h.root); } }
      if (!tool.forged) { const a = makeReachHand(false), b = makeReachHand(true);
        if (a && b) { tool.forged = true; hidePrimHands(tool.root);
          const g = makeItemGrip({ radiusX: .013, radiusZ: .013 }); g.position.set(0, 0.0, 0); tool.hammer.add(g);
          tool.hands.children.forEach((h, i) => { const fh = i ? a : b; fh.root.position.set(0, 0.012, 0.085); h.add(fh.root); }); } }
      // The same rounded hand is used while carrying and while drinking.
      hidePrimHands(drink.tilt);hidePrimHands(drink.root);
      drink.hand?.removeFromParent();drink.hand=makeItemGrip({radiusX:.039,radiusZ:.039});drink.hand.position.y=.035;drink.tilt.add(drink.hand);

    },
    debug: { get held() { return heldRig; }, get drink() { return drink; }, get tool() { return tool; } },
    kick() { st.kick = 1; },
    useKick() { st.kick = 1; }, swap() { st.swap = 1; }, flip(dir) { st.flip = 1; st.flipDir = dir; },
  };
}
