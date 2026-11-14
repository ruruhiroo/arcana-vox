import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {G}from '../public/js/state.js';
import {generate,bfs,W,H,CELL,findFreePosition,collides,moveWithCollision,breakable}from '../public/js/dungeon.js';
import {prepareArena,insideArena,arenaBlocksMove,arenaDoorCollision,openArenaDoor,updateArena}from '../public/js/arena-room.js';
import {addCarry,carryRoom,carryOrder,migrateCarry,canCraft}from '../public/js/carry.js';
import {compile,expandChant,callName,eloquence,chantCoverage}from '../public/js/lexicon.js';
import {payload}from '../public/js/spell-payload.js';
import {blinkDestination,utilityError,castUtility}from '../public/js/utility-magic.js';
import {tuneEquipment,totals}from '../public/js/equipment.js';
import {captureCheckpoint,validCheckpoint}from '../public/js/checkpoint.js';
import {itemGripProfile,makeItemGrip}from '../public/js/item-grip.js';
function flat(){G.obstacles=[];G.dungeon={grid:new Uint8Array(W*H).fill(1),hgt:new Float32Array(W*H),rooms:[{cells:Array.from({length:100},(_,i)=>[10+i%10,10+Math.floor(i/10)])}],solids:[],start:{cells:[[12,12],[13,12]]}};return G.dungeon;}
test('six slots are the whole inventory, including spare equipment; partial stacks stay bounded',()=>{
 const inv={};for(const k of ['a','b','c','d','e','gear_test'])assert.equal(addCarry(inv,k,1),1);
 assert.equal(addCarry(inv,'seventh'),0);assert.equal(addCarry(inv,'a',8),4);assert.equal(addCarry(inv,'gear_test'),0);inv.b=0;assert.equal(addCarry(inv,'new'),1);assert.equal(carryOrder(inv).filter(Boolean).length,6);
 assert.equal(canCraft(inv,{id:'crafted',need:{new:1}}),true);assert.equal(canCraft(inv,{id:'crafted',need:{a:1}}),false);
});
test('old bags migrate once without deleting overflow; six-key order has no duplicate slots',()=>{
 const old={a:8,b:1,c:1,d:1,e:1,f:1,g:2},bag=[{uid:'old',stats:{}}],m=migrateCarry(old,['b','b','a'],bag);
 assert.equal(Object.keys(m.inv).length,6);assert.equal(m.inv.a,5);assert.equal(m.overflow.reduce((n,o)=>n+o.count,0),6);assert.deepEqual(old.a,8);assert.equal(migrateCarry(m.inv,m.quick,m.bag).overflow.length,0);
});
test('arena is a distant destination with exactly one entrance across 200 seeded floors',()=>{
 for(let i=1;i<=200;i++){const d=generate(i*7919,i%10+1),a=prepareArena(d),dist=bfs(d.grid,d.start.cx,d.start.cy);assert.equal(a.gates.length,1);assert.ok(Math.min(...d.portalRoom.cells.map(([x,z])=>dist[z*W+x]))*CELL>=128);}
});
test('door blocks entry until opened, then locks retreat and opens after victory',()=>{
 const d=generate(7,1);G.dungeon=d;const a=prepareArena(d),g=a.gates[0];G.time=10;G.isHost=true;G.mode='coop';G.enemies=[{guardian:true,alive:true}];G.mages=[];
 assert.ok(arenaDoorCollision(g.x,g.z,.4));openArenaDoor();G.time=12;updateArena();assert.equal(a.phase,'open');assert.equal(arenaDoorCollision(g.x,g.z,.4),false);
 const p=new THREE.Vector3(g.x-g.dx*1.5,g.y,g.z-g.dz*1.5);G.mages=[{pos:p,alive:true,team:'hero'}];updateArena();assert.equal(a.phase,'active');
 assert.ok(arenaBlocksMove(p,{x:g.x+g.dx,z:g.z+g.dz},.4,'hero'));assert.equal(arenaBlocksMove({x:g.x+g.dx,z:g.z+g.dz},p,.4,'hero'),false);
 assert.equal(breakable(d.portalRoom.x-1,d.portalRoom.cy),false);G.enemies[0].alive=false;updateArena();assert.equal(a.phase,'cleared');assert.equal(arenaBlocksMove(p,{x:g.x+g.dx,z:g.z+g.dz},.4,'hero'),false);
});
test('spawn resolution avoids real shelf footprints, other bodies, walls and height steps',()=>{
 const d=flat();d.solids=[{x:50,z:50,halfX:1.8,halfZ:.4,cos:1,sin:0}];const room=d.rooms[0],occupied=[];
 for(const radius of [.4,.9,1.8]){const p=findFreePosition(new THREE.Vector3(50,0,50),radius,{room,occupied});assert.ok(p);assert.equal(collides(p.x,p.z,radius+.15,'hero'),false);occupied.push({pos:p,radius});}
 const player=new THREE.Vector3(46,0,50);moveWithCollision(player,9,0,.4,'hero');assert.ok(player.x<48,'fast movement cannot cross shelf');
});
test('blink cannot cross a wall, furniture or an active arena boundary',()=>{
 const d=flat(),caster={pos:new THREE.Vector3(50,0,50),radius:.4,team:'hero',yaw:-Math.PI/2};d.grid[12*W+13]=0;
 assert.ok(blinkDestination(caster,new THREE.Vector3(1,0,0)).x<52);d.grid.fill(1);d.arena={minX:40,maxX:52,minZ:40,maxZ:60,phase:'active',gates:[]};assert.ok(blinkDestination(caster,new THREE.Vector3(1,0,0)).x<=51.6);
 G.time=5;caster.blinkUntil=7;assert.ok(utilityError(caster,{effects:['blink'],power:1}));assert.ok(utilityError(caster,{effects:['recall']}));
});
test('five utility chants compile, reject harmful mixtures, and apply only on their owner',()=>{
 flat();G.time=20;G.enemies=[];G.pickups=[];G.explored=new Uint8Array(W*H);const caster={pos:new THREE.Vector3(50,0,50),status:{burn:{},poison:{},slow:{}},radius:.4,team:'hero'};G.player=caster;
 for(const id of ['転移','浮遊','探知','浄化','帰還']){const base=expandChant('我に '+id),s=compile(base+' '+callName(compile(base,null)),null);assert.ok(s.valid,id);assert.ok(s.cost>=10&&s.cost<=50,id);}
 assert.equal(compile('汝に 転移 紅蓮 穿槍 放て',null).valid,false);
 castUtility(caster,{effects:['cleanse']},{},false,{});assert.ok(caster.status.burn);
 castUtility(caster,{effects:['cleanse']},{},true,{burst(){}});assert.equal(Object.keys(caster.status).length,0);
 castUtility(caster,{effects:['levitate']},{},true,{burst(){}});assert.equal(caster.status.levitate.t,12);
});
test('complete chants reward accuracy without making abbreviated casts free; equipment upgrades are idempotent',()=>{
 const base=expandChant('汝に 紅蓮 穿槍'),full=base+' '+callName(compile(base,null)),s=compile(full,null);s.power*=1+eloquence(full,null).bonus;
 assert.ok(payload(s).dmg>70);assert.equal(s.cost,22);const short=compile('汝に 紅蓮 穿槍 ファイアランス',null);short.power*=.5+.5*chantCoverage(short.text,short.words);assert.ok(payload(short).dmg<payload(s).dmg);assert.equal(short.cost,s.cost);
 // 装備は一つの品に一つの効果: 以前の版の品(効果がいくつも付いていた)は、素体と希少度から一つの効果に直る。直すのは一度きり
 const gear=tuneEquipment({slot:'cloak',bid:'drake',rarity:1,stats:{maxHp:24,elem:'fire',elemPow:.05}}),before=JSON.stringify(gear);tuneEquipment(gear);assert.equal(JSON.stringify(gear),before);assert.deepEqual(gear.stats,{maxHp:30});assert.equal(totals({gear}).maxHp,30);
 const fang={slot:'necklace',bid:'fang',rarity:3,stats:{power:.6},balanceVersion:3};assert.equal(totals({a:fang,b:fang,c:fang,d:fang}).power,1.5);
});
test('checkpoint is JSON-only and keeps the actual sanctuary, seed, loot and enemy state',()=>{
 const d=flat();d.seed=7919;G.floor=3;G.player={pos:new THREE.Vector3(50,0,50),hp:76,mp:42,yaw:.4,pitch:0};G.enemies=[{id:'e3_0',type:'skeleton',alive:true,hp:21,maxHp:90,pos:new THREE.Vector3(60,0,60)}];G.pickups=[{id:'drop',kind:'loot',pos:new THREE.Vector3(51,0,50),data:{mat:'ether'}}];
 const c=JSON.parse(JSON.stringify(captureCheckpoint(G,{known:['heal']},{})));assert.ok(validCheckpoint(c));assert.equal(c.seed,7919);assert.equal(c.enemies[0].hp,21);assert.equal(c.pickups[0].data.mat,'ether');assert.deepEqual(c.position,[50,0,50]);assert.equal(validCheckpoint({...c,position:[NaN,0,0]}),false);
});
test('each held item gets an opposing thumb, four fingers and a stable prop-relative grip',()=>{
 for(const key of ['ether','herb','crystal','bone','iron','scroll_fire','tome_ice','gear_ring']){const profile=itemGripProfile(key,new THREE.Vector3(.09,.16,.06)),hand=makeItemGrip(profile);assert.ok(hand.getObjectByName('opposing_thumb'));for(let i=0;i<4;i++)assert.ok(hand.getObjectByName('finger_'+i));assert.ok(new THREE.Box3().setFromObject(hand).getSize(new THREE.Vector3()).length()<.5);}
});
