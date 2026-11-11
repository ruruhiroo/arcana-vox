import * as THREE from 'three';
import { sculptGuardian } from './guardian-sculpt.js';
import { buildDragon, animateDragon } from './dragon-model.js';
import { smooth, sweepTurn } from './dragon-rules.js';

// 共通の戦闘インターフェースを持つ独自の守護者リグ。翼竜の色替えにしない。
export function buildGuardian(kind = 'dragon') {
  if (kind === 'dragon') return buildDragon();
  const root=new THREE.Group(); root.scale.setScalar(2.2);
  const materials={
    scales:new THREE.MeshStandardMaterial({color:0x516779,roughness:.75,flatShading:false}),
    armor:new THREE.MeshStandardMaterial({color:0x283748,roughness:.5,metalness:.35,flatShading:false}),
    membrane:new THREE.MeshStandardMaterial({color:0x668baa,side:THREE.DoubleSide,roughness:.9,flatShading:false}),
    coreMat:new THREE.MeshStandardMaterial({color:0xccedff,emissive:0x68cfff,emissiveIntensity:1.2}),
    horn:new THREE.MeshStandardMaterial({color:0xdbce9c,roughness:.45,metalness:.25}),
  };
  for(const [name,m] of Object.entries(materials))m.name='guardian-'+name;
  const {scales,armor,membrane,coreMat,horn}=materials,hitParts=[],legs=[],wings=[],arms=[];
  const orb=(parent,mat,pos,size,hit=false)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),mat);m.position.set(...pos);m.scale.set(...size);parent.add(m);if(hit)hitParts.push(m);return m;};
  const bone=(parent,a,b,r,mat)=>{const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b),d=bb.clone().sub(aa);const m=new THREE.Mesh(new THREE.CylinderGeometry(r*.7,r,d.length(),16),mat);m.position.copy(aa).add(bb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(m);return m;};
  const pivot=(parent,pos)=>{const g=new THREE.Group();g.position.set(...pos);parent.add(g);return g;};
  let torso,neck,head,jaw,core,tail;
  if(kind==='beast'||kind==='griffin') {
    torso=orb(root,scales,[0,1.7,.4],[.95,.9,1.75],true);
    neck=pivot(root,[0,1.9,-.9]);orb(neck,scales,[0,.35,-.35],[.7,.85,.85],true);
    head=pivot(neck,[0,.85,-.8]);orb(head,armor,[0,.12,-.2],[.46,.46,.65],true);
    jaw=pivot(head,[0,-.14,-.35]);orb(jaw,horn,[0,-.07,-.4],[.38,.2,.55],true);
    core=orb(neck,coreMat,[0,.2,-1],[.33,.4,.16]);
    for(const z of [-.85,1.55])for(const side of [-1,1]){
      const leg=pivot(root,[side*.7,1.5,z]);legs.push(leg);
      bone(leg,[0,0,0],[side*.45,-.7,.25],.27,scales);bone(leg,[side*.45,-.7,.25],[side*.46,-1.35,-.2],.2,armor);
      orb(leg,scales,[side*.2,-.45,.05],[.28,.6,.35],true);orb(leg,horn,[side*.46,-1.35,-.4],[.3,.15,.5],true);
    }
    tail=pivot(root,[0,1.45,1.8]);bone(tail,[0,0,0],[0,-.2,2.5],.25,scales);
    if(kind==='griffin') {
      // 鷲の鉤嘴、羽根を重ねた翼、獅子の後肢。

      for(const side of [-1,1]) {
        const wing=pivot(root,[side*.7,2.1,0]);wings.push(wing);
        bone(wing,[0,0,0],[side*2.1,1.1,-.2],.2,armor);

      }
    } else {
      for(const side of [-1,1]) {

        for(let i=0;i<7;i++) {const spike=orb(root,i%2?coreMat:armor,[side*.5,2.3,.1+i*.3],[.2,.7-i*.045,.3]);spike.rotation.z=side*.45;}
      }
    }
  } else {
    // 巨人、聖堂の石像、浮遊する死神は二足の異なる輪郭を持つ。
    torso=orb(root,scales,[0,2.2,0],[kind==='reaper'?.65:1.05,1.05,.65],true);
    neck=pivot(root,[0,3.1,-.05]);head=pivot(neck,[0,.65,0]);
    orb(head,kind==='reaper'?horn:armor,[0,0,0],[.5,.6,.45],true);
    jaw=pivot(head,[0,-.35,-.15]);orb(jaw,armor,[0,-.1,-.08],[.32,.22,.27],true);
    core=orb(root,coreMat,[0,2.5,-.66],[.3,.45,.14]);
    tail=pivot(root,[0,1.5,.5]);
    if(kind!=='reaper') for(const side of [-1,1]) {
      const leg=pivot(root,[side*.6,1.45,0]);legs.push(leg);
      orb(leg,armor,[0,-.6,0],[.4,.75,.42],true);orb(leg,scales,[0,-1.3,-.25],[.5,.15,.7],true);
    }
    for(const side of [-1,1]) {
      const arm=pivot(root,[side*1.05,2.95,0]);arms.push(arm);
      orb(arm,armor,[side*.18,0,0],[.6,.55,.65],true);
      bone(arm,[side*.1,0,0],[side*.4,-1.2,-.1],.28,scales);
      orb(arm,scales,[side*.35,-.85,-.1],[.32,.75,.4],true);
      orb(arm,armor,[side*.4,-1.45,-.15],[.45,.35,.5],true);
    }
    if(kind==='giant') {
      bone(arms[1],[.4,-1.4,0],[.4,-1.4,-2.8],.15,horn);
    } else if(kind==='sentinel') {
      const halo=new THREE.Mesh(new THREE.TorusGeometry(.95,.055,12,64),horn);halo.position.set(0,.3,.25);head.add(halo);
      for(const side of [-1,1])for(let i=0;i<3;i++)orb(root,horn,[side*(1+i*.3),3.05-i*.22,.2],[.18,.7,.35]);
    }
  }
  if(kind!=='reaper')for(const side of [-1,1]) {const eye=orb(head,coreMat,[side*.28,.1,-.43],[.08,.06,.07]);eye.userData.eye=true;}
  root.userData={kind:'guardian',species:kind,materials,torso,neck,head,jaw,core,tail,legs,wings,arms,hitParts,stage:'idle',move:'breath',progress:0};
  sculptGuardian(root,kind);
  root.traverse(o=>{if(o.isMesh)o.castShadow=true;});return root;
}
export function animateGuardian(ud,t,moving) {
  if(ud.kind==='dragon'||ud.species==='beast'||ud.species==='griffin') {
    animateDragon(ud,t,moving);
    if(ud.species==='griffin' && ud.stage==='idle')ud.wings.forEach((w,i)=>w.rotation.z=(i?1:-1)*(.12+Math.sin(t*2.5)*.14));
    animateGuardianTravel(ud,t); return;
  }
  const root=ud.torso.parent,p=ud.progress||0,q=smooth(p),charge=ud.stage==='windup',strike=ud.stage==='strike',rest=ud.stage==='recover';
  root.position.y=ud.species==='reaper'?.7+Math.sin(t*1.6)*.18:moving?Math.abs(Math.sin(t*3.5))*.12:0;
  root.rotation.set(0,0,0);ud.neck.rotation.set(rest?-.28*(1-q):0,0,0);ud.head.rotation.set(0,0,0);ud.jaw.rotation.x=0;
  ud.core.material.emissiveIntensity=charge?1+q:rest?2.4:.7;
  ud.legs.forEach(l=>{l.position.y=1.45;});
  ud.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(t*3.5+i*Math.PI)*.3:0);
  ud.arms.forEach((arm,i)=>{arm.rotation.set(moving?Math.sin(t*3.5+i*Math.PI)*.18:0,0,(i?1:-1)*.08);});
  if(ud.move==='sweep') {
    const angle=charge?-.9*q:strike?sweepTurn(p):rest?-.9*(1-q):0;root.rotation.y=angle;
    ud.arms[1].rotation.x=charge?-1.2*q:strike?-1.2*(1-smooth(p/.15)):0;
    ud.arms[1].rotation.z=.45;
  } else if(ud.move==='slam') {
    const lift=charge?q:strike?1-smooth(p/.48):0;
    ud.arms.forEach(arm=>arm.rotation.x=-2.45*lift);ud.neck.rotation.x=.2*lift;
    root.position.y+=lift*.25;
  } else if(ud.move==='meteor') {
    const lift=charge?q:strike?1-q:0;ud.arms.forEach((arm,i)=>{arm.rotation.x=-1.5*lift;arm.rotation.z=(i?1:-1)*.9*lift;});ud.neck.rotation.x=.4*lift;
  } else {
    const lift=charge?q:strike?1:rest?1-q:0;ud.arms.forEach(arm=>arm.rotation.x=-1.2*lift);ud.neck.rotation.x=-.2*lift;
    if(strike)ud.head.rotation.y=-.55+1.1*q;ud.jaw.rotation.x=lift*.4;
  }
  animateGuardianTravel(ud,t);
}

export function guardianTravelPose(species, p) {
  const arc=Math.sin(Math.PI*p);
  if(species==='dragon')return{height:arc*2.6,pitch:Math.sin(p*Math.PI*2)*.12,roll:0,wing:Math.sin(p*Math.PI*4)*.55,fold:arc*.7,hidden:false};
  if(species==='griffin')return{height:arc*3.2,pitch:Math.sin(p*Math.PI*2)*.18,roll:Math.sin(p*Math.PI*2)*.15,wing:Math.sin(p*Math.PI*6)*.65,fold:arc*1.1,hidden:false};
  if(species==='beast')return{height:arc*1.8,pitch:Math.sin(p*Math.PI*2)*.23,roll:0,wing:0,fold:Math.sin(p*Math.PI*2)*.9,hidden:false};
  if(species==='reaper')return{height:.7+arc*.9,pitch:0,roll:0,wing:0,fold:0,hidden:p>.22&&p<.72};
  return{height:Math.abs(Math.sin(p*Math.PI*2))*(species==='giant'?.24:.32),pitch:species==='sentinel'?arc*.16:0,roll:Math.sin(p*Math.PI*2)*.07,wing:0,fold:0,hidden:false};
}
function animateGuardianTravel(ud,t) {
  const root=ud.torso.parent;root.visible=true;
  const p=ud.travelProgress;
  if(p===undefined||p<0||ud.stage!=='idle')return;
  const species=ud.species||'dragon',pose=guardianTravelPose(species,p);
  root.position.y=pose.height;root.rotation.x=pose.pitch;root.rotation.z=pose.roll;root.visible=!pose.hidden;
  if(['dragon','griffin','beast'].includes(species)) {
    ud.wings.forEach((w,i)=>w.rotation.z=(i?1:-1)*pose.wing);
    ud.legs.forEach((l,i)=>l.rotation.x=pose.fold*(i<2?1:-.65));
    ud.tail.rotation.y=Math.sin(p*Math.PI*2-.4)*.2;
  } else if(species!=='reaper') {
    ud.legs.forEach((l,i)=>{const phase=p*Math.PI*4+i*Math.PI;l.rotation.x=Math.sin(phase)*.5;l.position.y=1.45+Math.max(0,Math.sin(phase))*.18;});
    if(species==='sentinel') {ud.arms[0].rotation.x=-.7*Math.sin(p*Math.PI);ud.arms[1].rotation.x=.4*Math.sin(p*Math.PI);}
  }
}
