// 一人称の手元: 片手で抱える魔導書(開いた頁に呪文が書かれている)
// 頁は Canvas に描き、めくると書き換わる。右クリックで顔の前に掲げて読む。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seeded } from './state.js';
import { glowSprite, runeCircleTex } from './textures.js';
import { rubyPieces } from './lexicon.js';

const W = 0.15, H = 0.21; // 片頁の大きさ

// ---------- 質感 ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
function leatherTex(base, trim, seed) {
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
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 54, h / 2 + Math.sin(a) * 54); g.lineTo(w / 2 + Math.cos(a + 2.35) * 54, h / 2 + Math.sin(a + 2.35) * 54); g.stroke(); }
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
const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a383, roughness: 0.55, metalness: 0, emissive: 0x2a0c04, emissiveIntensity: 0.25 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1c1226, roughness: 0.9 });
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
  ribbon.position.set(0.012, -H * 0.3, 0.012); ribbon.rotation.z = 0.08; root.add(ribbon);
  // めくれる頁
  const turnPivot = new THREE.Group(); root.add(turnPivot);
  const turn = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: 0xefe0bd, roughness: 0.9, side: THREE.DoubleSide }));
  turn.position.x = W / 2; turnPivot.add(turn); turnPivot.position.z = 0.008; turnPivot.visible = false;
  // 詠唱中の光
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  glow.position.set(0, 0, 0.05); glow.scale.setScalar(0.2);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: runeCircleTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffd090 }));
  ring.position.set(0, 0, 0.06);
  root.add(glow, ring, makeSpineHand());
  return { root, pages, glow, ring, turnPivot };
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

export function buildViewModel(camera) {
  const holder = new THREE.Group();
  const grim = makeGrimoire();
  const text = makeTextbook();
  text.root.rotation.set(0.25, -0.45, 0.12); text.root.position.set(0.04, -0.02, -0.04); text.root.scale.setScalar(0.8);
  holder.add(grim.root, text.root);
  holder.traverse(o => { o.renderOrder = 10; });
  camera.add(holder);
  const st = { kick: 0, swap: 0, flip: 0, flipDir: 1, read: 0 };

  function renderPages(spell, idx, total, info) {
    const L = grim.pages.left, R = grim.pages.right;
    let g = L.canvas.getContext('2d');
    parchment(g, 640, 900, 11 + idx);
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
    L.tex.needsUpdate = true;
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
    R.tex.needsUpdate = true;
  }

  function setHeld(which) {
    grim.root.visible = which === 'grimoire';
    text.root.visible = which === 'textbook';
  }

  // 毎フレーム: 歩行の揺れ・詠唱の光・掲げる動き・頁めくり
  function update(dt, { bob, chanting, chantWords, reading, alive, time }) {
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
      st.flip = Math.max(0, st.flip - dt * 3.2);
      grim.turnPivot.visible = st.flip > 0;
      const k = 1 - st.flip;
      grim.turnPivot.rotation.y = st.flipDir > 0 ? -Math.PI * k : -Math.PI * (1 - k);
      grim.turnPivot.position.z = 0.008 + Math.sin(k * Math.PI) * 0.02;
    }
    const ck = chanting ? 1 : 0;
    grim.glow.scale.setScalar(0.08 + ck * 0.1 + st.kick * 0.3 + Math.sin(time * 10) * 0.01);
    grim.glow.material.opacity = (ck * 0.35 + st.kick * 0.4) * (1 - e * 0.9);
    grim.ring.material.opacity += ((chanting ? 0.5 * (1 - e * 0.6) : 0) - grim.ring.material.opacity) * Math.min(1, dt * 8);
    grim.ring.rotation.z += dt * (1 + (chantWords || 0) * 0.6);
    holder.visible = alive;
  }
  return {
    holder, renderPages, setHeld, update, get readAmount() { return st.read; },
    kick() { st.kick = 1; }, swap() { st.swap = 1; }, flip(dir) { st.flip = 1; st.flipDir = dir; },
  };
}
