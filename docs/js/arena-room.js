import * as THREE from 'three';
import { G } from './state.js';

let doorGrain;
function agedWood(){
  if(doorGrain)return doorGrain;
  const n=256,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const grain=Math.sin(x*.8+Math.sin(y*.025)*1.7)*.08+Math.sin(x*2.2+y*.018)*.035;
    const seam=x%64<2?.25:1,stain=.75+.15*Math.sin(y*.021+x*.04);
    const value=Math.max(0,Math.min(1,(.7+grain)*seam*stain));const i=(y*n+x)*4;
    data[i]=value*255;data[i+1]=value*242;data[i+2]=value*216;data[i+3]=255;
  }
  doorGrain=new THREE.DataTexture(data,n,n);doorGrain.colorSpace=THREE.SRGBColorSpace;doorGrain.wrapS=doorGrain.wrapT=THREE.RepeatWrapping;doorGrain.magFilter=THREE.LinearFilter;doorGrain.needsUpdate=true;return doorGrain;
}

export function prepareArena(d, cell=4, width=52) {
  if(!d.floor || !d.portalRoom)return null;
  const r=d.portalRoom, gates=[];
  const bounds={minX:r.x*cell,maxX:(r.x+r.w)*cell,minZ:r.y*cell,maxZ:(r.y+r.h)*cell};
  for(const [x,z] of r.cells)for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx=x+dx,nz=z+dz;
    if(nx>=r.x&&nx<r.x+r.w&&nz>=r.y&&nz<r.y+r.h)continue;
    if(d.grid[nz*width+nx])gates.push({x:(x+.5+dx*.5)*cell,z:(z+.5+dz*.5)*cell,y:d.hgt[z*width+x]||0,dx,dz});
  }
  return d.arena={...bounds,gates,phase:'dormant'};
}
export function insideArena(p,a=G.dungeon?.arena,margin=0) {
  return !!a&&p.x>=a.minX+margin&&p.x<=a.maxX-margin&&p.z>=a.minZ+margin&&p.z<=a.maxZ-margin;
}
export function arenaBlocksMove(from,to,r,team,a=G.dungeon?.arena) {
  if(!a||a.phase!=='active')return false;
  // Allies can join through the entrance; once across the threshold they cannot retreat.
  if(insideArena(from,a,r))return !insideArena(to,a,r);
  return team!=='hero'&&insideArena(to,a,-r);
}
export function arenaDoorCollision(x,z,r,a=G.dungeon?.arena){if(!a||a.phase!=='dormant'&&a.phase!=='opening')return false;return a.gates.some(g=>Math.abs(g.dx?x-g.x:z-g.z)<.23+r&&Math.abs(g.dx?z-g.z:x-g.x)<1.9+r);}
export function arenaDoorNear(p,a=G.dungeon?.arena){return a?.phase==='dormant'&&a.gates.some(g=>Math.hypot(p.x-g.x,p.z-g.z)<3.2);}
export function openArenaDoor(){const a=G.dungeon?.arena;if(!a||a.phase!=='dormant')return; a.phase='opening';a.openAt=G.time||0;G.ui?.log('封印の大扉を開く。入場後は守護者を倒すまで戻れない。','#dbc59c');}
export function buildArena(d,group) {
  const a=prepareArena(d);if(!a)return;
  const stone=new THREE.MeshStandardMaterial({color:0x514c46,roughness:.92});
  const iron=new THREE.MeshStandardMaterial({color:0x292624,metalness:.6,roughness:.7});
  d.arenaVeils=[];d.arenaDoors=[];
  for(const gate of a.gates) {
    const frame=new THREE.Group();frame.position.set(gate.x,gate.y,gate.z);frame.rotation.y=gate.dx?Math.PI/2:0;
    for(const x of [-1.85,1.85]){const p=new THREE.Mesh(new THREE.BoxGeometry(.25,5.4,.5),stone);p.position.set(x,2.7,0);frame.add(p);}
    const top=new THREE.Mesh(new THREE.BoxGeometry(4, .35,.6),stone);top.position.y=5.4;frame.add(top);
    const wood=new THREE.MeshStandardMaterial({color:0x8c6b4b,map:agedWood(),roughness:.87});
    const bronze=new THREE.MeshStandardMaterial({color:0x88714b,roughness:.7,metalness:.4});
    for(const side of [-1,1])for(const y of [.2,1.4,2.8,4.2,5.15]){
      const cap=new THREE.Mesh(new THREE.BoxGeometry(.34,.14,.64),stone);cap.position.set(side*1.85,y,0);frame.add(cap);
    }
    // A lit threshold makes the closed gate readable before the fight starts.
    for(const z of [-.48,.48]){
      const light=new THREE.PointLight(0xffc28a,18,12,2);light.position.set(0,3.8,Math.sign(z)*1.2);frame.add(light);
      for(const x of [-1.65,1.65]){
        const cage=new THREE.Mesh(new THREE.ConeGeometry(.13,.45,6),bronze);cage.position.set(x,3.65,z);frame.add(cage);
        const ember=new THREE.Mesh(new THREE.OctahedronGeometry(.09),new THREE.MeshStandardMaterial({color:0xffcf91,emissive:0xff9e47,emissiveIntensity:2}));ember.scale.y=2;ember.position.set(x,3.95,z);frame.add(ember);
      }
    }
    for(const side of [-1,1]){
      const hinge=new THREE.Group();hinge.position.x=side*1.75;frame.add(hinge);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(1.74,5.15,.28),wood);leaf.position.set(-side*.87,2.58,0);hinge.add(leaf);
      for(const y of [.35,1.65,3.5,4.85]){const band=new THREE.Mesh(new THREE.BoxGeometry(1.73,.09,.34),iron);band.position.set(-side*.87,y,0);hinge.add(band);}
      for(const x of [-.66,-.22,.22,.66]){const strip=new THREE.Mesh(new THREE.BoxGeometry(.035,4.7,.32),iron);strip.position.set(-side*.87+x,2.6,0);hinge.add(strip);}
      for(const z of [-.19,.19]){
        const border=new THREE.Mesh(new THREE.BoxGeometry(1.53,.045,.04),bronze);border.position.set(-side*.87,.55,z);hinge.add(border);
        for(const x of [-.73,.73]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.045,4.2,.04),bronze);rail.position.set(-side*.87+x,2.65,z);hinge.add(rail);}
        for(const x of [-.65,.65])for(const y of [.35,1.65,3.5,4.85]){const rivet=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),bronze);rivet.scale.z=.45;rivet.position.set(-side*.87+x,y,z);hinge.add(rivet);}
        const crest=new THREE.Mesh(new THREE.TorusGeometry(.4,.045,6,6),bronze);crest.scale.y=1.6;crest.position.set(-side*.87,3.1,z);hinge.add(crest);
        const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.24),bronze);diamond.scale.set(.65,1.6,.25);diamond.position.set(-side*.87,3.1,z);hinge.add(diamond);
        const handle=new THREE.Mesh(new THREE.TorusGeometry(.14,.035,8,20),bronze);handle.position.set(-side*1.5,2.15,z);hinge.add(handle);
        for(const branch of [-1,1]){
          const curve=new THREE.CatmullRomCurve3([[0,3.75],[branch*.22,4.02],[branch*.48,4.25],[branch*.55,4.65]].map(([x,y])=>new THREE.Vector3(-side*.87+x,y,z)));
          hinge.add(new THREE.Mesh(new THREE.TubeGeometry(curve,14,.035,6,false),bronze));
        }
      }
      d.arenaDoors.push({hinge,side});
    }
    for(const x of [-1.72,1.72]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,6,16),iron);ring.position.set(x,1.7,.32);frame.add(ring);}
    const veil=new THREE.Mesh(new THREE.PlaneGeometry(3.5,5.2),new THREE.MeshStandardMaterial({color:0x776079,emissive:0x3c2046,emissiveIntensity:.45,transparent:true,opacity:.58,side:THREE.DoubleSide,depthWrite:false}));
    veil.position.y=2.6;veil.visible=false;frame.add(veil);d.arenaVeils.push(veil);group.add(frame);
  }
}
// 登場: 封印が閉じてからの数秒、守護者は眠りから起き上がって吠える(その間は攻撃しない)
export const ARENA_INTRO=4.2;
export function arenaIntro(a=G.dungeon?.arena){
  if(!a||a.phase==='cleared')return 1;
  if(a.phase!=='active')return 0;
  return Math.max(0,Math.min(1,((G.time||0)-(a.activeAt??-99))/ARENA_INTRO));
}
export function updateArena() {
  const d=G.dungeon,a=d?.arena;if(!a||G.mode!=='coop')return;
  if(G.isHost) {
    const alive=G.enemies.some(e=>e.guardian&&e.alive);
    if(!alive)a.phase='cleared';
    else if(a.phase==='opening'&&(G.time||0)-(a.openAt||0)>=1.6)a.phase='open';
    else if(a.phase==='open'&&G.mages.some(m=>m.alive&&!m.downed&&m.team==='hero'&&insideArena(m.pos,a,1))) {
      a.phase='active';G.ui?.log('背後の封印が閉じた。守護者を倒せ。','#cfb6df');
    }
  }
  if(a.phase==='active'&&a.seenPhase!=='active')a.activeAt=a.seenPhase?(G.time||0):-99; // 途中から(再開・途中参加)なら登場は飛ばす
  a.seenPhase=a.phase;
  const open=a.phase==='dormant'?0:a.phase==='opening'?Math.min(1,((G.time||0)-(a.openAt||0))/1.6):1;
  for(const {hinge,side}of d.arenaDoors||[])hinge.rotation.y=side*open*1.5;
  for(const v of d.arenaVeils||[]){v.visible=a.phase==='active';v.material.opacity=.52+Math.sin((G.time||0)*1.8)*.06;}
}
