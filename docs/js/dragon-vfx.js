import { dragonProfile } from './dragon-profiles.js';
import * as THREE from 'three';
import { G } from './state.js';
import { dragonAttack, breathTurn, sweepTurn, smooth, attackPrims, spinTurn } from './dragon-rules.js';
import { sfx } from './audio.js';

// 外部画像不要の流れる炎。3層の乱流面に白熱芯・橙・赤い縁を分ける。
const vertexShader = `
  varying vec3 vP;
  uniform float uTime;
  void main() {
    vP = position;
    vec3 p = position;
    float curl = sin(p.y * 28.0 - uTime * 17.0 + atan(p.z,p.x)*3.0);
    p.xz *= 1.0 + .16 * curl * p.y;
    p.x += .075 * sin(p.y * 16.0 - uTime * 13.0) * p.y;
    p.z += .065 * cos(p.y * 21.0 - uTime * 11.0) * p.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const fragmentShader = `
  varying vec3 vP;
  uniform float uTime, uOpacity, uHeat;
  uniform vec3 uColor, uHot;
  float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float noise(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  void main() {
    vec3 p=vec3(vP.x*5.0,vP.y*9.0-uTime*5.0,vP.z*5.0);
    float n=noise(p)*.65+noise(p*2.7)*.35;
    float tongues=smoothstep(.25+vP.y*.32,.76,n);
    float fade=(1.0-smoothstep(.68,1.0,vP.y))*smoothstep(0.0,.04,vP.y);
    vec3 col=mix(uColor*.35,uColor,n);
    col=mix(col,uHot,uHeat*(1.0-vP.y*.65));
    gl_FragColor=vec4(col, tongues*fade*uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const up = new THREE.Vector3(0, 1, 0);
export function createDragonVisual() {
  const group = new THREE.Group(), flames = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.CylinderGeometry(1, .035, 1, 24, 18, true); geo.translate(0, .5, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uHeat: { value: i / 2 }, uColor: { value: new THREE.Color(0xff671b) }, uHot: { value: new THREE.Color(0xffd986) } },
      vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: i === 2 ? THREE.AdditiveBlending : THREE.NormalBlending });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; group.add(m); flames.push(m);
  }
  const plume = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1), new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.32,depthWrite:false}),32);
  plume.frustumCulled=false; group.add(plume); const puffMatrix=new THREE.Matrix4();
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 2), new THREE.MeshBasicMaterial({ color: 0xff9d32, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); group.add(glow);
  const light = new THREE.PointLight(0xff671b, 0, 32, 2); group.add(light);
  const meteor = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), new THREE.MeshStandardMaterial({ color: 0x2d1009, emissive: 0xff3d0a, emissiveIntensity: 2.8, roughness: 1 })); group.add(meteor); meteor.visible = false;
  const shards = [];
  for (let i=0;i<7;i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(.45), new THREE.MeshStandardMaterial({color:0x80dcff,emissive:0x3977aa,emissiveIntensity:.6,metalness:.45,roughness:.2}));
    group.add(m); shards.push(m); m.visible=false;
  }
  const chain = new THREE.InstancedMesh(new THREE.TorusGeometry(.13,.035,4,8),new THREE.MeshBasicMaterial({color:0xc369f5}),16);chain.frustumCulled=false;group.add(chain);
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(32*3),3));
  const bolt = new THREE.Line(boltGeo,new THREE.LineBasicMaterial({color:0xffe3a0,transparent:true,opacity:.85})); bolt.frustumCulled=false; group.add(bolt);
  return { group, flames, plume, puffMatrix, glow, light, meteor, shards, bolt, chain, key: '', progress: 0, emit: 0, impacted: false };
}
const at = (s, r, angle = 0, y = .8) => new THREE.Vector3(s.origin[0] - Math.sin(s.yaw + angle) * r, s.origin[1] + y, s.origin[2] - Math.cos(s.yaw + angle) * r);
export function updateDragonVisual(v, e, p, dt) {
  const s = e.dragon, a = dragonAttack(s), profile = dragonProfile(s), strike = s.stage === 'strike', charge = s.stage === 'windup';
  const key = `${s.serial}:${s.stage}`;
  if (key !== v.key) {
    v.key = key; v.impacted = false; v.emit = 0;
    if (charge) sfx.dragonCharge?.(e.pos, a.anim || s.move);
    if (strike && (s.move === 'breath' || a.flame)) sfx.dragonFire?.(e.pos);
    if (strike && s.move === 'sweep') sfx.dragonTail?.(e.pos);
  }
  const travelling=s.stage==='idle'&&s.travel;
  if(travelling&&!v.travelling){v.travelling=true;G.fx.burst(e.pos.clone().add(new THREE.Vector3(0,.3,0)),profile.kind==='reaper'?profile.color:0xb2a28b,20,{speed:3,up:1,size:.5,life:.65});sfx.dragonWing?.(e.pos);}
  if(!travelling&&v.travelling){v.travelling=false;G.fx.burst(e.pos.clone().add(new THREE.Vector3(0,.3,0)),profile.kind==='reaper'?profile.color:0xb2a28b,34,{speed:4,up:1.3,size:.6,life:.75});sfx.dragonLand?.(e.pos);}
  const mouth = e.body.userData.head.localToWorld(e.body.userData.mouthOffset?.clone() || new THREE.Vector3(0, 0, -1.35));
  const flame = s.move === 'breath' || !!a.flame; // 吐息と、吐きながら回る大技
  const fire = flame && strike ? smooth(p / .12) * (1 - smooth((p - .86) / .14)) : 0;
  v.glow.scale.setScalar(charge ? .18 + p * .38 : .5);
  v.glow.material.opacity = flame ? charge ? p * .5 : fire * .32 : 0;
  v.light.position.copy(mouth); v.light.color.setHex(profile.color); v.glow.material.color.setHex(profile.hot);
  v.light.intensity = fire * 70 + (charge && flame ? p * 20 : 0); // 強すぎると頭が白く飛んで、口から出ているのが見えなくなる
  const end = at(s, a.range, a.shape === 'spin' ? spinTurn(a, p) : a.shape === 'line' ? 0 : breathTurn(p), .7), dir = end.clone().sub(mouth), length = dir.length();
  // 帯の根元を、吐く向きと逆へ少し引いて口の中に入れる(口先に浮いて見えないように)
  const root = mouth.clone().addScaledVector(dir.clone().normalize(), -0.45);
  v.glow.position.copy(root);
  v.flames.forEach((f, i) => {
    f.visible = fire > .001; if (!f.visible) return;
    f.position.copy(root); f.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    const radius = a.range * Math.tan(a.angle) * [1, .6, .15][i];
    f.scale.set(radius, (length + 0.45) * (1 - i * .07), radius * .6);
    f.material.uniforms.uTime.value = (G.time || 0) + i * 7.1;
    f.material.uniforms.uOpacity.value = fire * [.65,.5,.3][i] * (s.element === 'wind' ? .65 : 1);
    f.material.uniforms.uColor.value.setHex(profile.color); f.material.uniforms.uHot.value.setHex(profile.hot);
  });
  v.plume.visible=fire>.01;
  if(v.plume.visible) {
    const direction=dir.clone().normalize(), rotation=new THREE.Quaternion().setFromUnitVectors(up,direction);
    for(let i=0;i<32;i++) {
      const f=((G.time||0)*1.3+i/32)%1, pos=mouth.clone().lerp(end,f);
      pos.x+=Math.sin(i*2.4+f*8)*f*2.2;pos.z+=Math.cos(i*3.7+f*6)*f*2.2;pos.y+=Math.sin(f*Math.PI)*1.2;
      const size=(.15+f*2.1)*Math.sin(f*Math.PI);
      v.puffMatrix.compose(pos,rotation,new THREE.Vector3(size,size*1.7,size));v.plume.setMatrixAt(i,v.puffMatrix);
      v.plume.setColorAt(i,new THREE.Color(profile.color).lerp(new THREE.Color(profile.hot),Math.max(0,.7-f)));
    }
    v.plume.instanceMatrix.needsUpdate=true;v.plume.instanceColor.needsUpdate=true;v.plume.material.opacity=fire*.32;
  }
  v.shards.forEach((m,i)=> {
    m.visible = fire > .01 && (s.element === 'ice' || s.element === 'holy'); if(!m.visible)return;
    const phase=((G.time||0)*1.7+i/7)%1;
    m.position.copy(mouth).lerp(end,phase); m.position.x+=Math.sin(i*4+phase*9)*phase;
    m.scale.set(.7,1.8,.7); m.rotation.set(phase*7,i,phase*5); m.material.color.setHex(profile.hot); m.material.emissive.setHex(profile.color).multiplyScalar(.3);
  });
  v.bolt.visible = fire > .01 && s.element === 'thunder';
  if(v.bolt.visible) {
    const array=v.bolt.geometry.attributes.position.array;
    for(let i=0;i<32;i++) {
      const f=i/31, point=mouth.clone().lerp(end,f), wobble=Math.sin(f*Math.PI)*1.6;
      point.x+=Math.sin(i*13+Math.floor((G.time||0)*18))*wobble; point.y+=Math.cos(i*7+Math.floor((G.time||0)*18))*wobble;
      point.toArray(array,i*3);
    }
    v.bolt.geometry.attributes.position.needsUpdate=true;
  }
  const distance=G.player?.pos.distanceTo(e.pos)??42;
  v.chain.visible=s.element==='void'&&distance<10&&(charge||strike);
  if(v.chain.visible) {
    const start=e.body.userData.core.getWorldPosition(new THREE.Vector3()),end=G.player.pos.clone().add(new THREE.Vector3(0,1.2,0));
    const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),end.clone().sub(start).normalize());
    for(let i=0;i<16;i++) {const f=i/15,pos=start.clone().lerp(end,f);pos.y-=Math.sin(f*Math.PI)*.6;v.puffMatrix.compose(pos,rotation,new THREE.Vector3(1,1,1));v.chain.setMatrixAt(i,v.puffMatrix);}
    v.chain.instanceMatrix.needsUpdate=true;
  }
  v.emit -= dt;
  v.frostEmit=(v.frostEmit||0)-dt;
  if(s.element==='ice'&&distance<22&&v.frostEmit<=0&&G.player){v.frostEmit=.15;G.fx.burst(G.player.pos.clone().add(new THREE.Vector3(0,.2,0)),profile.color,2,{speed:.5,up:.3,size:.3,life:.8});}
  if (strike && v.emit <= 0) {
    v.emit = .065;
    if (s.move === 'meteor' && p < a.hitStart) G.fx.burst(v.meteor.position, profile.color, 5, {speed:2,up:4,size:.6,life:.4});
    if (flame && fire > .1) {
      const tip = mouth.clone().lerp(end, .5 + Math.random() * .45);
      G.fx.burst(tip, profile.color, 4, { speed: 4, up: 2, size: .35, life: .8 });
      G.fx.burst(mouth, profile.hot, 2, { speed: 5, size: .2, life: .45 });
    }
    if (s.move === 'sweep' && p >= a.hitStart && p <= a.hitEnd) {
      for (const r of [9, 12, 15]) G.fx.burst(at(s, r, a.offset + sweepTurn(p), .35), 0xb49b79, 4, { speed: 3, up: 2, size: .65, life: .6 });
    }
  }
  v.meteor.visible = strike && s.move === 'meteor' && p < a.hitStart;
  if (v.meteor.visible) {
    v.meteor.position.fromArray(s.target).add(new THREE.Vector3(0, 15 * (1 - Math.pow(p / a.hitStart, 2)) + 1, 0));
    v.meteor.rotation.set(p * 4, p * 6, p * 2);
    v.meteor.scale.set(1, s.element === 'ice' ? 2 : 1, 1); v.meteor.material.emissive.setHex(profile.color); v.meteor.material.emissiveIntensity=1.2;
  }
  if (strike && !v.impacted && p >= a.hitStart && (s.move === 'slam' || s.move === 'meteor')) {
    v.impacted = true;
    const center = s.move === 'meteor' ? new THREE.Vector3(...s.target) : at(s, 6, 0, .2);
    G.fx.burst(center, profile.color, 60, { speed: 10, up: 7, size: .7, life: 1.1 });
    if (s.move === 'slam') for (let j = -3; j <= 3; j++) for (const r of [7, 12, 16]) G.fx.burst(at(s, r, j * a.angle / 3, .25), 0xc1a17e, 5, { speed: 4, up: 3, size: .85, life: .9 });
    sfx.crumble?.(center);
    const distance = G.player?.pos.distanceTo(center) ?? 42;
    G.shake = Math.max(G.shake || 0, Math.max(0, .65 * (1 - distance / 35)));
  }
  if (a.shape) specialVisual(v, e, s, a, p, dt, charge, strike, profile);
  // 消火直後の余熱と火の粉。回復時間に有害な見えない炎は残さない。
  if (s.move === 'breath' && s.stage === 'recover' && p < .3 && v.emit <= 0) {
    v.emit = .12; G.fx.burst(mouth, profile.color, 3, { speed: 1, up: 2, size: .3, life: .6 });
  }
}

// ---- 固有技の見た目: 構えの間は当たる形の縁に光の粒が集まり(予兆)、当たる瞬間に柱・壁・輪になって噴き上がる ----
const fwd = yaw => [-Math.sin(yaw), -Math.cos(yaw)];
function specialVisual(v, e, s, a, p, dt, charge, strike, profile) {
  const prims = attackPrims(s), y = s.origin[1] + .25, col = profile.color, hot = profile.hot;
  const P3 = (x, z, h = 0) => new THREE.Vector3(x, y + h, z);
  if (v.spKey !== s.serial) { v.spKey = s.serial; v.spFired = new Set(); }
  v.spEmit = (v.spEmit || 0) - dt;
  const tick = v.spEmit <= 0; if (tick) v.spEmit = .07;
  const mote = { speed: .6, up: 1.6, size: .32, life: .55 };
  if (charge && tick) {
    const n = 2 + Math.round(p * 5);
    for (const q of prims) {
      if (q.k === 'circle') {
        for (let i = 0; i < (q.spot ? n : n * 3); i++) { const an = Math.random() * 6.283; G.fx.burst(P3(q.x + Math.sin(an) * q.r, q.z + Math.cos(an) * q.r), col, 1, mote); if (q.inner) G.fx.burst(P3(q.x + Math.sin(an) * q.inner, q.z + Math.cos(an) * q.inner), hot, 1, mote); }
        if (q.spot) G.fx.burst(P3(q.x, q.z, .1), hot, 1, { ...mote, up: 3 });
      } else if (q.k === 'line') {
        const [fx, fz] = fwd(q.yaw);
        for (let i = 0; i < n * 2; i++) { const f = Math.random() * q.len, sd = (Math.random() < .5 ? -1 : 1) * q.w / 2; G.fx.burst(P3(q.x + fx * f - fz * sd, q.z + fz * f + fx * sd), col, 1, mote); }
      } else {
        for (let i = 0; i < n * 2; i++) { const sd = Math.random() < .5 ? -1 : 1, f = (q.inner || 0) + Math.random() * (q.r - (q.inner || 0)), [fx, fz] = fwd(q.yaw + sd * q.half); G.fx.burst(P3(q.x + fx * f, q.z + fz * f), col, 1, mote); }
      }
    }
  }
  if (!strike) return;
  prims.forEach((q, i) => {
    if (q.k === 'arm' || q.t1 > q.t0 + .05) {       // 続けて当たるもの: 回る腕・突進
      if (!tick || p < q.t0 || p > q.t1) return;
      const arm = q.k === 'arm', [fx, fz] = fwd(arm ? q.yaw + spinTurn(a, p) : q.yaw), ox = arm ? q.x : e.pos.x, oz = arm ? q.z : e.pos.z;
      for (let f = (q.inner || 0) + 1; f < q.r; f += arm ? 3 : 2) G.fx.burst(P3(ox + fx * f, oz + fz * f, .4), (f | 0) % 2 ? col : hot, 3, { speed: 3, up: 3.5, size: .6, life: .55 });
      return;
    }
    if (p < q.t0 || v.spFired.has(i)) return;
    v.spFired.add(i);
    if (q.k === 'circle' && q.spot) {
      G.fx.burst(P3(q.x, q.z, .3), col, 34, { speed: 7, up: 9, size: .75, life: .9 }); G.fx.burst(P3(q.x, q.z, 1.5), hot, 12, { speed: 3, up: 12, size: .5, life: .7 }); sfx.crumble?.(P3(q.x, q.z));
    } else if (q.k === 'circle') {
      for (let rr = Math.max(q.inner, 2); rr <= q.r; rr += 3.2) { const cnt = Math.min(28, Math.max(6, Math.round(rr * 1.6))); for (let j = 0; j < cnt; j++) { const an = j / cnt * 6.283 + rr; G.fx.burst(P3(q.x + Math.sin(an) * rr, q.z + Math.cos(an) * rr, .3), j % 3 ? col : hot, 2, { speed: 4, up: 6, size: .65, life: .8 }); } }
      sfx.crumble?.(P3(q.x, q.z));
    } else if (q.k === 'line') {
      const [fx, fz] = fwd(q.yaw);
      for (let f = 1.5; f < q.len; f += 2.2) for (const sd of q.w > 4 ? [-q.w / 3, 0, q.w / 3] : [0]) G.fx.burst(P3(q.x + fx * f - fz * sd, q.z + fz * f + fx * sd, .4), (f | 0) % 2 ? col : hot, 4, { speed: 3, up: 8, size: .6, life: .8 });
      sfx.dragonFire?.(e.pos);
    } else {
      for (let f = 2; f < q.r; f += 2.6) { const cnt = Math.max(1, Math.round(q.half * f / 1.6)); for (let j = -cnt; j <= cnt; j++) { const [fx, fz] = fwd(q.yaw + j / cnt * q.half); G.fx.burst(P3(q.x + fx * f, q.z + fz * f, .5), (j + cnt) % 2 ? col : hot, 3, { speed: 4, up: 5, size: .6, life: .7 }); } }
      sfx.dragonTail?.(e.pos);
    }
    const dist = G.player?.pos.distanceTo(P3(q.x, q.z)) ?? 40;
    G.shake = Math.max(G.shake || 0, (a.ult ? .8 : .45) * Math.max(0, 1 - dist / 35));
  });
}
