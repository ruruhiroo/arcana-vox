// 魔物の造形: 骨格のある骸骨兵、内に骨を溶かす粘獣、裂けた外套の怨霊、亀裂に魔力の走る石像兵
// 関節ごとにまとめてあり、歩く・振る・漂うなどの動きを付けられる
import * as THREE from 'three';

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (!opts.linear) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
let T = null;
function textures() {
  if (T) return T;
  const bone = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d6c9a8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v < 0.5 ? '90,70,40' : '255,250,230'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(60,45,25,.5)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rnd(-14, 14); y += rnd(-14, 14); g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) { const gr = g.createRadialGradient(Math.random() * w, Math.random() * h, 2, Math.random() * w, Math.random() * h, 40); gr.addColorStop(0, 'rgba(80,60,30,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  });
  const rock = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5e5850'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const v = Math.random() * 80; g.fillStyle = `rgba(${v},${v},${v * 0.95},.2)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(60,80,40,${rnd(0.2, 0.45)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rnd(8, 26), rnd(5, 14), Math.random() * 3, 0, 6.28); g.fill(); } // 苔
  });
  const runes = canvasTex(256, 256, (g, w, h) => { // 亀裂を走る魔力 (発光)
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff7a20'; g.lineWidth = 2.5; g.shadowColor = '#ff5a00'; g.shadowBlur = 6;
    for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-30, 30); y += rnd(-30, 30); g.lineTo(x, y); } g.stroke(); }
  });
  const cloth = canvasTex(256, 256, (g, w, h) => { // 裂けた外套 (透明の穴と裾)
    g.clearRect(0, 0, w, h); g.fillStyle = '#16101e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(60,40,80,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
    g.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < w; x += 8) { const d = rnd(10, 60); g.beginPath(); g.moveTo(x, h); g.lineTo(x + 4, h - d); g.lineTo(x + 8, h); g.fill(); } // ぎざぎざの裾
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(Math.random() * w, rnd(h * 0.3, h * 0.9), rnd(3, 9), rnd(5, 14), 0, 0, 6.28); g.fill(); } // 穴
  });
  const rust = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6a5a4a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${Math.random() * 0.4})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  T = { bone, rock, runes, cloth, rust };
  return T;
}
const eyeMat = color => new THREE.MeshBasicMaterial({ color });
const markEye = m => { m.userData.eye = true; return m; };
const limb = (len, r0, r1, mat) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 8), mat); m.position.y = -len / 2; g.add(m); return g; };
const ball = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);

// ---------------- 骸骨兵 ----------------
function skeleton() {
  const t = textures();
  const bone = new THREE.MeshStandardMaterial({ map: t.bone, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 });
  const rust = new THREE.MeshStandardMaterial({ map: t.rust, metalness: 0.6, roughness: 0.6 });
  const g = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
  const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14), bone); pelvis.rotation.x = Math.PI / 2; pelvis.scale.y = 0.7; hips.add(pelvis);
  // 脚 (股関節 → 膝 → 足)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0, 0); hips.add(hip);
    const femur = limb(0.44, 0.028, 0.022, bone); hip.add(femur);
    const knee = new THREE.Group(); knee.position.y = -0.44; femur.add(knee);
    knee.add(ball(0.035, bone));
    const shin = limb(0.44, 0.022, 0.018, bone); knee.add(shin);
    const fibula = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5), bone); fibula.position.set(s * 0.025, -0.22, -0.01); knee.add(fibula);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.17), bone); foot.position.set(0, -0.46, -0.05); knee.add(foot);
    legs.push({ hip, knee });
  }
  // 背骨と肋骨
  const spine = new THREE.Group(); hips.add(spine);
  for (let i = 0; i < 8; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 7), bone); v.position.set(0, 0.04 + i * 0.065, Math.sin(i / 8 * Math.PI) * 0.03); spine.add(v); }
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.012, 0.012, 5, 16, Math.PI * 1.55), bone);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 1.22); rib.position.set(0, 0.26 + i * 0.065, -0.02); rib.scale.set(1, 1.15, 1); spine.add(rib);
  }
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.015), bone); sternum.position.set(0, 0.38, -0.14); spine.add(sternum);
  const clav = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), bone); clav.rotation.z = Math.PI / 2; clav.position.set(0, 0.56, -0.02); spine.add(clav);
  // 腕 (肩 → 肘 → 手)
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.21, 0.55, 0); spine.add(sh);
    sh.add(ball(0.035, bone));
    const hum = limb(0.3, 0.022, 0.018, bone); sh.add(hum);
    const el = new THREE.Group(); el.position.y = -0.3; hum.add(el);
    for (const o of [-0.012, 0.012]) { const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.28, 5), bone); fa.position.set(o, -0.14, 0); el.add(fa); }
    const hand = new THREE.Group(); hand.position.y = -0.3; el.add(hand);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.08, 4), bone); f.position.set((k - 1.5) * 0.014, -0.04, 0); f.rotation.x = 0.4; hand.add(f); }
    sh.rotation.x = -0.25; el.rotation.x = -0.5;
    arms.push({ sh, el, hand });
  }
  // 頭蓋
  const head = new THREE.Group(); head.position.set(0, 0.68, -0.02); spine.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), bone); skull.scale.set(0.95, 1.05, 1.12); skull.position.y = 0.08; head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), bone); face.position.set(0, 0.02, -0.07); face.scale.set(1, 0.9, 0.8); head.add(face);
  for (const s of [-1, 1]) {
    const sock = ball(0.032, dark); sock.position.set(s * 0.042, 0.06, -0.12); head.add(sock);
    const eye = markEye(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeMat(0xff3010))); eye.position.set(s * 0.042, 0.06, -0.14); head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.03, 3), dark); nose.rotation.x = Math.PI; nose.position.set(0, 0.015, -0.145); head.add(nose);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.03, -0.03); head.add(jaw);
  const jawBone = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.1), bone); jawBone.position.set(0, -0.02, -0.06); jaw.add(jawBone);
  for (let k = 0; k < 6; k++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.01), bone); tooth.position.set((k - 2.5) * 0.016, 0.0, -0.11); jaw.add(tooth); }
  // 錆びた剣と、ぼろ布の腰巻
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.75, 0.01), rust); blade.position.y = -0.48; blade.scale.x = 1;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.03), rust); guard.position.y = -0.1;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); grip.position.y = -0.03;
  sword.add(blade, guard, grip); sword.rotation.x = Math.PI / 2 + 0.2; arms[1].hand.add(sword);
  const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), new THREE.MeshStandardMaterial({ map: t.cloth, color: 0x5a4030, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })); rag.position.set(0, -0.12, -0.1); hips.add(rag);
  g.userData = { kind: 'skeleton', legs, arms, jaw, weapon: sword, head };
  return g;
}

// ---------------- 粘獣 ----------------
function slime() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.62, 40, 28);
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x5fcf3a, emissive: 0x0e3a06, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.72, depthWrite: false });
  const body = new THREE.Mesh(geo, mat); body.position.y = 0.52; body.scale.set(1, 0.78, 1); g.add(body);
  // 内側に溶けかけの骨と、光る核
  const t = textures(); const bone = new THREE.MeshStandardMaterial({ map: t.bone, color: 0x9a9a70, roughness: 0.9 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bone); skull.position.set(0.15, 0.45, 0.08); body.add(skull); skull.position.set(0.18, -0.05, 0.1);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5), bone); b.position.set(rnd(-0.25, 0.25), rnd(-0.2, 0.15), rnd(-0.25, 0.25)); b.rotation.set(rnd(0, 3), rnd(0, 3), 0); body.add(b); }
  const core = markEye(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), eyeMat(0xbaff60))); core.position.set(-0.05, 0.05, -0.05); body.add(core);
  const bubbles = [];
  for (let i = 0; i < 8; i++) { const bb = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.02, 0.05), 6, 5), new THREE.MeshBasicMaterial({ color: 0xd8ffc0, transparent: true, opacity: 0.5 })); body.add(bb); bubbles.push({ m: bb, ph: Math.random() * 6, x: rnd(-0.3, 0.3), z: rnd(-0.3, 0.3) }); }
  // 床に広がる粘液
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshStandardMaterial({ color: 0x3a8a22, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false })); puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.02; g.add(puddle);
  g.userData = {
    kind: 'slime', body,
    // 表面をぷるぷる揺らす
    wobble(time, speed) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const k = 1 + Math.sin(time * 3 + x * 6 + y * 4) * 0.035 + Math.sin(time * 5.3 + z * 7) * 0.025 * (1 + speed);
        p.setXYZ(i, x * k, y * k - (y < -0.3 ? 0.04 : 0), z * k);
      }
      p.needsUpdate = true; geo.computeVertexNormals();
      for (const b of bubbles) { const k = (time * 0.4 + b.ph) % 1; b.m.position.set(b.x, -0.4 + k * 0.8, b.z); b.m.material.opacity = 0.5 * (1 - k); }
    },
  };
  return g;
}

// ---------------- 怨霊 ----------------
function wraith() {
  const t = textures();
  const g = new THREE.Group();
  const clothMat = new THREE.MeshStandardMaterial({ map: t.cloth, alphaMap: null, transparent: true, alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide, color: 0x9080a0 });
  const pts = []; for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push(new THREE.Vector2(0.06 + 0.5 * Math.sin(k * Math.PI * 0.85) * (1 - k * 0.25), k * 1.7)); }
  const cloak = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), clothMat); cloak.rotation.x = Math.PI; cloak.position.y = 2.05; g.add(cloak);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1222, roughness: 1, side: THREE.DoubleSide })); hood.position.y = 1.98; hood.rotation.x = -0.25; g.add(hood);
  const voidFace = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshBasicMaterial({ color: 0x000000 })); voidFace.position.set(0, 1.93, -0.06); g.add(voidFace);
  for (const s of [-1, 1]) { const e = markEye(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat(0xc060ff))); e.position.set(s * 0.06, 1.95, -0.23); e.scale.set(1.4, 0.7, 1); g.add(e); }
  // 外套の下から伸びる骨ばった腕と鉤爪
  const arm = new THREE.MeshStandardMaterial({ color: 0x4a4250, roughness: 0.8 });
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.3, 1.65, -0.05); g.add(sh);
    const up = limb(0.42, 0.025, 0.018, arm); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.42; up.add(el);
    const lo = limb(0.4, 0.016, 0.012, arm); el.add(lo);
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.12, 4), arm); c.position.set((k - 1.5) * 0.018, -0.45, -0.03); c.rotation.x = 0.6; el.add(c); }
    sh.rotation.set(-1.0, 0, s * 0.3); el.rotation.x = -0.4;
    arms.push({ sh, el });
  }
  g.userData = { kind: 'wraith', arms, cloak };
  return g;
}

// ---------------- 石像兵 ----------------
function golem() {
  const t = textures();
  const stone = new THREE.MeshStandardMaterial({ map: t.rock, emissive: 0xff6a20, emissiveMap: t.runes, emissiveIntensity: 1.4, roughness: 0.95, flatShading: true });
  const g = new THREE.Group();
  const chunk = (w, h, d, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), stone); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rnd(0.88, 1.08), p.getY(i) * rnd(0.9, 1.06), p.getZ(i) * rnd(0.88, 1.08)); m.geometry.computeVertexNormals(); m.position.set(x, y, z); m.rotation.set(rnd(-0.08, 0.08), rnd(-0.1, 0.1), rnd(-0.08, 0.08)); m.castShadow = true; parent.add(m); return m; };
  // 脚: 柱のような太い脚
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.36, 1.05, 0); g.add(hip);
    chunk(0.36, 0.5, 0.4, 0, -0.25, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.52; hip.add(knee);
    chunk(0.34, 0.5, 0.38, 0, -0.25, 0, knee);
    chunk(0.44, 0.14, 0.56, 0, -0.5, -0.06, knee);
    legs.push({ hip, knee });
  }
  // 胴: 積み石。胸に魔力の核
  chunk(1.0, 0.5, 0.62, 0, 1.3, 0);
  chunk(1.25, 0.62, 0.72, 0, 1.82, 0);
  const core = markEye(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), eyeMat(0xffa040))); core.position.set(0, 1.78, -0.38); g.add(core);
  // 頭: 角ばった兜と光る覗き穴
  const head = new THREE.Group(); head.position.set(0, 2.3, -0.08); g.add(head);
  chunk(0.46, 0.38, 0.44, 0, 0, 0, head);
  const visor = markEye(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.03), eyeMat(0xff8a30))); visor.position.set(0, 0.02, -0.23); head.add(visor);
  // 腕: 肩の岩、太い腕、拳
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.82, 1.98, 0); g.add(sh);
    chunk(0.5, 0.42, 0.5, 0, 0.05, 0, sh);
    chunk(0.32, 0.5, 0.34, 0, -0.38, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.66; sh.add(el);
    chunk(0.34, 0.46, 0.36, 0, -0.2, 0, el);
    chunk(0.44, 0.38, 0.46, 0, -0.56, 0, el); // 拳
    arms.push(sh);
  }
  g.userData = { kind: 'golem', legs, arms, head, stone };
  return g;
}

function scribe() {
  const t = textures();
  const g = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x3a0e18, roughness: 0.9, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.7, roughness: 0.4 });
  const pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector2(0.2 + 0.34 * Math.pow(1 - k, 1.5) + 0.03 * Math.sin(k * 11), k * 1.5)); }
  const robe = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), robeMat); g.add(robe);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), trim); belt.rotation.x = Math.PI / 2; belt.position.y = 0.95; g.add(belt);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), robeMat); shoulders.position.y = 1.4; shoulders.scale.set(1.15, 0.6, 0.9); g.add(shoulders);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), robeMat); hood.position.y = 1.62; hood.rotation.x = -0.3; g.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050203 })); face.position.set(0, 1.58, -0.05); g.add(face);
  for (const s of [-1, 1]) { const e = markEye(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), eyeMat(0xff4a8a))); e.position.set(s * 0.05, 1.6, -0.18); g.add(e); }
  // 腕と、開いた魔導書
  const arms = [];
  for (const s of [-1, 1]) { const sh = new THREE.Group(); sh.position.set(s * 0.28, 1.38, 0); g.add(sh); const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 8), robeMat); sl.position.y = -0.25; sh.add(sl); sh.rotation.set(-0.9, 0, s * 0.15); arms.push(sh); }
  const book = new THREE.Group(); book.position.set(0, 1.12, -0.38);
  for (const s of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, emissive: 0xff2a6a, emissiveIntensity: 0.35 })); pg.position.x = s * 0.09; pg.rotation.z = s * -0.15; book.add(pg); }
  const glyph = markEye(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.006, 4, 20), eyeMat(0xff6aa0))); glyph.rotation.x = Math.PI / 2; glyph.position.y = 0.12; book.add(glyph);
  g.add(book);
  g.userData = { kind: 'scribe', arms, book, glyph };
  return g;
}

export function buildEnemyModel(type) {
  const g = type === 'skeleton' ? skeleton() : type === 'slime' ? slime() : type === 'wraith' ? wraith() : type === 'scribe' ? scribe() : golem();
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 毎フレームの動き。moving: 移動中か / attack: 攻撃の振り(0〜1)
export function animateEnemy(ud, t, ph, moving, attack, dt) {
  if (ud.kind === 'skeleton') {
    const w = moving ? Math.sin(t * 9 + ph) : 0;
    ud.legs.forEach((l, i) => { const s = i ? -1 : 1; l.hip.rotation.x = w * 0.55 * s; l.knee.rotation.x = Math.max(0, -w * s) * 0.8; });
    ud.arms[0].sh.rotation.x = -0.25 - w * 0.4;
    ud.arms[1].sh.rotation.x = -0.25 + w * 0.3 - attack * 1.6; ud.arms[1].el.rotation.x = -0.5 - attack * 0.6;
    ud.jaw.rotation.x = Math.max(0, Math.sin(t * 7 + ph)) * 0.25; // カタカタ
    ud.head.rotation.y = Math.sin(t * 1.3 + ph) * 0.2;
  } else if (ud.kind === 'slime') {
    ud.wobble(t + ph, moving ? 1 : 0);
  } else if (ud.kind === 'wraith') {
    ud.arms.forEach((a, i) => { a.sh.rotation.x = -1.0 + Math.sin(t * 2 + ph + i) * 0.15 - attack * 0.8; a.el.rotation.x = -0.4 + Math.sin(t * 2.6 + i) * 0.2; });
    ud.cloak.rotation.y += dt * 0.3;
  } else if (ud.kind === 'scribe') {
    ud.glyph.rotation.z += dt * (2 + attack * 6); ud.glyph.position.y = 0.12 + Math.sin(t * 3 + ph) * 0.03;
    ud.arms.forEach((a, i) => { a.rotation.x = -0.9 + Math.sin(t * 1.8 + i) * 0.06; });
  } else if (ud.kind === 'golem') {
    const w = moving ? Math.sin(t * 3.2 + ph) : 0;
    ud.legs.forEach((l, i) => { const s = i ? -1 : 1; l.hip.rotation.x = w * 0.35 * s; l.knee.rotation.x = Math.max(0, -w * s) * 0.5; });
    ud.arms[0].rotation.x = w * 0.3 + Math.sin(t * 1.5) * 0.05;
    ud.arms[1].rotation.x = -w * 0.3 - attack * 2.0;
    ud.stone.emissiveIntensity = 1.2 + Math.sin(t * 2 + ph) * 0.4;
  }
}
