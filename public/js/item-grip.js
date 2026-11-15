import * as THREE from 'three';
import { makeGripHand, makeCradleHand } from './fphand.js';
export function itemGripProfile(key,size) {
  const scroll=key==='scroll'||key.startsWith('scroll_'),herb=key==='herb',book=key.startsWith('tome_');
  const rx=herb?.012:Math.max(.018,Math.min(.057,size.x*.5)),wide=rx>.042; // 幅のある物は掌に載せるので、少し持ち上げて見せる
  const offset=herb?.055:wide?.05:0;
  return {bottom:wide?offset-size.y*.5:null,height:book?.17:scroll?.16:.16, offset,
    radiusX:rx,radiusZ:herb?.012:Math.max(.012,Math.min(.05,size.z*.5)),fingerSpread:book?.017:.014};
}
// 持つ物と手は同じ親に付く(飲む・使う動きでも一緒に動く)。幅のある物は掌に載せ、細い物は握る
export function makeItemGrip({radiusX:rx=.035,radiusZ:rz=.03,bottom=null}={}) {
  const root=new THREE.Group();root.name='mage_item_grip';
  root.add((bottom!=null?makeCradleHand(bottom):makeGripHand(rx,rz)).root);return root;
}
