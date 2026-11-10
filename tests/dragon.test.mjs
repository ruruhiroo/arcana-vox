import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDragonState, stepDragon, dragonHits, DRAGON_ATTACKS } from '../public/js/dragon-rules.js';
import { buildDragon, animateDragon } from '../public/js/dragon-model.js';
import { generate, bfs, W, CELL } from '../public/js/dungeon.js';
import { G } from '../public/js/state.js';
import { updateDragons, clearDragons } from '../public/js/dragon-boss.js';

const input = { health: 1, distance: 5, origin: [0, 0, 0], target: [0, 0, -5], yaw: 0 };
test('dragon always telegraphs before striking, then allows a full chant', () => {
  const s = createDragonState();
  assert.equal(stepDragon(s, 10, input), 'windup'); assert.equal(s.remaining, 2.2);
  assert.equal(stepDragon(s, 2, input), null); assert.equal(s.stage, 'windup');
  assert.equal(stepDragon(s, .3, input), 'strike');
  assert.equal(stepDragon(s, 1, input), 'recover'); assert.ok(s.remaining >= 5.5);
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
  assert.ok(!dragonHits(s, [0, 0, 5])); assert.ok(!dragonHits(s, [0, 0, -15])); assert.ok(!dragonHits(s, [0, 4, -5]));
  s.yaw = Math.PI / 2; assert.ok(dragonHits(s, [-8, 0, 0])); assert.ok(!dragonHits(s, [0, 0, -8]));
});
test('sweep and meteor use their displayed circular radius', () => {
  const s = { ...createDragonState(), move: 'sweep' };
  assert.ok(dragonHits(s, [4.4, 0, 0])); assert.ok(!dragonHits(s, [4.6, 0, 0]));
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
  const s = createDragonState(); stepDragon(s, 3, { ...input, distance: 20, target: [0, 0, -20] });
  assert.equal(s.move, 'meteor'); assert.equal(s.stage, 'windup'); assert.equal(s.remaining, DRAGON_ATTACKS.meteor.warn);
});
test('dragon model has articulated wings, jaw, tail and finite geometry', () => {
  const m = buildDragon(); assert.equal(m.userData.wings.length, 2); assert.equal(m.userData.legs.length, 4);
  for (const stage of ['idle', 'windup', 'strike', 'recover']) { m.userData.stage = stage; animateDragon(m.userData, 1, true); }
  const box = new THREE.Box3().setFromObject(m); assert.ok(box.max.y < 6.4); assert.ok(box.min.y > -.3);
  m.traverse(o => { if (o.geometry) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });
});
test('generated dragon arenas stay reachable, flat and clear across seeds and floors', () => {
  for (const floor of [1, 3, 6, 9, 12]) for (let seed = 1; seed <= 24; seed++) {
    const d = generate(seed * 7919, floor), room = d.portalRoom;
    assert.ok(room.w >= 3 && room.h >= 3, `${seed}/${floor} arena too small`);
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
  updateDragons(3); assert.equal(hits, 0); updateDragons(2.3); assert.equal(hits, 1);
  updateDragons(.1); assert.equal(hits, 1); updateDragons(1); assert.ok(e.vulnUntil > 0);
  G.isHost = false; e.dragon = { ...e.dragon, stage: 'windup', remaining: .01, serial: 10 };
  updateDragons(5); assert.equal(hits, 1); assert.equal(e.dragon.stage, 'windup');
  e.alive = false; updateDragons(.1); assert.equal(G.scene.children.length, 0); clearDragons();
});
