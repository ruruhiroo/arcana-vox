import * as THREE from 'three';
import { G } from './state.js';
import { collides, heightAt, ceilingAt, moveWithCollision, findFreePosition, CELL, W, H } from './dungeon.js';
import { insideArena } from './arena-room.js';
export const UTILITY_EFFECTS=['blink','levitate','survey','cleanse','recall'];
export function utilityError(caster,spell){
  if(spell.effects.includes('blink')){
    if((caster.blinkUntil||0)>(G.time||0))return '転移はまだ安定していない';
    const dest=blinkDestination(caster,new THREE.Vector3(-Math.sin(caster.yaw||0),0,-Math.cos(caster.yaw||0)),spell.power);
    if(dest.distanceTo(caster.pos)<.4)return '転移する足場がない';
  }
  if(spell.effects.includes('recall')){
    if(insideArena(caster.pos)&&G.dungeon.arena.phase==='active')return '封印の内側では帰還できない';
    if(G.enemies.some(e=>e.alive&&e.pos.distanceTo(caster.pos)<14))return '近くに敵がいる。帰還に集中できない';
    const origin=caster.spawn||G.spawnPoint;
    if(!origin||!findFreePosition(origin,caster.radius||.4,{room:G.dungeon.start,occupied:(G.mages||[]).filter(m=>m!==caster&&m.alive)}))return '安全な帰還先が見つからない';
  }
  return null;
}

export function blinkDestination(caster,dir,power=1) {
  const p=caster.pos.clone(),d=new THREE.Vector3(dir.x,0,dir.z).normalize(),r=caster.radius||.4;
  const range=Math.min(8,4+2*power),start=p.clone();
  for(let t=0;t<range;t+=.2){const before=p.clone();moveWithCollision(p,d.x*.2,d.z*.2,r,caster.team);
    if(p.distanceTo(before)<.1||collides(p.x,p.z,r,caster.team)||Math.abs(heightAt(p.x,p.z)-start.y)>1.2){p.copy(before);break;}
    p.y=heightAt(p.x,p.z);
  }
  return p;
}
export function castUtility(caster,spell,aim,local,fx) {
  const kind=spell.effects.find(e=>UTILITY_EFFECTS.includes(e));if(!kind)return false;
  if(!local)return true; // Movement / status authority stays with the owning client.
  const p=caster.pos,old=p.clone(),duration=spell.eternal?1.6:1;
  if(kind==='blink') {
    if((caster.blinkUntil||0)>G.time){G.ui?.log('転移はまだ安定していない');return true;}
    p.copy(blinkDestination(caster,new THREE.Vector3(...aim.dir),spell.power));caster.blinkUntil=G.time+5;
  } else if(kind==='recall') {
    if(insideArena(p)&&G.dungeon.arena.phase==='active'){G.ui?.log('封印の内側では帰還できない');return true;}
    if(G.enemies.some(e=>e.alive&&e.pos.distanceTo(p)<14)){G.ui?.log('近くに敵がいる。帰還に集中できない');return true;}
    const dest=findFreePosition(caster.spawn||G.spawnPoint,caster.radius||.4,{room:G.dungeon.start,occupied:G.mages.filter(m=>m!==caster&&m.alive)});if(dest)p.copy(dest);
  } else if(kind==='levitate'){caster.status.levitate={t:12*duration};}
  else if(kind==='cleanse'){for(const k of ['burn','poison','slow','bound','frozen','cursed','erosion','tiny','giant','invert','drunk'])delete caster.status[k];}
  else if(kind==='survey'&&caster===G.player){
    const radius=24,x=Math.floor(p.x/CELL),z=Math.floor(p.z/CELL);
    for(let zz=Math.max(0,z-6);zz<Math.min(H,z+7);zz++)for(let xx=Math.max(0,x-6);xx<Math.min(W,x+7);xx++)if(Math.hypot((xx+.5)*CELL-p.x,(zz+.5)*CELL-p.z)<radius)G.explored[zz*W+xx]=1;
    const count=G.pickups.filter(k=>k.pos.distanceTo(p)<radius).length;G.ui?.log(`探知 — 周囲の地形が浮かび、${count}個の品の気配を感じた`,'#b8e2e8');
  }
  if(!old.equals(p)){caster.vel?.set(0,0,0);caster.vy=0;caster.root?.position.copy(p);fx.burst(old.clone().add(new THREE.Vector3(0,1,0)),0x9ad4df,30,{speed:2});}
  fx.burst(p.clone().add(new THREE.Vector3(0,.6,0)),0xaddce5,35,{speed:2,up:1});return true;
}
export function floatHeight(p){return Math.min(heightAt(p.x,p.z)+1.05,ceilingAt(p.x,p.z)-2.2);}
