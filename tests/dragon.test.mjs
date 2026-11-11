import { guardianDefense, frostExposure } from '../public/js/guardian-mechanics.js';
import { buildGuardian, animateGuardian, guardianTravelPose } from '../public/js/guardian-model.js';
import { DRAGON_ELEMENTS, DRAGON_PROFILES, dragonElement } from '../public/js/dragon-profiles.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDragonState, stepDragon, dragonHits, DRAGON_ATTACKS, dragonHp, DRAGON_ROAM, sweepTurn, dragonAttack } from '../public/js/dragon-rules.js';
import { buildDragon, animateDragon, intersectsDragon } from '../public/js/dragon-model.js';
import { generate, bfs, W, CELL, ceilingAt, raycastGrid, DRAGON_HALL_HEIGHT } from '../public/js/dungeon.js';
import { G } from '../public/js/state.js';
import { updateDragons, clearDragons } from '../public/js/dragon-boss.js';

const input = { health: 1, distance: 5, origin: [0, 0, 0], target: [0, 0, -5], yaw: 0 };
test('dragon always winds up, then attacks and exposes its head', () => {
  const s = createDragonState();
  assert.equal(stepDragon(s, 10, input), 'windup'); assert.equal(s.remaining, 2.4);
  assert.equal(stepDragon(s, 2.2, input), null); assert.equal(s.stage, 'windup');
  assert.equal(stepDragon(s, .3, input), 'strike');
  assert.equal(stepDragon(s, 1.9, input), 'recover'); assert.ok(s.remaining >= 1.5);
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
  assert.ok(!dragonHits(s, [0, 0, 5])); assert.ok(!dragonHits(s, [0, 0, -29])); assert.ok(!dragonHits(s, [0, 4, -5]));
  s.yaw = Math.PI / 2; assert.ok(dragonHits(s, [-8, 0, 0])); assert.ok(!dragonHits(s, [0, 0, -8]));
});
test('sweep has an inner refuge; meteor has a larger finite impact radius', () => {
  const s = { ...createDragonState(), move: 'sweep' };
  assert.ok(dragonHits(s, [15.9, 0, 0])); assert.ok(!dragonHits(s, [16.1, 0, 0]));
  assert.ok(!dragonHits(s, [2, 0, 0]));
  s.move = 'meteor'; s.target = [8, 0, 8]; assert.ok(dragonHits(s, [8, 0, 8])); assert.ok(!dragonHits(s, [0, 0, 0]));
});
test('second phase uses a learnable six-move combo with longer recovery after big moves', () => {
  const s = createDragonState(), attacks = [];
  for (let i = 0; i < 24; i++) {
    const event = stepDragon(s, 100, { ...input, health: .4 });
    if (event === 'windup') attacks.push(s.move);
    if (event === 'recover' && ['slam', 'meteor'].includes(s.move)) assert.ok(s.remaining >= 2.8);
  }
  assert.deepEqual(attacks, ['breath', 'sweep', 'breath', 'slam', 'meteor', 'sweep']);
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
test('host damage follows the active motion once per target, clients never deal damage', () => {
  globalThis.document = { getElementById: () => null };
  const e = { id: 'test-dragon', type: 'dragon', alive: true, pos: new THREE.Vector3(20, 0, 20), yaw: 0, hp: 640, maxHp: 640,
    status: {}, body: buildDragon(), dragon: createDragonState(), radius: 1.2, team: 'monster' };
  const p = { team: 'hero', alive: true, pos: new THREE.Vector3(20, 0, 15) };
  let hits = 0;
  Object.assign(G, { scene: new THREE.Scene(), enemies: [e], mages: [p], player: p, isHost: true, floor: 1, time: 0,
    dungeon: { grid: new Uint8Array(W * W).fill(1), hgt: new Float32Array(W * W) }, obstacles: [],
    fx: { damage: () => hits++, burst() {} } });
  updateDragons(3); assert.equal(hits, 0);
  p.pos.fromArray(e.dragon.origin).add(new THREE.Vector3(-Math.sin(e.dragon.yaw)*10, 0, -Math.cos(e.dragon.yaw)*10));
  updateDragons(2.5); assert.equal(hits, 0, 'strike startup cannot hurt');
  updateDragons(.9); assert.equal(hits, 1);
  updateDragons(.1); assert.equal(hits, 1); updateDragons(1); assert.ok(e.vulnUntil > 0);
  G.isHost = false; e.dragon = { ...e.dragon, stage: 'windup', remaining: .01, serial: 10 };
  updateDragons(5); assert.equal(hits, 1); assert.equal(e.dragon.stage, 'windup');
  e.alive = false; updateDragons(.1); assert.equal(G.scene.children.length, 0); clearDragons();
});
test('all attack poses fit the hall at every yaw and maximum roaming distance', () => {
  const m = buildDragon(), actor = new THREE.Group(); actor.add(m);
  for (const stage of ['idle', 'windup', 'strike', 'recover']) for (const move of Object.keys(DRAGON_ATTACKS)) for (let k=0; k<16; k++) for (let j=0; j<=10; j++) {
    Object.assign(m.userData, { stage, move, progress:j/10 }); actor.rotation.y = k*Math.PI/8; animateDragon(m.userData, k*.17, false);
    const b = new THREE.Box3().setFromObject(actor);
    assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.min.z),b.max.x,b.max.z)+DRAGON_ROAM<18, move+' '+stage+' '+j);
    assert.ok(b.max.y < DRAGON_HALL_HEIGHT);
  }
  Object.assign(m.userData,{stage:'windup',move:'breath',progress:1}); animateDragon(m.userData,0,false);
  const raised=m.userData.head.getWorldPosition(new THREE.Vector3()).y;
  Object.assign(m.userData,{stage:'recover',progress:0}); animateDragon(m.userData,0,false);
  assert.ok(m.userData.head.getWorldPosition(new THREE.Vector3()).y < raised-1);
});
test('damage windows match the tail swing and ground impact, including skipped frames', () => {
  const s={...createDragonState(),move:'sweep'};
  const angle=Math.PI+sweepTurn(.45), point=[-Math.sin(angle)*12,0,-Math.cos(angle)*12];
  assert.ok(!dragonHits(s,point,0,.05));
  assert.ok(!dragonHits(s,point,.12,.15));
  assert.ok(dragonHits(s,point,.4,.5));
  assert.ok(dragonHits(s,point,0,1));
  s.move='slam'; assert.ok(!dragonHits(s,[0,0,-12],0,.47)); assert.ok(dragonHits(s,[0,0,-12],.47,.5));
  assert.ok(!dragonHits(s,[0,0,12],0,1));
  s.move='meteor'; assert.ok(!dragonHits(s,[0,0,0],0,.71)); assert.ok(dragonHits(s,[0,0,0],.7,.8));
});
test('hard dragon takes sustained offense and unhealed mistakes are lethal', () => {
  assert.equal(dragonHp(1),3200); assert.equal(dragonHp(1,2),5120);
  assert.ok(dragonHp(10,1,true)>dragonHp(10));
  assert.ok(DRAGON_ATTACKS.breath.damage+DRAGON_ATTACKS.slam.damage>100);
  const cycle=Object.values(DRAGON_ATTACKS).reduce((n,a)=>n+a.warn+a.active+a.recover+1.1,0)/4;
  assert.ok(cycle<7.5, 'average attack cadence must stay below 7.5s');
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

test('six elemental bosses cycle by floor and retain distinct attacks and scaling', () => {
  assert.deepEqual(Array.from({length:6},(_,i)=>dragonElement(i+1)),DRAGON_ELEMENTS);
  assert.equal(dragonElement(7),'fire'); assert.equal(dragonElement(10,true),'void');
  const names=new Set(), colors=new Set(), cycles=new Set();
  for(const element of DRAGON_ELEMENTS) {
    const profile=DRAGON_PROFILES[element], s=createDragonState(element); names.add(profile.name); colors.add(profile.color); cycles.add(profile.order.join(','));
    const attacks=[];
    for(let i=0;i<16;i++) { const ev=stepDragon(s,100,input); if(ev==='windup')attacks.push(s.move); }
    assert.deepEqual(attacks,profile.order);
    s.move='breath';const a=dragonAttack(s);assert.equal(a.range,profile.range);assert.ok(a.damage>35&&a.damage<60);
    assert.ok(dragonHp(7)>dragonHp(1));
  }
  assert.equal(names.size,6);assert.equal(colors.size,6);assert.ok(cycles.size>=5);
  const s=createDragonState('ice');s.move='breath';assert.ok(dragonAttack(s).angle>dragonAttack(createDragonState('thunder')).angle);
  s.element='void';s.move='meteor';assert.equal(dragonAttack(s).range,8);
});

test('each boss has a distinct articulated silhouette, hittable body, and fits the arena', () => {
  const shapes=new Set();
  for(const element of DRAGON_ELEMENTS) {
    const kind=DRAGON_PROFILES[element].kind,m=buildGuardian(kind),actor=new THREE.Group();actor.add(m);
    const ud=m.userData;assert.ok(ud.hitParts.length>=4);shapes.add(kind);
    for(const stage of ['idle','windup','strike','recover'])for(const move of Object.keys(DRAGON_ATTACKS))for(let j=0;j<=10;j++)for(let k=0;k<8;k++) {
      Object.assign(ud,{stage,move,progress:j/10});actor.rotation.y=k*Math.PI/4;animateGuardian(ud,1,false);
      const b=new THREE.Box3().setFromObject(actor);
      assert.ok(b.max.y<DRAGON_HALL_HEIGHT,kind+' ceiling '+move+' '+stage);
      assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.min.z),b.max.x,b.max.z)+DRAGON_ROAM<18,kind+' wall '+move+' '+stage);
      assert.ok(intersectsDragon(m,ud.hitParts[0].getWorldPosition(new THREE.Vector3()),.1));
    }
  }
  assert.equal(shapes.size,6);
});

test('boss defenses reward six different counterplay decisions', () => {
  const s={...createDragonState(),stage:'windup',remaining:1};
  assert.ok(guardianDefense(s,{mouthHit:true}).stagger);assert.ok(!guardianDefense(s,{mouthHit:false}).stagger);
  assert.ok(!guardianDefense(s,{mouthHit:true,silent:true}).stagger);
  s.element='thunder';assert.equal(guardianDefense(s).reflect,8);s.stage='recover';assert.ok(!guardianDefense(s).reflect);
  s.stage='windup';s.element='wind';assert.equal(guardianDefense(s,{distance:12}).mult,.3);assert.equal(guardianDefense(s,{distance:6}).mult,1);
  s.element='holy';assert.equal(guardianDefense(s,{front:true}).mult,.25);assert.equal(guardianDefense(s,{front:false}).mult,1);
  assert.equal(frostExposure(0,2.5,0,15),2.5);assert.equal(frostExposure(2.5,1,2,15),0);assert.equal(frostExposure(2.5,1,0,25),0);
});
test('live damage pipeline applies reflection and mouth interruption without recursive reflection', async () => {
  const {FX}=await import('../public/js/spells.js');
  const body=buildDragon(),s=createDragonState('thunder');s.stage='windup';s.remaining=1;
  const e={id:'guardian',type:'dragon',team:'monster',alive:true,hp:1000,maxHp:1000,body,pos:new THREE.Vector3(),yaw:0,status:{},dragon:s,updateHpBar(){}};
  const p={id:'hero',isMage:true,team:'hero',alive:true,hp:100,maxHp:100,pos:new THREE.Vector3(0,0,-12),status:{}};
  Object.assign(G,{isHost:true,time:1,player:p,fx:FX});
  FX.damage(e,100,[],p,{});assert.equal(e.hp,955);assert.equal(p.hp,92);
  s.element='fire';const head=body.userData.head.getWorldPosition(new THREE.Vector3());
  FX.damage(e,50,[],p,{hitPoint:head.toArray()});assert.equal(s.stage,'recover');assert.ok(e.vulnUntil>G.time);
});

test('movement uses species-specific arcs, landings and a short untargetable blink',()=>{
  assert.ok(guardianTravelPose('dragon',.5).height>2);
  assert.ok(guardianTravelPose('griffin',.5).height>3);
  assert.ok(guardianTravelPose('beast',.5).height>1);
  assert.ok(guardianTravelPose('reaper',.5).hidden);assert.ok(!guardianTravelPose('reaper',1).hidden);
  for(const kind of ['dragon','giant','beast','griffin','sentinel','reaper']) {
    const m=buildGuardian(kind);
    for(let j=0;j<=20;j++) {
      Object.assign(m.userData,{stage:'idle',travelProgress:j/20});animateGuardian(m.userData,1,true);
      const b=new THREE.Box3().setFromObject(m);
      assert.ok(b.max.y<DRAGON_HALL_HEIGHT,kind+' airborne ceiling');
      assert.ok(Number.isFinite(b.max.y));
      if(kind==='reaper'&&j===10)assert.ok(!intersectsDragon(m,m.userData.head.getWorldPosition(new THREE.Vector3()),1));
    }
    assert.ok(m.visible);assert.ok(m.position.y<1);
  }
});

test('standing builds frost, movement clears it, and distance breaks the reaper drain',()=>{
  globalThis.document={getElementById:()=>null};
  const e={id:'hazards',type:'dragon',alive:true,pos:new THREE.Vector3(20,0,20),yaw:0,hp:900,maxHp:1000,status:{},body:buildGuardian('giant'),dragon:createDragonState('ice'),radius:1,team:'monster',updateHpBar(){}};
  const p={id:'tester',team:'hero',alive:true,pos:new THREE.Vector3(20,0,12)};const hits=[];
  Object.assign(G,{scene:new THREE.Scene(),enemies:[e],mages:[p],player:p,isHost:true,time:0,floor:2,dungeon:{grid:new Uint8Array(W*W).fill(1),hgt:new Float32Array(W*W)},obstacles:[],fx:{damage:(target,n)=>hits.push(n),burst(){}}});
  e.dragon.remaining=20;
  for(let i=0;i<34;i++)updateDragons(.1);
  assert.ok(hits.includes(6));assert.equal(e.guardianExposure.get(p.id).frost,2.5);
  for(let i=0;i<11;i++){p.pos.x+=.1;updateDragons(.1);}
  assert.equal(e.guardianExposure.get(p.id).frost,0);
  e.dragon={...createDragonState('void'),stage:'windup',remaining:20};e.guardianExposure.clear();hits.length=0;
  for(let i=0;i<11;i++)updateDragons(.1);
  assert.equal(e.hp,918);assert.deepEqual(hits,[6]);
  p.pos.z=5;for(let i=0;i<11;i++)updateDragons(.1);
  assert.equal(e.hp,918);assert.deepEqual(hits,[6]);
  e.alive=false;updateDragons(.1);clearDragons();
});
