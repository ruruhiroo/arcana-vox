import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bindNox } from '../public/js/nox-model.js';
import { animateGuardian } from '../public/js/guardian-model.js';
import { intersectsDragon } from '../public/js/dragon-model.js';
import { DRAGON_ROAM } from '../public/js/dragon-rules.js';

async function model() {
  const bytes=await fs.readFile(new URL('../public/models/guardian-reaper.glb',import.meta.url));
  const loader=new GLTFLoader();
  // Validate the shipped geometry / hierarchy in Node; WebGL texture decoding is
  // checked separately in Electron. No alternate test geometry is substituted.
  loader.register(()=>({name:'NodeTextureStub',loadTexture:async()=>new THREE.Texture()}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return bindNox(gltf.scene);
}
test('shipped Nox asset keeps both hands on the staff in every combat pose',async()=>{
  const root=await model(),ud=root.userData;
  for(const stage of ['idle','windup','strike','recover'])for(const move of ['breath','sweep','slam','meteor'])for(let i=0;i<=20;i++) {
    Object.assign(ud,{stage,move,progress:i/20,travelProgress:-1});animateGuardian(ud,i*.13,false);root.updateWorldMatrix(true,true);
    assert.equal(ud.gripError,0,`${move}/${stage}/${i}: unreachable grip`);
    for(let hand=0;hand<2;hand++) {
      const actual=ud.hands[hand].getWorldPosition(new THREE.Vector3());
      const expected=ud.weapon.localToWorld(new THREE.Vector3(0,hand===0?.9:0,0));
      assert.ok(actual.distanceTo(expected)<.003,`${move}/${stage}/${i}: hand ${hand} detached ${actual.distanceTo(expected)}`);
    }
    const b=new THREE.Box3().setFromObject(root);
    assert.ok(b.max.y<16,`${move}/${stage}/${i}: ceiling`);
    assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.min.z),b.max.x,b.max.z)+DRAGON_ROAM<18,`${move}/${stage}/${i}: wall`);
  }
});
test('Nox keeps head collisions and blink immunity with the Blender asset',async()=>{
  const root=await model(),ud=root.userData;
  Object.assign(ud,{stage:'windup',move:'breath',progress:1});animateGuardian(ud,0,false);
  const head=ud.head.getWorldPosition(new THREE.Vector3());assert.ok(intersectsDragon(root,head,.1));
  Object.assign(ud,{stage:'idle',travelProgress:.5});animateGuardian(ud,0,false);assert.equal(root.visible,false);assert.equal(intersectsDragon(root,head,.1),false);
  ud.travelProgress=.99;animateGuardian(ud,1,false);assert.equal(root.visible,true);
});
