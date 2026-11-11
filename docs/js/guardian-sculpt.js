import * as THREE from 'three';
import { guardianSurface } from './guardian-materials.js';

// Detail geometry stays on the existing animated joints. Collision ellipsoids
// remain separate, so a feather or a horn cannot make attacks miss the body.
const sphere = new THREE.SphereGeometry(1, 24, 16);
const surfaceMaps = new Map();
function surfaceMap(style) {
  if(surfaceMaps.has(style))return surfaceMaps.get(style);
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const grain=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
    let h;
    if(style==='scales') {
      const row=Math.floor(y/24),u=((x+(row%2)*16)%32)/32,v=(y%24)/24;
      h=Math.max(0,1-Math.pow((u-.5)*2,2)-Math.pow((v-.45)*1.8,2));
    } else if(style==='fur')h=.5+.3*Math.sin(x*.9+Math.sin(y*.07)*3)+grain*.12;
    else if(style==='cloth')h=.5+.22*Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2);
    else h=.5+.16*Math.sin(x*.11+Math.sin(y*.09)*2)+.15*Math.sin(y*.37+x*.29)+grain*.12;
    const value=Math.round(174+Math.max(0,Math.min(1,h))*76),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.repeat.set(2,1);texture.needsUpdate=true;
  surfaceMaps.set(style,texture);return texture;
}
export function ellipsoid(parent, material, position, scale) {
  const mesh = new THREE.Mesh(sphere, material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
}
export function taperedCurve(parent, material, points, radii, segments = 18, sides = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segments, false), vertices = [], indices = [], uvs=[];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPointAt(t), r = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(r));
    const radius = THREE.MathUtils.lerp(radii[k], radii[k + 1], r - k);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
      vertices.push(v.x, v.y, v.z);
      uvs.push(j/sides,t);
      if (i < segments && j < sides) { const n = i * (sides + 1) + j; indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1); }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material); parent.add(mesh); return mesh;
}
export function plate(parent, material, outline, position, depth = .08, bevel = .035) {
  const shape = new THREE.Shape(); outline.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:12});
  geo.translate(0,0,-depth/2); const mesh = new THREE.Mesh(geo,material);mesh.position.set(...position);parent.add(mesh);return mesh;
}
export function feather(parent, material, position, width, length, angle = 0) {
  // A convex quill with a narrow tip, not a capsule; the two vanes catch light differently.
  const vertices=[],indices=[],rows=12;
  for(let i=0;i<=rows;i++) {
    const t=i/rows, w=width*Math.pow(Math.sin(Math.PI*t),.65)*(1-.35*t);
    for(let j=0;j<3;j++)vertices.push((j-1)*w,Math.sin(Math.PI*t)*(.11+(j===1?.055:0)),t*length);
    if(i<rows)for(let j=0;j<2;j++){const n=i*3+j;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);mesh.position.set(...position);mesh.rotation.y=angle;parent.add(mesh);return mesh;
}
export function wingSail(parent, material, points) {
  // Curved, densely sampled panels between the wing fingers, with scalloped edges.
  for(let k=2;k<points.length-1;k++) {
    const a=new THREE.Vector3(...points[1]),b=new THREE.Vector3(...points[k]),c=new THREE.Vector3(...points[k+1]);
    const vertices=[],indices=[],uvs=[],n=12;
    for(let i=0;i<=n;i++)for(let j=0;j<=n;j++) {
      const u=i/n,v=j/n,edge=b.clone().lerp(c,v),p=a.clone().lerp(edge,u);
      p.y-=Math.sin(Math.PI*v)*(.18*u+.22*Math.sin(Math.PI*u));vertices.push(p.x,p.y,p.z);
      uvs.push(u,v);
      if(i<n&&j<n){const x=i*(n+1)+j;indices.push(x,x+n+1,x+1,x+1,x+n+1,x+n+2);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();parent.add(new THREE.Mesh(geo,material));
  }
  const inner=new THREE.BufferGeometry();inner.setAttribute('position',new THREE.Float32BufferAttribute([...points[0],...points[1],...points[points.length-1]],3));inner.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1],2));inner.computeVertexNormals();parent.add(new THREE.Mesh(inner,material));
}
function drape(parent, material, hood=false, mantle=false) {
  const v=[],idx=[],rows=24,cols=64;
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++) {
    const t=i/rows,a=j/cols*Math.PI*2;
    if(hood) {
      // Front-facing aperture. Face remains visible inside a continuous hood shell.
      const phi=.7+t*2.32,r=Math.sin(phi);
      v.push(Math.cos(a)*r*.76,Math.sin(a)*r*.88+.06+Math.pow(Math.max(0,Math.sin(a)),8)*.2,-Math.cos(phi)*.8+.08);
    } else if(mantle) {
      const r=.4+.86*Math.sin(t*Math.PI/2);
      v.push(Math.sin(a)*r,3.35-t*.75+Math.sin(a*8)*.035*t,Math.cos(a)*r*.6+.1);
    } else {
      const fold=Math.sin(a*12+t*.8)*.045+Math.sin(a*7-t)*.025;
      const r=.57+Math.pow(t,1.4)*.82+fold*(.3+t);
      v.push(Math.sin(a)*r,3.25-t*3.12+Math.pow(t,9)*(.16+.12*Math.sin(a*9)),Math.cos(a)*r*.67+.12);
    }
    if(i<rows&&j<cols){const n=i*(cols+1)+j;idx.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();parent.add(new THREE.Mesh(geo,material));
}

export function sculptGuardian(root, kind) {
  const {head,jaw,neck,tail,legs,wings,arms,core,materials:m}=root.userData;
  const ivory=new THREE.MeshStandardMaterial({color:0xdccba8,roughness:.54,side:THREE.DoubleSide});
  const dark=new THREE.MeshStandardMaterial({color:0x100f18,roughness:.72});
  const steel=new THREE.MeshStandardMaterial({color:0xadb9c8,metalness:.78,roughness:.26,side:THREE.DoubleSide});
  const gold=new THREE.MeshStandardMaterial({color:0xb99a50,metalness:.7,roughness:.38});
  const cloth=new THREE.MeshStandardMaterial({color:0x21182f,roughness:.96,side:THREE.DoubleSide});
  const skin=surfaceMap(kind==='dragon'?'scales':kind==='beast'||kind==='griffin'?'fur':'stone');
  m.scales.map=skin;m.scales.bumpMap=skin;m.scales.bumpScale=kind==='dragon'?.14:.09;m.scales.metalness=.05;
  m.armor.bumpMap=surfaceMap('stone');m.armor.bumpScale=.045;m.armor.roughness=.65;
  cloth.map=surfaceMap('cloth');cloth.bumpMap=cloth.map;cloth.bumpScale=.035;
  const o=(p,mat,pos,size)=>ellipsoid(p,mat,pos,size),c=(p,mat,pts,r)=>taperedCurve(p,mat,pts,r);
  core.scale.multiplyScalar(.73);
  if(kind==='dragon') {
    Object.assign(m.scales,guardianSurface('scales'));m.scales.bumpMap=null;m.scales.normalScale=new THREE.Vector2(1.4,1.4);m.scales.roughness=1;
    Object.assign(m.armor,guardianSurface('stone'));m.armor.bumpMap=null;m.armor.roughness=1;
    Object.assign(m.membrane,guardianSurface('membrane'));m.membrane.roughness=1;m.membrane.emissiveIntensity=.08;
    for(const side of [-1,1]) {
      c(head,m.horn,[[side*.3,.5,-.1],[side*.48,.85,.05],[side*.66,1.04,.5],[side*.62,1.13,.92]],[.17,.14,.07,0]);
      c(head,m.horn,[[side*.34,.13,0],[side*.7,.2,.2],[side*.81,.4,.62]],[.12,.09,0]);
      c(head,m.armor,[[side*.2,.52,-.91],[side*.36,.54,-.65],[side*.45,.43,-.34]],[.08,.12,.04]);
      o(head,dark,[side*.18,.28,-1.26],[.065,.026,.07]);
      o(head,dark,[side*.427,.405,-.65],[.014,.035,.04]);
      for(let row=0;row<4;row++)for(let i=0;i<7;i++) {
        const s=o(root,row%2?m.scales:m.armor,[side*(.73-row*.085),1.65+row*.19,-.65+i*.37],[.15,.12,.27]);s.rotation.z=side*(.15+row*.2);
      }
      for(let i=0;i<4;i++)c(head,m.horn,[[side*.34,.15,.1+i*.14],[side*.54,.04,.28+i*.14],[side*.59,-.05,.44+i*.14]],[.07,.05,0]);
    }
    for(let i=0;i<6;i++)plate(neck,m.horn,[[-.25+i*.01,.07],[.25-i*.01,.07],[.2-i*.01,-.05],[0,-.12],[-.2+i*.01,-.05]],[0,.1+i*.22,-.88-i*.055],.045,.025);
    for(let i=0;i<7;i++)c(tail,m.horn,[[0,-.05-i*.06,i*.48],[0,.26-i*.08,.2+i*.48],[0,.32-i*.08,.42+i*.48]],[.13-i*.012,.08,0]);
  } else if(kind==='beast'||kind==='griffin') {
    jaw.children[0].material=m.scales;
    for(const side of [-1,1]) {
      o(head,kind==='griffin'?ivory:m.scales,[side*.3,.1,-.38],[.23,.28,.47]);
      c(head,m.armor,[[side*.1,.36,-.65],[side*.29,.38,-.63],[side*.43,.25,-.4]],[.06,.1,.03]);
      o(head,m.coreMat,[side*.32,.24,-.66],[.085,.045,.045]);
      o(head,dark,[side*.32,.24,-.7],[.018,.04,.015]);
      for(let i=0;i<5;i++) {
        const f=feather(neck,kind==='griffin'?ivory:m.armor,[side*(.2+i*.105),.72-i*.13,-.9+i*.06],.2,.85,side*(.8+i*.13));f.rotation.x=-.65;
      }
    }
    legs.forEach((leg,i)=>{const side=i%2?1:-1;for(let j=-1;j<=1;j++)c(leg,kind==='griffin'?dark:ivory,[[side*.46+j*.17,-1.29,-.56],[side*.46+j*.19,-1.27,-.77],[side*.46+j*.2,-1.4,-.9]],[.085,.06,0]);});
    if(kind==='griffin') {
      head.children[0].material=ivory;neck.children[0].material=ivory;
      jaw.children[0].scale.set(.24,.1,.36);
      c(head,gold,[[0,.12,-.65],[0,.08,-1.02],[0,-.04,-1.34],[0,-.36,-1.37]],[.28,.26,.14,0]);
      for(let i=0;i<5;i++) {const f=feather(head,ivory,[(i-2)*.13,.43,-.22],.15,.9,(i-2)*.1);f.rotation.x=-.38;}
      wings.forEach((wing,index)=>{const side=index?1:-1;
        o(wing,m.scales,[side*1.2,.7,.2],[1.35,.22,.45]).rotation.z=side*.3;
        for(let row=0;row<3;row++)for(let i=0;i<11;i++)feather(wing,row===0?ivory:row===1?m.membrane:m.scales,[side*(.4+i*.29),.68-i*.04+row*.055,-.05+row*.12],row===0?.24:.22,row===0?1.95-i*.04:1.25-row*.22,side*(.05+i*.075));
      });
      for(let i=-2;i<=2;i++)feather(tail,ivory,[i*.13,0,1.5],.18,1.5,i*.15);
    } else {
      o(head,m.scales,[0,-.08,-.65],[.36,.23,.53]);o(head,dark,[0,.01,-1.13],[.24,.13,.13]);
      for(const side of [-1,1]) {
        c(head,ivory,[[side*.32,.4,-.3],[side*.65,.8,-.08],[side*.76,1.35,.2],[side*.53,1.8,.08]],[.22,.17,.1,0]);
        c(head,gold,[[side*.69,1.1,.1],[side*1.01,1.4,.21],[side*1.14,1.63,.13]],[.11,.08,0]);
        c(head,ivory,[[side*.26,-.14,-.78],[side*.27,-.35,-.83],[side*.21,-.47,-.91]],[.09,.07,0]);
        const ear=plate(head,m.scales,[[0,0],[side*.33,.6],[side*.42,.05]],[side*.33,.36,.05]);ear.rotation.y=side*.35;
        for(let i=0;i<9;i++)c(neck,m.armor,[[side*.42,.75-i*.1,-.25],[side*(.7+i*.018),.58-i*.1,.1],[side*.55,.25-i*.09,.54]],[.19,.16,0]);
      }
    }
  } else if(kind==='giant') {
    o(head,m.scales,[0,-.07,-.35],[.38,.46,.22]);o(head,m.armor,[0,-.07,-.56],[.13,.25,.12]);
    for(const side of [-1,1]) {
      o(head,m.armor,[side*.24,.2,-.46],[.24,.1,.1]).rotation.z=side*.2;
      o(head,m.coreMat,[side*.23,.08,-.52],[.08,.035,.035]);
      for(let i=0;i<3;i++)c(head,ivory,[[side*(.1+i*.12),-.29,-.41],[side*(.14+i*.12),-.55,-.4],[side*.1,-.85+i*.1,-.17]],[.1,.07,0]);
      for(let i=0;i<4;i++) {
        const shard=new THREE.Mesh(new THREE.ConeGeometry(.16,.7+i*.13,5),i%2?m.scales:m.coreMat);shard.position.set(side*(.18+i*.17),.6+i*.04,.09);shard.rotation.z=-side*(.05+i*.15);head.add(shard);
      }
      for(let i=0;i<3;i++)plate(root,m.armor,[[-.4,.15],[0,.25],[.4,.15],[.28,-.14],[0,-.22],[-.28,-.14]],[side*.48,2.65-i*.3,-.59],.1,.07);
      const shoulder=arms[side===1?1:0];
      for(let i=0;i<4;i++) {
        const shard=new THREE.Mesh(new THREE.ConeGeometry(.22,.85-i*.08,5),m.scales);shard.position.set(side*(.05+i*.19),.3-i*.1,-.12);shard.rotation.z=-side*(.3+i*.22);shoulder.add(shard);
      }
    }
    const hammer=plate(arms[1],m.scales,[[-.92,.5],[-.65,.74],[.68,.74],[.92,.5],[.92,-.5],[.65,-.74],[-.68,-.74],[-.92,-.5]],[.4,-1.4,-3],1.05,.09);
    for(let i=-1;i<=1;i++)c(hammer,m.coreMat,[[i*.4,.6,-.64],[i*.4-.12,.18,-.64],[i*.4+.08,-.25,-.64],[i*.4-.05,-.6,-.64]],[.018,.026,.018,.01]);
  } else if(kind==='sentinel') {
    const helm=plate(head,steel,[[-.45,.38],[0,.64],[.45,.38],[.4,-.2],[.19,-.54],[0,-.41],[-.19,-.54],[-.4,-.2]],[0,.01,-.41],.2,.04);
    plate(helm,dark,[[-.35,.06],[.35,.06],[.31,-.035],[-.31,-.035]],[0,.06,-.15],.02,.008);
    plate(helm,gold,[[-.055,.53],[.055,.53],[.045,-.42],[0,-.52],[-.045,-.42]],[0,0,-.18],.035,.01);
    plate(root,steel,[[-.83,.48],[0,.65],[.83,.48],[.68,-.24],[0,-.64],[-.68,-.24]],[0,2.5,-.6],.2,.065);
    plate(root,gold,[[0,.35],[.18,0],[0,-.35],[-.18,0]],[0,2.5,-.77],.04,.02);
    for(let i=0;i<3;i++)plate(root,m.armor,[[-.79,.14],[.79,.14],[.7,-.14],[-.7,-.14]],[0,1.87-i*.22,-.59],.1,.035);
    legs.forEach(leg=>{plate(leg,steel,[[-.29,.52],[0,.65],[.29,.52],[.23,-.56],[0,-.66],[-.23,-.56]],[0,-.62,-.37],.12,.05);});
    arms.forEach((arm,index)=>{const side=index?1:-1;for(let i=0;i<3;i++) {
      const pauldron=plate(arm,i===0?gold:steel,[[-.5,.23],[0,.39],[.5,.23],[.43,-.19],[0,-.29],[-.43,-.19]],[side*.18,-i*.2,-.48],.28,.06);pauldron.rotation.z=-side*i*.12;
    }});
    const sword=plate(arms[1],steel,[[-.2,0],[.2,0],[.16,2.8],[0,3.25],[-.16,2.8]],[.4,-1.2,-1.1],.12,.025);sword.rotation.x=-Math.PI/2;
    c(arms[1],gold,[[.4,-1.2,-1.05],[.4,-1.2,-.55],[.4,-1.2,-.1]],[.12,.1,.15]);
    c(arms[1],gold,[[-.23,-1.2,-1.05],[.4,-1.2,-1.2],[1.03,-1.2,-1.05]],[.06,.1,.06]);
    const outline=[[-.8,.65],[0,1],[.8,.65],[.66,-.35],[0,-1.05],[-.66,-.35]];
    const shield=plate(arms[0],gold,outline,[-.4,-.8,-.62],.2,.06);
    plate(shield,m.armor,outline.map(([x,y])=>[x*.88,y*.88]),[0,0,-.17],.06,.035);
    plate(shield,ivory,[[0,.65],[.12,.12],[.45,0],[.12,-.1],[0,-.65],[-.12,-.1],[-.45,0],[-.12,.12]],[0,0,-.24],.03,.01);
  } else if(kind==='reaper') {
    // A restrained silhouette: worn cloth, recessed bone, a genuinely gripped tool.
    ivory.color.setHex(0xa69d88);ivory.roughness=.92;ivory.metalness=0;
    steel.color.setHex(0x68717b);steel.roughness=.78;steel.metalness=.28;
    cloth.color.setHex(0x19191e);
    drape(root,cloth);drape(head,cloth,true);
    root.userData.torso.visible=false;head.children[0].visible=false;jaw.children[0].visible=false;core.visible=false;
    drape(root,cloth,false,true);
    arms.forEach((arm,index)=>{
      const side=index?1:-1;
      arm.children.slice(0,4).forEach(part=>part.visible=false);
      c(arm,cloth,[[side*.03,.04,0],[side*.22,-.5,0],[side*.4,-1.24,-.1]],[.3,.25,.18]);
      const palm=o(arm,ivory,[side*.4,-1.4,-.14],[.13,.21,.095]);
      if(index===1)root.userData.weaponHand=palm;
    });
    o(head,ivory,[0,-.03,-.24],[.28,.36,.23]);
    for(const side of [-1,1]) {
      const socket=o(head,dark,[side*.125,-.035,-.448],[.093,.065,.024]);
      socket.rotation.z=side*.22;
      o(head,ivory,[side*.22,-.17,-.39],[.075,.08,.07]);
      c(head,ivory,[[side*.22,-.18,-.39],[side*.18,-.3,-.4],[side*.09,-.3,-.43]],[.045,.035,.02]);
    }
    plate(head,dark,[[0,.035],[.045,-.065],[-.045,-.065]],[0,-.16,-.47],.012,.005);
    for(let i=-3;i<=3;i++)o(head,ivory,[i*.037,-.285,-.437],[.017,.034,.025]);
    c(jaw,ivory,[[-.19,.07,-.23],[-.15,-.015,-.29],[0,-.045,-.3],[.15,-.015,-.29],[.19,.07,-.23]],[.035,.035,.035,.035,.035]);
    // Left hand hangs loosely; right fingers and thumb wrap around the staff.
    for(let i=0;i<4;i++)c(arms[0],ivory,[[-.4+(i-1.5)*.065,-1.5,-.18],[-.4+(i-1.5)*.07,-1.72,-.23],[-.4+(i-1.5)*.065,-1.83,-.15]],[.027,.025,.012]);
    const grip=new THREE.Group();grip.name='scythe-grip';grip.position.set(.4,-1.45,-.15);arms[1].add(grip);
    // Staff and fingers share this joint in every windup / strike / recovery pose.
    const wood=new THREE.MeshStandardMaterial({color:0x34302b,roughness:.95,map:surfaceMap('fur'),bumpMap:surfaceMap('fur'),bumpScale:.035});
    const staff=c(grip,wood,[[0,-.7,.35],[0,0,0],[0,1.8,-.9],[0,3.55,-1.775]],[.064,.064,.055,.05]);
    root.userData.weaponStaff=staff;
    for(let i=0;i<4;i++) {
      const y=.19-i*.11,z=-y*.5;
      c(grip,ivory,[[-.12,y,z+.025],[-.045,y+.012,z-.075],[.065,y,z-.065],[.09,y-.02,z+.02],[.035,y-.025,z+.075]],[.027,.03,.027,.023,.016]);
    }
    c(grip,ivory,[[-.13,-.16,.02],[-.16,-.02,-.07],[-.06,.065,-.09],[.025,.09,-.07]],[.037,.033,.028,.018]);
    const outline=new THREE.Shape();outline.moveTo(.07,3.55);
    outline.bezierCurveTo(-.78,3.9,-1.88,3.6,-2.18,2.22);
    outline.bezierCurveTo(-1.62,3.02,-.7,3.38,.07,3.24);outline.closePath();
    const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.065,bevelEnabled:true,bevelSegments:3,bevelSize:.012,bevelThickness:.012,steps:1,curveSegments:32}),steel);
    blade.position.z=-1.8075;grip.add(blade);
    blade.name='scythe-blade';
    c(grip,wood,[[.02,3.28,-1.74],[.02,3.5,-1.78],[.02,3.56,-1.78]],[.095,.095,.065]);
    root.userData.weaponGrip=grip;
  }
}
