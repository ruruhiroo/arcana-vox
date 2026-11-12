import * as THREE from 'three';
import { makeGripHand, makeCradleHand } from './fphand.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const skin=new THREE.MeshStandardMaterial({color:0xe6bb9d,roughness:.8});
const cloth=new THREE.MeshStandardMaterial({color:0x293955,roughness:.95});
const trim=new THREE.MeshStandardMaterial({color:0x9c8559,roughness:.7});
export function itemGripProfile(key,size) {
  const scroll=key==='scroll'||key.startsWith('scroll_'),herb=key==='herb',book=key.startsWith('tome_');
  const rx=herb?.012:Math.max(.018,Math.min(.057,size.x*.5)),wide=rx>.042; // 幅のある物は掌に載せるので、少し持ち上げて見せる
  const offset=herb?.055:wide?.05:0;
  return {bottom:wide?offset-size.y*.5:null,height:book?.17:scroll?.16:.16, offset,
    radiusX:rx,radiusZ:herb?.012:Math.max(.012,Math.min(.05,size.z*.5)),fingerSpread:book?.017:.014};
}
// Four soft fingers wrap the front; the opposing thumb braces the back. The
// prop and hand share the same parent, including drinking / use animations.
export function makeItemGrip({radiusX:rx=.035,radiusZ:rz=.03,fingerSpread=.014,bottom=null}={}) {
  const root=new THREE.Group();root.name='mage_item_grip';
  const forged=bottom!=null?makeCradleHand(bottom):makeGripHand(rx,rz);if(forged){root.add(forged.root);return root;} // 彫った手(骨入り)があれば、太さに合わせて指を曲げて使う
  const palm=new THREE.Mesh(new RoundedBoxGeometry(.029,.064,.044,4,.013),skin);palm.position.set(rx+.012,-.012,-.018);root.add(palm);
  const tube=(name,points,r)=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,16,r,8,false),skin);mesh.name=name;root.add(mesh);for(const p of [points[0],points.at(-1)]){const cap=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),skin);cap.position.set(...p);root.add(cap);}return mesh;};
  for(let i=0;i<4;i++){const y=(1.5-i)*fingerSpread-.012,r=.0075-(i===3?.001:0);
    tube('finger_'+i,[[rx+.014,y,-.03],[rx+.009,y,.006],[rx*.9,y,rz*.5],[rx*.55,y-.003,rz*.85]],r);
  }
  tube('opposing_thumb',[[rx+.018,.005,-.019],[rx*.64,.011,-rz-.005],[-rx*.12,-.001,-rz-.006]],.009);
  const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.025,.11,6,16),skin);arm.position.set(rx+.063,-.09,.025);arm.rotation.z=.55;root.add(arm);
  const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.046,.061,.23,20),cloth);sleeve.position.set(rx+.12,-.19,.053);sleeve.rotation.z=.55;root.add(sleeve);
  const cuff=new THREE.Mesh(new THREE.TorusGeometry(.045,.006,8,24),trim);cuff.position.set(rx+.062,-.092,.053);cuff.rotation.set(Math.PI/2,0,.55);root.add(cuff);
  root.traverse(o=>{o.renderOrder=11;if(o.isMesh)o.frustumCulled=false;});return root;
}
