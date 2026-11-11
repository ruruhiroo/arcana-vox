import * as THREE from 'three';
const cache=new Map();
const fract=x=>x-Math.floor(x),noise=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
// Separate albedo, height-normal and roughness: bright paint is not a raised scale.
// Generated once and shared across guardians; no per-frame texture work.
export function guardianSurface(style) {
  if(cache.has(style))return cache.get(style);
  const n=512,height=new Float32Array(n*n),albedo=new Uint8Array(n*n*4),rough=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const grain=noise(x,y),cloud=(Math.sin(x*.027+Math.sin(y*.019)*2)+Math.cos(y*.043+x*.011))/2;
    let h=.5,tone=.7,wear=0;
    if(style==='scales'){
      const yy=y+Math.sin(x*.037)*3,row=Math.floor(yy/38),xx=x+row%2*23+Math.sin(y*.025)*4;
      const u=fract(xx/46),v=fract(yy/38),shape=Math.max(0,1-Math.pow(Math.abs(u-.5)*2,2.7)-Math.pow((v-.39)*1.62,2));
      const ridge=Math.pow(shape,.45);h=.12+ridge*.7+grain*.025;tone=.35+ridge*.48+cloud*.12+noise(Math.floor(xx/46),row)*.1;
      const scar=Math.exp(-Math.pow((x-(120+.18*y+10*Math.sin(y*.013)))/2,2))*Math.max(0,Math.sin(y*.009));wear=scar*.65;h-=scar*.18;
    } else if(style==='membrane'){
      const vein=Math.pow(Math.max(0,Math.cos(x*.053+Math.sin(y*.024)*2)),18)*.12;h=.5+vein+grain*.015;tone=.6+cloud*.13+vein;wear=Math.max(0,cloud-.3)*.15;
    } else {h=.5+.16*cloud+grain*.09;tone=.57+.22*cloud+grain*.13;wear=Math.max(0,noise(Math.floor(x/5),Math.floor(y/5))-.85);}
    const i=(y*n+x)*4;height[y*n+x]=h;
    albedo[i]=Math.min(255,(tone+wear*.3)*255);albedo[i+1]=Math.min(255,(tone+wear*.16)*255);albedo[i+2]=Math.min(255,(tone+wear*.07)*255);albedo[i+3]=255;
    rough[i]=rough[i+1]=rough[i+2]=Math.min(255,Math.round(((style==='membrane'?.77:.64)+cloud*.13+grain*.1-wear*.08)*255));rough[i+3]=255;
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(height[y*n+(x+1)%n]-height[y*n+(x+n-1)%n])*2.8,dy=(height[((y+1)%n)*n+x]-height[((y+n-1)%n)*n+x])*2.8;
    const inv=1/Math.hypot(dx,dy,1),i=(y*n+x)*4;normal[i]=(-dx*inv*.5+.5)*255;normal[i+1]=(-dy*inv*.5+.5)*255;normal[i+2]=(inv*.5+.5)*255;normal[i+3]=255;
  }
  const tex=(data,color=false)=>{const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.repeat.set(style==='scales'?3:2,2);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;};
  const result={map:tex(albedo,true),normalMap:tex(normal),roughnessMap:tex(rough)};cache.set(style,result);return result;
}
