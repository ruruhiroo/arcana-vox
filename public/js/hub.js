// 迷宮の外の広場: 得意属性の祭壇。台座の上に、その属性そのものが宿っている
//   炎 = 揺らめく炎 / 氷 = 氷の棘 / 雷 = 稲妻をまとう球 / 風 = 渦を巻く風 / 聖 = 光輪と十字 / 闇 = 紫の渦を吸う黒い球
import * as THREE from 'three';
import { G } from './state.js';
import { glowSprite, textSprite } from './textures.js';

const EL = {
  fire: { name: '紅蓮', sub: '炎', color: 0xff7a30 }, ice: { name: '氷獄', sub: '氷', color: 0x8fd8ff }, thunder: { name: '雷霆', sub: '雷', color: 0xc8b8ff },
  wind: { name: '颶風', sub: '風', color: 0x9effc8 }, holy: { name: '聖光', sub: '聖', color: 0xfff0b0 }, void: { name: '深淵', sub: '闇', color: 0xb070ff },
};
let shrines = [];
export const EL_INFO = EL;
// 祭壇の前に立つと出る、属性の説明(誓う前に読む)
export const EL_LORE = {
  fire: { ruby: 'ぐれん', motto: '燃え尽きるその刻まで、焼き尽くせ', power: 60, onHit: '燃焼 — 4秒のあいだ焼け続ける', trait: '迷わず撃ち込む攻めの属性。弱点を持つ魔物がいちばん多い', spirit: 'fire',
    vow: '我、紅蓮と誓約す — 燃え尽きるその刻まで、この声は焔となる' },
  ice: { ruby: 'ひょうごく', motto: '静寂は、万象を縫い止める', power: 55, onHit: '鈍足 — 中級以上なら凍結させ、動きを止める', trait: '足を止めて戦場を支配する。囲まれた時の切り札', spirit: 'ice',
    vow: '我、氷獄と誓約す — 万象を縫い止める静寂を、この声に' },
  thunder: { ruby: 'らいてい', motto: '天の怒りは、隣へ、また隣へ', power: 66, onHit: '麻痺 — 一瞬動きを止める。魔弾は近くの敵へ連鎖する', trait: '威力は六属性で最も高い。群れを一度に焼き払う', spirit: 'thunder',
    vow: '我、雷霆と誓約す — 天を裂く怒りよ、我が声に轟け' },
  wind: { ruby: 'ぐふう', motto: '風は傷つけず、ただ遠くへ運ぶ', power: 45, onHit: '吹き飛ばし — 敵を遠くへ押し返す', trait: '威力は控えめ。神速と合わせると速さが1.5倍。距離を支配する', spirit: 'wind',
    vow: '我、颶風と誓約す — 何者にも縛られぬ風を、この身に' },
  holy: { ruby: 'せいこう', motto: '夜明けの名において、穢れを還せ', power: 58, onHit: '聖痕 — 受ける傷が25%増える。亡者には1.35倍', trait: '癒息・守護と合わせると効果が1.5倍。仲間を支える要', spirit: 'holy',
    vow: '我、聖光と誓約す — 夜明けの名において、穢れを還す' },
  void: { ruby: 'しんえん', motto: '奪え、そして分け与えよ', power: 58, onHit: '侵蝕 — 与えた傷の35%が自分の生命に還る', trait: '戦いながら生き延びる。ひとりで潜る者の友', spirit: 'void',
    vow: '我、深淵と誓約す — 底なき闇よ、奪い、そして分け与えよ' },
};
const TOP = 1.45; // 台座の上面
const sprite = (color, s, op) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: op })); sp.scale.setScalar(s); return sp; };

// ---- 属性ごとの姿 ----
const MAKE = {
  fire(g) {
    // 鉄の鉢に燃える炎(大小の炎を重ねて揺らす)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 0.2, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
    bowl.position.y = TOP + 0.1; g.add(bowl);
    const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x1a0c06, emissive: 0xff4a10, emissiveIntensity: 0.8 })); coal.position.y = TOP + 0.16; g.add(coal);
    const flames = [];
    for (let i = 0; i < 5; i++) { const f = sprite(i < 2 ? 0xff6a20 : 0xffb050, 0.5, 0.75); f.position.set((Math.random() - 0.5) * 0.25, TOP + 0.45, (Math.random() - 0.5) * 0.25); g.add(f); flames.push({ f, ph: Math.random() * 6, k: 0.7 + Math.random() * 0.6 }); }
    const core = sprite(0xffd090, 0.3, 0.5); core.position.y = TOP + 0.35; g.add(core);
    return (dt, t, sel) => {
      for (const { f, ph, k } of flames) { const fl = 0.75 + 0.25 * Math.sin(t * 11 * k + ph) + Math.random() * 0.08; f.scale.set(0.45 * fl * (sel ? 1.3 : 1), 0.8 * fl * (sel ? 1.4 : 1), 1); f.position.y = TOP + 0.4 + 0.1 * fl; }
      if (Math.random() < dt * (sel ? 14 : 5)) G.particles?.emit(g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, TOP + 0.6, (Math.random() - 0.5) * 0.3)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 1 + Math.random(), (Math.random() - 0.5) * 0.3), 0xff8030, 0.1, 1.2);
    };
  },
  ice(g) {
    // 台座から突き出す氷の棘
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, emissive: 0x3070a0, emissiveIntensity: 0.25, roughness: 0.08, transparent: true, opacity: 0.85, clearcoat: 1, flatShading: true });
    const spikes = new THREE.Group(); spikes.position.y = TOP;
    for (let i = 0; i < 9; i++) {
      const big = i < 2, h = big ? 0.9 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4, r = big ? 0.09 : 0.05;
      const geo = new THREE.ConeGeometry(r, h, 5); geo.translate(0, h / 2, 0);
      const m = new THREE.Mesh(geo, mat); const a = Math.random() * 6.28, d = big ? Math.random() * 0.06 : 0.1 + Math.random() * 0.2;
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.set(Math.sin(a) * (big ? 0.1 : 0.5), 0, -Math.cos(a) * (big ? 0.1 : 0.5)); spikes.add(m);
    }
    g.add(spikes);
    const frost = sprite(0x9fe4ff, 1.0, 0.18); frost.position.y = TOP + 0.4; g.add(frost);
    return (dt, t, sel) => {
      mat.emissiveIntensity = sel ? 0.6 + 0.2 * Math.sin(t * 2) : 0.2;
      frost.material.opacity = sel ? 0.3 : 0.12;
      if (Math.random() < dt * (sel ? 8 : 2)) G.particles?.emit(g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, TOP + 1 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8)), new THREE.Vector3(0, -0.25, 0), 0xdff4ff, 0.06, 2);
    };
  },
  thunder(g) {
    // 宙に浮く光の球と、まわりを走る稲妻
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8070d0, emissive: 0x7060ff, emissiveIntensity: 0.6, roughness: 0.3 })); orb.position.y = TOP + 0.6; g.add(orb);
    const halo = sprite(0x8a70ff, 0.7, 0.18); halo.position.copy(orb.position); g.add(halo);
    const boltMat = new THREE.LineBasicMaterial({ color: 0xe0d8ff, transparent: true, opacity: 0.9 });
    const bolts = [];
    for (let i = 0; i < 4; i++) { const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 7 }, () => new THREE.Vector3())); const l = new THREE.Line(geo, boltMat); g.add(l); bolts.push(l); }
    let nextT = 0;
    return (dt, t, sel) => {
      orb.position.y = TOP + 0.6 + Math.sin(t * 2.2) * 0.05; halo.position.y = orb.position.y;
      halo.material.opacity = (sel ? 0.28 : 0.12) + Math.random() * 0.06;
      if ((nextT -= dt) <= 0) {
        nextT = sel ? 0.06 : 0.18;
        for (const l of bolts) {
          const a = Math.random() * 6.28, r = 0.4 + Math.random() * 0.25, end = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.6, Math.sin(a) * r);
          const p = l.geometry.attributes.position;
          for (let k = 0; k < 7; k++) { const q = end.clone().multiplyScalar(k / 6); if (k && k < 6) q.add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12)); p.setXYZ(k, q.x, orb.position.y + q.y, q.z); }
          p.needsUpdate = true; l.visible = sel || Math.random() < 0.5;
        }
      }
    };
  },
  wind(g) {
    // 渦を巻く風の帯と、舞い上がる木の葉
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = 0.22 + i * 0.1, ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 4, 32, Math.PI * 1.3), mat);
      ring.rotation.x = Math.PI / 2; ring.position.y = TOP + 0.15 + i * 0.22; g.add(ring); rings.push(ring);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6ab04a, side: THREE.DoubleSide });
    const leaves = [];
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), leafMat); l.scale.y = 1.8; g.add(l); leaves.push({ l, a: Math.random() * 6.28, y: Math.random() }); }
    return (dt, t, sel) => {
      const sp = sel ? 2.4 : 1;
      rings.forEach((r, i) => { r.rotation.z += dt * (3 + i) * sp; });
      mat.opacity = sel ? 0.5 : 0.25;
      for (const lf of leaves) { lf.a += dt * 3 * sp; lf.y = (lf.y + dt * 0.35 * sp) % 1; const r = 0.2 + lf.y * 0.35; lf.l.position.set(Math.cos(lf.a) * r, TOP + 0.1 + lf.y * 0.9, Math.sin(lf.a) * r); lf.l.rotation.set(lf.a, lf.a * 2, 0); }
    };
  },
  holy(g) {
    // 光輪と、その中に浮かぶ十字
    const gold = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffd070, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 40), gold); halo.position.y = TOP + 0.75; g.add(halo);
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.05), gold));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.05), gold); bar.position.y = 0.08; cross.add(bar);
    cross.position.y = TOP + 0.75; g.add(cross);
    const glow = sprite(0xfff0c0, 0.8, 0.12); glow.position.y = TOP + 0.75; g.add(glow);
    return (dt, t, sel) => {
      halo.rotation.y += dt * (sel ? 1.2 : 0.4); cross.rotation.y += dt * (sel ? 0.8 : 0.3);
      halo.position.y = cross.position.y = glow.position.y = TOP + 0.75 + Math.sin(t * 1.5) * 0.05;
      gold.emissiveIntensity = sel ? 0.7 : 0.25; glow.material.opacity = sel ? 0.25 : 0.08;
      if (sel && Math.random() < dt * 6) G.particles?.emit(g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, TOP + 1.3, (Math.random() - 0.5) * 0.7)), new THREE.Vector3(0, -0.3, 0), 0xfff0c0, 0.06, 1.8);
    };
  },
  void(g) {
    // 光を吸い込む黒い球と、まわりを巡る紫の渦
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: 0x050208, roughness: 0.2, metalness: 0.4 })); orb.position.y = TOP + 0.6; g.add(orb);
    const rim = sprite(0x9040ff, 0.85, 0.3); rim.position.copy(orb.position); g.add(rim);
    const motes = [];
    for (let i = 0; i < 10; i++) { const m = sprite(0xb070ff, 0.12, 0.8); g.add(m); motes.push({ m, a: Math.random() * 6.28, r: 0.35 + Math.random() * 0.35, y: (Math.random() - 0.5) * 0.4 }); }
    return (dt, t, sel) => {
      rim.material.opacity = (sel ? 0.45 : 0.22) + Math.sin(t * 3) * 0.05;
      for (const mo of motes) { mo.a += dt * (sel ? 3 : 1.4); mo.r -= dt * (sel ? 0.35 : 0.15); if (mo.r < 0.24) { mo.r = 0.6 + Math.random() * 0.15; mo.y = (Math.random() - 0.5) * 0.5; } mo.m.position.set(Math.cos(mo.a) * mo.r, orb.position.y + mo.y * mo.r, Math.sin(mo.a) * mo.r); }
    };
  },
};

export function buildShrines(d, scene) {
  clearShrines(scene);
  const stone = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 });
  for (const s of d.shrines || []) {
    const info = EL[s.el], g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.3, 8), stone); base.position.y = 0.15;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.0, 8), stone); post.position.y = 0.8;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.16, 8), stone); cap.position.y = 1.37;
    // 台座に刻まれた属性の色の帯(選んでいる祭壇は光る)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.2 }));
    band.rotation.x = Math.PI / 2; band.position.y = 1.0;
    const label = textSprite(info.name, { size: 44, color: '#' + info.color.toString(16).padStart(6, '0') }); label.position.y = 2.75;
    for (const m of [base, post, cap]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(base, post, cap, band, label);
    g.position.copy(s.pos); scene.add(g);
    shrines.push({ ...s, g, band, anim: MAKE[s.el](g) });
  }
}
export function clearShrines(scene) { for (const s of shrines) scene.remove(s.g); shrines = []; }
export function updateShrines(dt) {
  for (const s of shrines) {
    const sel = G.affinity === s.el;
    s.band.material.emissiveIntensity = sel ? 1.2 : 0.2;
    s.anim(dt, G.time, sel);
  }
}
export function shrineNear(pos) { for (const s of shrines) if (Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < 2.0) return s; return null; }
