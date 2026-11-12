// 聖域(休息所): 各層に一つ。魔物は入れず、中にいると傷と魔力が癒える。書見台で魔導書を整えられる。
// 部屋の選び方は層の生成結果だけで決まるので、オンラインでも全員が同じ場所になる。
import { makeModel } from './glbmodels.js';
import * as THREE from 'three';
import { G } from './state.js';
import { CELL } from './dungeon.js';
import { runeCircleTex, glowSprite } from './textures.js';

export function pickSanctuaryRoom(d) {
  if (d.sanctRoom !== undefined) return d.sanctRoom; // 生成時に選んだ部屋 (そこには家具を置かない)
  // 開始の部屋・転移陣の部屋を除き、その間あたりの部屋を選ぶ
  return d.start;
  const cands = d.rooms.filter(r => r !== d.start && r !== d.portalRoom && r.w >= 4 && r.h >= 4);
  if (!cands.length) return null;
  const sx = d.start.cx, sy = d.start.cy, px = d.portalRoom.cx, py = d.portalRoom.cy;
  const mid = r => Math.abs(Math.hypot(r.cx - sx, r.cy - sy) - Math.hypot(r.cx - px, r.cy - py)) + Math.hypot(r.cx - sx, r.cy - sy) * 0.1;
  return cands.sort((a, b) => mid(a) - mid(b))[0];
}

export function buildSanctuary(room) {
  const center = new THREE.Vector3((room.cx + 0.5) * CELL, G.dungeon?.hgt?.[room.cy*52+room.cx]||0, (room.cy + 0.5) * CELL);
  const radius = Math.min(6.5, Math.min(room.w, room.h) * CELL * 0.4);
  const grp = new THREE.Group(); grp.position.copy(center);
  // 床の結界
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.1, radius * 2.1), new THREE.MeshBasicMaterial({ map: runeCircleTex(), color: 0x9ad8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; grp.add(ring);
  // 焚き火
  const forgedFire = makeModel('decor-campfire');   // 彫り直した焚き火があれば、石と薪はそれに任せる
  if (forgedFire) { forgedFire.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); grp.add(forgedFire); }
  const stone = new THREE.MeshStandardMaterial({ color: 0x5a554e, roughness: 0.95 });
  if (!forgedFire) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stone); s.position.set(Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45); grp.add(s); }
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 });
  if (!forgedFire) for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), wood); l.rotation.set(Math.PI / 2 - 0.4, i * 2.1, 0); l.position.y = 0.15; grp.add(l); }
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false }));
  fire.position.y = 0.5; fire.scale.set(0.9, 1.3, 1); grp.add(fire);
  // 書見台(開いた本)
  const lectern = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.0, 8), wood); post.position.y = 0.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.42), wood); top.position.y = 1.05; top.rotation.x = -0.45;
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.34), new THREE.MeshStandardMaterial({ color: 0xefe0bd, emissive: 0x6a5020, emissiveIntensity: 0.6 })); book.position.y = 1.09; book.rotation.x = -0.45;
  lectern.add(post, top, book); lectern.position.set(radius * 0.55, 0, 0); lectern.rotation.y = -Math.PI / 2; grp.add(lectern);
  // 天から降る光の柱
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.75, 5.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
  beam.position.y = 2.6; grp.add(beam);
  G.scene.add(grp);
  const lecternPos = center.clone().add(new THREE.Vector3(radius * 0.55, 0, 0));
  return { center, radius, grp, ring, fire, lecternPos, firePos: center.clone().add(new THREE.Vector3(0,.6,0)), reserve: 1, warned: false };
}

export const inSanctuary = (pos, pad = 0) => !!G.sanctuary && Math.hypot(pos.x - G.sanctuary.center.x, pos.z - G.sanctuary.center.z) < G.sanctuary.radius + pad;

// 毎フレーム: 炎のゆらぎ、魔物を外へ押し出す、中の魔導師を癒す
export function updateSanctuary(dt) {
  const s = G.sanctuary; if (!s) return;
  s.ring.rotation.z += dt * 0.15;
  const fl = (0.85 + Math.sin(G.time * 11) * 0.08 + Math.random() * 0.06) * (0.25 + 0.75 * s.reserve);
  s.fire.scale.set(0.9 * fl, 1.3 * fl, 1);
  s.ring.material.opacity = 0.2 + 0.35 * s.reserve;
  if (s.reserve > 0 && Math.random() < dt * 6 * s.reserve) G.particles.emit(s.firePos.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), 0xff8030, 0.1, 1.3);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - s.center.x, dz = e.pos.z - s.center.z, d = Math.hypot(dx, dz), min = s.radius + e.radius;
    if (d < min && d > 1e-3) { e.pos.x = s.center.x + dx / d * min; e.pos.z = s.center.z + dz / d * min; }
  }
  for (const m of G.mages) {
    if (!m.alive || m.downed || m.kind === 'remote' || !inSanctuary(m.pos)) continue;
    for (const k of ['burn', 'slow', 'shock', 'drain']) delete m.status[k];
    if (s.reserve <= 0) continue;
    // 焚き火の蓄え(1層あたり 体力 約150・魔力 約250 ぶん)を使って癒す
    const hp = Math.min(m.maxHp - m.hp, dt * 5), mp = Math.min(m.maxMp - m.mp, dt * 9);
    m.hp += hp; m.mp += mp;
    s.reserve = Math.max(0, s.reserve - hp / 150 - mp / 250);
    if (s.reserve <= 0 && !s.warned) { s.warned = true; G.ui?.log('聖域の焚き火が燃え尽きた — もう傷は癒えない', '#9fd8ff'); }
  }
}
