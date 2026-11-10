import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDragonState, stepDragon, dragonHits, DRAGON_ATTACKS } from '../public/js/dragon-rules.js';
import { buildDragon, animateDragon, intersectsDragon } from '../public/js/dragon-model.js';
import { generate, bfs, W, CELL, ceilingAt, raycastGrid, DRAGON_HALL_HEIGHT } from '../public/js/dungeon.js';
import { G } from '../public/js/state.js';
import { updateDragons, clearDragons } from '../public/js/dragon-boss.js';

const input = { health: 1, distance: 5, origin: [0, 0, 0], target: [0, 0, -5], yaw: 0 };
test('dragon always telegraphs before striking, then allows a full chant', () => {
  const s = createDragonState();
  assert.equal(stepDragon(s, 10, input), 'windup'); assert.equal(s.remaining, 3.2);
  assert.equal(stepDragon(s, 3, input), null); assert.equal(s.stage, 'windup');
  assert.equal(stepDragon(s, .3, input), 'strike');
  assert.equal(stepDragon(s, 1.2, input), 'recover'); assert.ok(s.remaining >= 7.5);
  assert.equal(stepDragon(s, 1, input), null);
});
test('telegraph aim and meteor location stay fixed when the target moves', () => {
  const s = createDragonState(); stepDragon(s, 3, input);
  const before = JSON.stringify([s.origin, s.target, s.yaw]);
  stepDragon(s, .2, { ...input, yaw: 2, target: [10, 0, 5], origin: [1, 0, 1] });
  assert.equal(JSON.stringify([s.origin, s.target, s.yaw]), before);
});
test('breath cone has safe sides and rear; range and height are enforced', () => {
  const s = { ...createDragonState(), origin: [0, 0, 0], yaw: 0 };
  assert.ok(dragonHits(s, [0, 0, -8])); assert.ok(!dragonHits(s, [8, 0, 0]));
  assert.ok(!dragonHits(s, [0, 0, 5])); assert.ok(!dragonHits(s, [0, 0, -25])); assert.ok(!dragonHits(s, [0, 4, -5]));
  s.yaw = Math.PI / 2; assert.ok(dragonHits(s, [-8, 0, 0])); assert.ok(!dragonHits(s, [0, 0, -8]));
});
test('sweep and meteor use their displayed circular radius', () => {
  const s = { ...createDragonState(), move: 'sweep' };
  assert.ok(dragonHits(s, [12.9, 0, 0])); assert.ok(!dragonHits(s, [13.1, 0, 0]));
  s.move = 'meteor'; s.target = [8, 0, 8]; assert.ok(dragonHits(s, [8, 0, 8])); assert.ok(!dragonHits(s, [0, 0, 0]));
});
test('second phase introduces meteors without deleting the recovery window', () => {
  const s = createDragonState(), attacks = [];
  for (let i = 0; i < 16; i++) {
    const event = stepDragon(s, 100, { ...input, health: .4 });
    if (event === 'windup') attacks.push(s.move);
    if (event === 'recover') assert.ok(s.remaining >= 5.5);
  }
  assert.deepEqual(attacks, ['breath', 'meteor', 'sweep', 'meteor']);
});
test('distant attacks still receive an avoidable response in phase one', () => {
  const s = createDragonState(); stepDragon(s, 3, { ...input, distance: 30, target: [0, 0, -30] });
  assert.equal(s.move, 'meteor'); assert.equal(s.stage, 'windup'); assert.equal(s.remaining, DRAGON_ATTACKS.meteor.warn);
});
test('dragon model has articulated wings, jaw, tail and finite geometry', () => {
  const m = buildDragon(); assert.equal(m.userData.wings.length, 2); assert.equal(m.userData.legs.length, 4);
  for (const stage of ['idle', 'windup', 'strike', 'recover']) { m.userData.stage = stage; animateDragon(m.userData, 1, true); }
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  assert.ok(box.max.y < DRAGON_HALL_HEIGHT); assert.ok(box.min.y > -.3);
  assert.ok(size.x > 19 && size.z > 19 && size.y > 7, 'adult dragon must dwarf a 1.75m person');
  m.traverse(o => { if (o.geometry) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });
});
test('generated dragon arenas stay reachable, flat and clear across seeds and floors', () => {
  for (const floor of [1, 3, 6, 9, 12]) for (let seed = 1; seed <= 24; seed++) {
    const d = generate(seed * 7919, floor), room = d.portalRoom;
    assert.ok(room.w >= 9 && room.h >= 9, `${seed}/${floor} arena too small`);
    assert.equal(room.mod, 'dragon_hall');
    assert.equal(room.cells.length, room.w * room.h);
    assert.ok(bfs(d.grid, d.start.cx, d.start.cy)[room.cy * W + room.cx] >= 0);
    const arena = p => room.cells.some(([x, z]) => x === Math.floor(p.x / CELL) && z === Math.floor(p.z / CELL));
    assert.equal(new Set(room.cells.map(([x, z]) => d.hgt[z * W + x])).size, 1);
    assert.ok(!d.spawns.some(s => !s.boss && arena(s.pos)));
    assert.ok(!d.decor.some(s => arena(s.pos)));
    assert.ok(!d.gasTraps.some(arena));
    for (const s of d.spawns.filter(s => s.boss)) assert.equal(s.type, 'dragon');
  }
});
test('host strikes once, clients only render, death clears warning geometry', () => {
  globalThis.document = { getElementById: () => null };
  const e = { id: 'test-dragon', type: 'dragon', alive: true, pos: new THREE.Vector3(20, 0, 20), yaw: 0, hp: 640, maxHp: 640,
    status: {}, body: buildDragon(), dragon: createDragonState(), radius: 1.2, team: 'monster' };
  const p = { team: 'hero', alive: true, pos: new THREE.Vector3(20, 0, 15) };
  let hits = 0;
  Object.assign(G, { scene: new THREE.Scene(), enemies: [e], mages: [p], player: p, isHost: true, floor: 1, time: 0,
    dungeon: { grid: new Uint8Array(W * W).fill(1), hgt: new Float32Array(W * W) }, obstacles: [],
    fx: { damage: () => hits++, burst() {} } });
  updateDragons(3); assert.equal(hits, 0); updateDragons(3.3); assert.equal(hits, 1);
  updateDragons(.1); assert.equal(hits, 1); updateDragons(1.1); assert.ok(e.vulnUntil > 0);
  G.isHost = false; e.dragon = { ...e.dragon, stage: 'windup', remaining: .01, serial: 10 };
  updateDragons(5); assert.equal(hits, 1); assert.equal(e.dragon.stage, 'windup');
  e.alive = false; updateDragons(.1); assert.equal(G.scene.children.length, 0); clearDragons();
});
test('giant dragon fits the hall while turning and its exposed head lowers', () => {
  const m = buildDragon(); let raised, lowered;
  for (const stage of ['idle', 'windup', 'strike', 'recover']) for (const move of ['breath', 'sweep']) for (let k = 0; k < 16; k++) {
    Object.assign(m.userData, { stage, move }); m.rotation.y = k * Math.PI / 8; animateDragon(m.userData, k * .17, false);
    const b = new THREE.Box3().setFromObject(m);
    // 移動上限1.5mと壁際の余白を含めても36m四方に収まる。
    assert.ok(Math.max(Math.abs(b.min.x), Math.abs(b.min.z), b.max.x, b.max.z) + 1.5 < 18);
    assert.ok(b.max.y < DRAGON_HALL_HEIGHT);
  }
  m.userData.stage = 'windup'; animateDragon(m.userData, 0, false); raised = m.userData.head.getWorldPosition(new THREE.Vector3()).y;
  m.userData.stage = 'recover'; animateDragon(m.userData, 0, false); lowered = m.userData.head.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(lowered < raised - 1);
});
test('high dragon head accepts projectiles above the old 5.2m ceiling', async () => {
  // 描画用テクスチャの初期化だけを代替し、弾道と命中は実際のFX.updateを通す。
  globalThis.document = { getElementById: () => null, createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, arc() {}, fill() {}
  }) }) };
  const { FX } = await import('../public/js/spells.js');
  const d = generate(7919, 1), body = buildDragon(); body.position.copy(d.portal); body.rotation.y = 1.2; body.updateMatrixWorld(true);
  const head = body.userData.head.localToWorld(new THREE.Vector3(0, .35, -.25));
  assert.ok(head.y > 5.2); assert.ok(intersectsDragon(body, head, .35));
  assert.ok(!intersectsDragon(body, head.clone().add(new THREE.Vector3(0, 5, 0)), .35));
  Object.assign(G, { dungeon: d, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), particles: { update() {}, emit() {} }, vfx: [], lumens: [], dying: [], orbits: [], obstacles: [], runes: [], effects: [], mages: [],
    enemies: [{ type: 'dragon', body, pos: d.portal.clone(), alive: true, team: 'monster' }] });
  const caster = { team: 'hero' }, mesh = new THREE.Group();
  G.projectiles = [{ caster, team: 'hero', local: true, pos: head.clone(), mesh, age: 1, life: 1, radius: .35,
    vel: new THREE.Vector3(0, 0, -1), color: 0xff0000, pl: { dmg: 10 }, spell: { target: 'enemy', elements: ['fire'], effects: [], power: 1 } }];
  let hits = 0; const original = FX.damage; FX.damage = () => hits++;
  try { FX.update(.01); } finally { FX.damage = original; }
  assert.equal(hits, 1); assert.equal(G.projectiles.length, 0);
  const top = ceilingAt(d.portal.x, d.portal.z, d);
  assert.equal(top, d.portal.y + DRAGON_HALL_HEIGHT);
  assert.equal(ceilingAt((d.start.cx + .5) * CELL, (d.start.cy + .5) * CELL, d), 6.4);
  const hit = raycastGrid(d.portal.clone().add(new THREE.Vector3(0, 1.6, 0)), new THREE.Vector3(0, 1, 0));
  assert.ok(hit.y > 15 && hit.y <= top);
});
