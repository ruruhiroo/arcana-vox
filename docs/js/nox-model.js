import * as THREE from 'three';
import { smooth, sweepTurn } from './dragon-rules.js';

const down=new THREE.Vector3(0,-1,0);
// This adapter keeps the battle / networking contract while the visual asset is
// authored in Blender. The same staff transform drives BOTH hand targets.
export function bindNox(scene) {
  const root=scene.getObjectByName('nox');if(!root)throw Error('Nox asset has no root');
  root.removeFromParent();root.scale.setScalar(2.2);
  const node=name=>{const o=root.getObjectByName(name);if(!o)throw Error('Missing Nox joint: '+name);return o;};
  const head=node('head'),neck=node('neck'),jaw=node('jaw'),arms=[node('arm_L'),node('arm_R')];
  const forearms=[node('forearm_L'),node('forearm_R')],hands=[node('hand_L'),node('hand_R')];
  const weapon=node('scythe'),hitParts=[];
  const invisible=new THREE.MeshStandardMaterial({color:0x000000});
  const hit=(parent,pos,scale)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),invisible);m.position.set(...pos);m.scale.set(...scale);m.visible=false;parent.add(m);hitParts.push(m);return m;};
  const torso=hit(root,[0,2.35,0],[.5,1.05,.4]);
  hit(head,[0,-.025,-.11],[.28,.37,.35]);
  const core=hit(root,[0,2.8,-.3],[.1,.1,.1]);hitParts.pop();
  for(const arm of arms)hit(arm,[0,-.4,0],[.21,.42,.21]);
  for(const forearm of forearms)hit(forearm,[0,-.37,0],[.19,.38,.19]);
  const cloth=['robe','cape'].map(node).map(mesh=>{
    mesh.geometry=mesh.geometry.clone();
    return {mesh,base:mesh.geometry.attributes.position.array.slice()};
  });
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(o.material)o.material.envMapIntensity=.35;}});
  root.userData={asset:'nox-v2',kind:'guardian',species:'reaper',head,neck,jaw,torso,core,arms,forearms,hands,weapon,
    tail:node('spine'),legs:[],wings:[],hitParts,cloth,stage:'idle',move:'meteor',progress:0,mouthOffset:new THREE.Vector3(0,-.15,-.48),
    gripTargets:[new THREE.Vector3(),new THREE.Vector3()],gripError:0};
  animateNox(root.userData,0);return root;
}

function armIK(arm,forearm,hand,target,weaponRotation,side) {
  const shoulder=arm.position.clone(),delta=target.clone().sub(shoulder),distance=delta.length();
  const a=.78,b=.75,d=THREE.MathUtils.clamp(distance,.04,a+b-.0001),dir=delta.normalize();
  // Bend the elbows outward and slightly rearward, without a pole-vector flip.
  const pole=new THREE.Vector3(side,.08,.48);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,height);
  arm.quaternion.setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize());
  const lowerRotation=new THREE.Quaternion().setFromUnitVectors(down,target.clone().sub(elbow).normalize());
  forearm.quaternion.copy(arm.quaternion).invert().multiply(lowerRotation);
  hand.quaternion.copy(lowerRotation).invert().multiply(weaponRotation);
  return Math.max(0,distance-(a+b));
}

export function animateNox(ud,t) {
  const root=ud.torso.parent,p=ud.progress||0,q=smooth(p),windup=ud.stage==='windup',strike=ud.stage==='strike',recover=ud.stage==='recover';
  const lift=windup?q:strike?1-q:recover?.15*(1-q):0;
  root.rotation.set(0,0,Math.sin(t*.7)*.012);root.position.y=.55+Math.sin(t*.8)*.045;
  ud.neck.rotation.set(.12+Math.sin(t*.65)*.015,0,-.035);ud.head.rotation.set(-.08,Math.sin(t*.4)*.035,0);
  ud.weapon.position.set(.73,1.98,-.58);ud.weapon.rotation.set(.06,0,.51);
  if(ud.move==='sweep') {
    root.rotation.y=windup?-.7*q:strike?sweepTurn(p):recover?-.7*(1-q):0;
    const turn=windup?q:strike?1-smooth(p/.55):0;
    ud.weapon.position.set(.73-.25*turn,2.05+.22*turn,-.62);
    ud.weapon.rotation.set(.1,-.18*turn,.51+.85*(strike?Math.sin(p*Math.PI):0));
    ud.neck.rotation.y=-.2*turn;
  } else if(ud.move==='slam') {
    const raised=windup?q:strike?1-smooth(p/.48):0;
    ud.weapon.position.set(.73-.35*raised,2.03+1.02*raised,-.58+.18*raised);
    ud.weapon.rotation.set(.06-.25*raised,0,.51-.3*raised);
    ud.head.rotation.x=-.08-.22*raised;
    if(strike)root.rotation.x=.08*Math.sin(p*Math.PI);
  } else if(ud.move==='meteor') {
    ud.weapon.position.y+=.64*lift;ud.weapon.position.z+=.14*lift;
    ud.weapon.rotation.z-=.17*lift;ud.neck.rotation.x+=.22*lift;
  } else {
    ud.weapon.position.y+=.18*lift;ud.weapon.rotation.z+=.24*lift;
    ud.neck.rotation.x-=.3*lift;ud.head.rotation.y=strike?-.45+.9*q:windup?-.35*q:0;
  }
  ud.gripError=0;
  for(let i=0;i<2;i++) {
    const target=ud.gripTargets[i].set(0,i===0?.9:0,0).applyQuaternion(ud.weapon.quaternion).add(ud.weapon.position);
    ud.gripError=Math.max(ud.gripError,armIK(ud.arms[i],ud.forearms[i],ud.hands[i],target,ud.weapon.quaternion,i===0?-1:1));
  }
  // Small low-frequency cloth lag; position arrays are instance-owned.
  for(const {mesh,base} of ud.cloth) {
    const a=mesh.geometry.attributes.position.array;
    for(let i=0;i<a.length;i+=3) {
      const w=Math.pow(Math.max(0,1-base[i+1]/3.3),1.8);
      a[i]=base[i]+w*(.035*Math.sin(t*1.2+base[i+2]*3)+.025*Math.sin(t*.7+base[i]*5));
      a[i+1]=base[i+1];a[i+2]=base[i+2]+w*.045*Math.sin(t*.9+base[i+1]*2);
    }
    mesh.geometry.attributes.position.needsUpdate=true;
  }
}
