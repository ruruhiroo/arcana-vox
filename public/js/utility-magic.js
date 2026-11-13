import * as THREE from 'three';
import { G } from './state.js';
import { collides, heightAt, ceilingAt, moveWithCollision, findFreePosition, CELL, W, H } from './dungeon.js';
import { insideArena } from './arena-room.js';
export const UTILITY_EFFECTS=['blink','levitate','survey','cleanse','recall','flamejet','frostwave','sparkstep','gust','sanctum'];
const ARTS=['flamejet','frostwave','sparkstep','gust','sanctum'];   // 誓いの術(再使用まで6秒)
const flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function utilityError(caster,spell){
  if(spell.effects.includes('blink')){
    if((caster.blinkUntil||0)>(G.time||0))return '転移はまだ安定していない';
    const dest=blinkDestination(caster,new THREE.Vector3(-Math.sin(caster.yaw||0),0,-Math.cos(caster.yaw||0)),spell.power);
    if(dest.distanceTo(caster.pos)<.4)return '転移する足場がない';
  }
  if(spell.effects.some(e=>ARTS.includes(e))&&(caster.artUntil||0)>(G.time||0))return '誓いの術は、まだ練り直している';
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
  else if(ARTS.includes(kind)){
    if((caster.artUntil||0)>G.time){G.ui?.log('誓いの術は、まだ練り直している');return true;}
    caster.artUntil=G.time+6;
    const pw=Math.max(0.6,spell.power||1),dir=new THREE.Vector3(...aim.dir),fd=new THREE.Vector3(dir.x,0,dir.z).normalize(),foes=()=>(G.enemies||[]).filter(e=>e.alive);
    const hit=(e,amount,els,o={})=>G.fx.damage(e,amount,els,caster,{power:pw,...o});
    if(kind==='flamejet'){
      // 炎を吹き続ける: 向きは吹いている間も術者に従う
      let t=0,tick=0;
      (G.vfx||=[]).push({obj:null,update:dt=>{
        t+=dt;tick-=dt;if(!caster.alive||caster.downed)return false;
        const yaw=caster.yaw||0,pitch=caster.pitch||0,d=caster===G.player?new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)):dir;
        const from=caster.pos.clone().add(new THREE.Vector3(0,1.25,0)).addScaledVector(d,caster===G.player?1.9:0.8);from.y-=caster===G.player?0.25:0;
        for(let i=0;i<4;i++){const v=d.clone().multiplyScalar(9+Math.random()*5).add(new THREE.Vector3((Math.random()-.5)*2.6,(Math.random()-.5)*2+0.6,(Math.random()-.5)*2.6));G.particles?.emit(from,v,i%3===0?0xc89040:i%3===1?0xd05a10:0xb03008,0.3+Math.random()*0.35,0.45+Math.random()*0.25);}
        if(tick<=0){tick=0.2;const f2=new THREE.Vector3(d.x,0,d.z).normalize();for(const e of foes()){const v=e.pos.clone().sub(caster.pos);v.y=0;const dd=v.length();if(dd>7+e.radius||dd<0.01)continue;if(v.dot(f2)/dd<0.86&&dd>1.5)continue;hit(e,4*pw,['fire'],{dir:f2.toArray()});}}
        return t<2.4;}});
      G.ui?.log('火炎放射 — 向いている先へ炎を吹く','#ff9a50');
    } else if(kind==='frostwave'){
      for(const e of foes()){if(flat(e.pos,p)>6+e.radius)continue;hit(e,18*pw,['ice']);if(G.isHost!==false){e.stun=Math.max(e.stun||0,2.4);e.status.frozen={t:2.4};e.status.slow={t:6};}}
      for(let i=0;i<70;i++){const a=i/70*Math.PI*2;G.particles?.emit(p.clone().setY(p.y+0.2),new THREE.Vector3(Math.cos(a)*9,0.3+Math.random(),Math.sin(a)*9),i%2?0xcfeeff:0x8ad0ff,0.5,0.65);}
      G.fx.bigImpact?.(p.clone().setY(p.y+0.3),0x9fe4ff,1.6,['ice']);
      G.ui?.log('凍波 — 周りの敵が凍りついた','#9fe4ff');
    } else if(kind==='sparkstep'){
      const from=p.clone(),dest=blinkDestination({...caster,pos:p},fd,1.5);
      for(const e of foes()){const ab=dest.clone().sub(from),t0=Math.max(0,Math.min(1,e.pos.clone().sub(from).dot(ab)/Math.max(1e-6,ab.lengthSq())));if(flat(from.clone().addScaledVector(ab,t0),e.pos)>1.5+e.radius)continue;hit(e,34*pw,['thunder']);if(G.isHost!==false)e.stun=Math.max(e.stun||0,0.7);}
      for(let i=0;i<40;i++){const q=from.clone().lerp(dest,i/40).add(new THREE.Vector3((Math.random()-.5)*.5,0.4+Math.random()*1.4,(Math.random()-.5)*.5));G.particles?.emit(q,new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2),i%3?0xd8b0ff:0xffffff,0.3,0.45);}
      p.copy(dest);G.fx.bigImpact?.(dest.clone().setY(dest.y+0.6),0xb48cff,0.9,['thunder']);
    } else if(kind==='gust'){
      for(const e of foes()){const v=e.pos.clone().sub(p);v.y=0;const dd=v.length();if(dd>8+e.radius||dd<0.01||(v.dot(fd)/dd<0.72&&dd>1.6))continue;hit(e,10*pw,['wind'],{dir:fd.toArray()});if(G.isHost!==false){e.knock?.add(fd.clone().multiplyScalar(26));}}
      const side=new THREE.Vector3(-fd.z,0,fd.x);
      for(let i=0;i<70;i++){const o=p.clone().add(new THREE.Vector3(0,0.4+Math.random()*1.6,0)).addScaledVector(side,(Math.random()-.5)*2.4).addScaledVector(fd,0.6);G.particles?.emit(o,fd.clone().multiplyScalar(14+Math.random()*10).add(new THREE.Vector3(0,(Math.random()-.5)*2,0)),i%3?0x9effc8:0xffffff,0.22,0.45);}
      G.ui?.log('突風 — 前の敵を吹き飛ばした','#9effc8');
    } else if(kind==='sanctum'){
      for(const k of ['burn','poison','slow','bound','frozen','cursed','erosion','tiny','giant','invert','drunk'])delete caster.status[k];
      caster.hp=Math.min(caster.maxHp,caster.hp+25);
      for(const e of foes()){if(flat(e.pos,p)>6+e.radius||!e.T?.undead)continue;hit(e,30*pw,['holy']);}
      G.fx.bigImpact?.(p.clone().setY(p.y+0.3),0xffe9a0,1.4,['holy']);
      G.ui?.log('聖域 — 穢れを祓い、生命が戻った','#ffe9a0');
    }
  }
  else if(kind==='cleanse'){for(const k of ['burn','poison','slow','bound','frozen','cursed','erosion','tiny','giant','invert','drunk'])delete caster.status[k];}
  else if(kind==='survey'&&caster===G.player){
    const radius=24,x=Math.floor(p.x/CELL),z=Math.floor(p.z/CELL);
    for(let zz=Math.max(0,z-6);zz<Math.min(H,z+7);zz++)for(let xx=Math.max(0,x-6);xx<Math.min(W,x+7);xx++)if(Math.hypot((xx+.5)*CELL-p.x,(zz+.5)*CELL-p.z)<radius)G.explored[zz*W+xx]=1;
    const count=G.pickups.filter(k=>k.pos.distanceTo(p)<radius).length;G.ui?.log(`影の眼 — 闇が周囲の地形を囁き、${count}個の品の気配を感じた`,'#b89aff');
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;fx.burst(p.clone().add(new THREE.Vector3(Math.cos(a)*2.2,.3,Math.sin(a)*2.2)),0x6a3fd0,6,{speed:3.5,up:.4});}
  }
  if(!old.equals(p)){caster.vel?.set(0,0,0);caster.vy=0;caster.root?.position.copy(p);fx.burst(old.clone().add(new THREE.Vector3(0,1,0)),kind==='blink'?0x3a1a78:0x9ad4df,kind==='blink'?46:30,{speed:2});}
  const dark=kind==='blink'||kind==='survey';
  fx.burst(p.clone().add(new THREE.Vector3(0,.6,0)),dark?0x7a48e0:0xaddce5,dark?44:35,{speed:2,up:1});return true;
}
export function floatHeight(p){return Math.min(heightAt(p.x,p.z)+1.05,ceilingAt(p.x,p.z)-2.2);}
