// 部屋の中でできること
//   調べる: 樽・木箱・棺・書棚などを調べると、物が見つかったり、何かが飛び出したりする
//   仕掛け: 術で解く部屋の謎 (火の消えた燭台・氷漬けの宝箱・闇に沈んだ碑文)、試練の碑、祈りの祭壇
import * as THREE from 'three';
import { G } from './state.js';
import { glowSprite } from './textures.js';

let H = null;            // main から渡される道具 (ui, sfx, addPickup, learnWord, spawn, inv)
let events = [];
let searched = new Set();
export const roomProgress=()=>({searched:[...searched],done:events.filter(e=>e.done).map(e=>e.i)});
export function restoreRoomProgress(p={}){searched=new Set(p.searched||[]);for(const e of events)if(p.done?.includes(e.i))e.done=true;}

const SEARCH_NAME = { barrel: '樽', crate: '木箱', coffin: '棺', shelf: '書棚', desk: '書き物机', books: '本の山' };
const LORE = [
  '「第七層で声を失った。唱えられぬ魔導師に、迷宮は容赦しない」',
  '「言霊は正しく唱え切ってこそ。省けば力は痩せる」',
  '「封印の扉は、刻まれた言霊にのみ耳を貸す」',
  '「壁のひびには気をつけろ。風の通る壁の向こうに、誰かが何かを隠した」',
  '「火の消えた燭台を灯せ。古い番人はそれを合図にしていた」',
  '「灯りの届かぬ碑文は、灯火の言霊で読める」',
  '「最初の魔導書は第十層に眠るという。誰も持ち帰った者はいない」',
  '「精霊は言い損じを嫌う。三度続けば、そっぽを向く」',
  '「試練の碑に触れた者は、湧き出る亡者を退けねばならぬ」',
  '「聖域の焚き火も、永遠には燃えない」',
];

export function initRoomEvents(hooks) { H = hooks; }

const mat = {};
function M() {
  if (mat.stone) return mat;
  mat.stone = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 });
  mat.dark = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 });
  mat.iron = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.5, roughness: 0.6 });
  mat.ice = new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, emissive: 0x204060, emissiveIntensity: 0.4 });
  mat.blood = new THREE.MeshStandardMaterial({ color: 0x5a1a14, emissive: 0x400808, emissiveIntensity: 0.6, roughness: 0.6 });
  return mat;
}
const flameSprite = (color, sx, sy) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(sx, sy, 1); return s; };
function glyphTex(lit) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
  x.fillStyle = lit ? '#ffe8b0' : '#2a2622'; x.shadowColor = lit ? '#ffcc66' : 'transparent'; x.shadowBlur = lit ? 12 : 0;
  x.font = '38px "Yu Mincho", serif'; x.textAlign = 'center';
  const rows = ['古き', '言霊を', '求む者', 'ここに', '記す'];
  rows.forEach((t, i) => x.fillText(t, 128, 60 + i * 52));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- 床に作る ----
export function buildRoomEvents(d, scene) {
  clearRoomEvents(scene);
  searched = new Set();
  const m = M();
  (d.roomEvents || []).forEach((ev, i) => {
    const e = { ...ev, i, done: false, objs: [], hinted: false };
    const add = o => { scene.add(o); e.objs.push(o); return o; };
    if (ev.type === 'flames') {
      e.lit = ev.spots.map(() => false); e.bowls = [];
      for (const p of ev.spots) {
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 8), m.stone); post.position.y = 0.55;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.2, 0.24, 12, 1, true), m.iron); bowl.position.y = 1.2; bowl.material.side = THREE.DoubleSide;
        const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), m.dark); ash.position.y = 1.24;
        g.add(post, bowl, ash); g.position.copy(p); add(g); e.bowls.push(g);
        (d.solids ||= []).push({ x: p.x, z: p.z, r: 0.35 });
      }
    } else if (ev.type === 'frozen') {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), m.ice); ice.position.copy(ev.pos).add(new THREE.Vector3(0, 0.5, 0)); add(ice);
      e.ice = ice;
      e.pk = H.addPickup('chest', ev.pos, { rich: true, frozen: true });
    } else if (ev.type === 'tablet') {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.25), m.stone); slab.position.y = 0.85;
      // 上端の半円: 軸を厚みの向き(Z)へ倒し、半分を上へ回す
      const topGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.25, 16, 1, false, 0, Math.PI); topGeo.rotateX(Math.PI / 2); topGeo.rotateZ(Math.PI / 2);
      const top = new THREE.Mesh(topGeo, m.stone); top.position.y = 1.7;
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.2), new THREE.MeshStandardMaterial({ map: glyphTex(false), transparent: true, roughness: 1 })); glyph.position.set(0, 0.95, 0.13);
      g.add(slab, top, glyph); g.position.copy(ev.pos); g.rotation.y = ev.rot || 0; add(g);
      e.glyph = glyph;
      (d.solids ||= []).push({ x: ev.pos.x, z: ev.pos.z, r: 0.55 });
    } else if (ev.type === 'trial') {
      const g = new THREE.Group();
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 2.4, 4), m.dark); ob.position.y = 1.2; ob.rotation.y = Math.PI / 4;
      const rune = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), m.blood); rune.rotation.x = Math.PI / 2; rune.position.y = 0.05;
      const glow = flameSprite(0xff4030, 1.1, 1.1); glow.position.y = 2.6; glow.material.opacity = 0.5;
      g.add(ob, rune, glow); g.position.copy(ev.pos); add(g); e.glow = glow;
      (d.solids ||= []).push({ x: ev.pos.x, z: ev.pos.z, r: 0.45 });
    } else if (ev.type === 'altar') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.7), m.stone); base.position.y = 0.45;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 0.4), m.blood); cloth.position.y = 0.91;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.1, 12), m.iron); bowl.position.y = 0.97;
      g.add(base, cloth, bowl);
      for (const sx of [-0.5, 0.5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 })); c.position.set(sx, 1.02, 0); const f = flameSprite(0xffb060, 0.14, 0.22); f.position.set(sx, 1.18, 0); g.add(c, f); }
      g.position.copy(ev.pos); g.rotation.y = ev.rot || 0; add(g); e.bowl = bowl;
      (d.solids ||= []).push({ x: ev.pos.x, z: ev.pos.z, r: 0.6 });
    }
    events.push(e);
  });
}
export function clearRoomEvents(scene) { for (const e of events) for (const o of e.objs) scene.remove(o); events = []; opening.length = 0; }

// ---- 解けた時の処理 (自分が解いても、仲間から知らせが来ても同じ) ----
function lightBowl(e, k, local) {
  if (e.lit[k]) return;
  e.lit[k] = true;
  const g = e.bowls[k];
  const flame = flameSprite(0xffaa55, 0.9, 1.3), core = flameSprite(0xffeecc, 0.4, 0.6);
  flame.position.y = 1.7; core.position.y = 1.6; g.add(flame, core);
  G.dungeon.torchObjs?.push({ group: g, flame, core, cell: null, light: g.position.clone().add(new THREE.Vector3(0, 1.9, 0)), phase: Math.random() * 10 });
  G.fx?.burst(g.position.clone().setY(1.5), 0xff8a30, 30, { speed: 2, up: 1.5 });
  H.sfx.stage?.(e.lit.filter(Boolean).length);
  if (local) G.net?.send({ t: 'rev', i: e.i, a: 'lit', k });
  const n = e.lit.filter(Boolean).length;
  if (n < e.lit.length) H.ui.log(`燭台に火が灯った (${n}/${e.lit.length})`, '#ffb070');
  else if (!e.done) {
    e.done = true;
    H.ui.banner('燭台がすべて灯った', '床石が動き、隠されていた宝箱が現れた', 3.5);
    H.sfx.learn?.();
    if (local || !G.net) H.addPickup('chest', e.reward, { rich: true });
  }
}
function melt(e, local) {
  if (e.done) return; e.done = true;
  e.ice.visible = false; if (e.pk) e.pk.data.frozen = false;
  G.fx?.burst(e.pos.clone().setY(0.6), 0xbfe8ff, 50, { speed: 3, up: 1.5 });
  H.ui.log('氷が溶け、宝箱が姿を現した', '#bfe8ff');
  if (local) G.net?.send({ t: 'rev', i: e.i, a: 'melt' });
}
function readTablet(e, local) {
  if (e.done) return; e.done = true;
  e.glyph.material.map = glyphTex(true); e.glyph.material.emissive = new THREE.Color(0xffcc66); e.glyph.material.emissiveMap = e.glyph.material.map; e.glyph.material.emissiveIntensity = 0.8; e.glyph.material.needsUpdate = true;
  G.fx?.burst(e.pos.clone().setY(1), 0xffe0a0, 40, { speed: 2, up: 1 });
  if (local) { H.ui.banner('碑文が浮かび上がった', LORE[e.lore % LORE.length], 6); H.learnWord(); G.net?.send({ t: 'rev', i: e.i, a: 'read' }); }
}

// ---- 毎フレーム ----
export function updateRoomEvents(dt, p) {
  updateOpening(dt);
  for (const e of events) {
    const near = p.pos.distanceTo(e.pos || e.spots[0]) < 7;
    if (near && !e.hinted && !e.done) {
      e.hinted = true;
      const tip = { flames: '火の消えた燭台が並んでいる…紅蓮の術で灯せそうだ', frozen: '氷漬けの宝箱がある — 紅蓮の術で溶かせそうだ', tablet: '闇に沈んだ碑文がある — 灯火で照らせば読めそうだ', trial: '血の色に光る碑がある。触れれば試練が始まる', altar: '古い祭壇がある。血を捧げれば加護が得られるという' }[e.type];
      if (tip) H.ui.log(tip, '#e8d8b0');
    }
    // 紅蓮の魔弾が燭台や氷のそばを通ったら、火が移る
    if ((e.type === 'flames' && !e.done) || (e.type === 'frozen' && !e.done)) {
      for (const pr of G.projectiles) {
        if (!pr.local || !(pr.spell?.elements || []).includes('fire')) continue;
        if (e.type === 'flames') e.bowls.forEach((g, k) => { if (!e.lit[k] && Math.hypot(pr.pos.x - g.position.x, pr.pos.z - g.position.z) < 0.9 && pr.pos.y - g.position.y < 2.4) lightBowl(e, k, true); });
        else if (Math.hypot(pr.pos.x - e.pos.x, pr.pos.z - e.pos.z) < 1.2) melt(e, true);
      }
    }
    if (e.type === 'trial') {
      e.glow.material.opacity = e.done ? 0.1 : 0.35 + 0.2 * Math.sin(G.time * 3);
      if (e.running && G.isHost !== false) {
        const alive = G.enemies.filter(x => x.alive && x.trialOf === e.i).length;
        if (!alive) {
          if (e.wave < 2) { e.wave++; spawnWave(e); H.ui.log(`試練 — 第${e.wave}波`, '#ff8a70'); }
          else { e.running = false; e.done = true; H.ui.banner('試練を越えた', '碑の下から宝箱がせり上がった', 3.5); H.sfx.learn?.(); H.addPickup('chest', e.pos.clone().add(new THREE.Vector3(0, 0, 1.4)), { rich: true }); G.net?.send({ t: 'rev', i: e.i, a: 'trialDone' }); }
        }
      }
    }
  }
}

// 術が着弾した: 炎の爆発でも燭台・氷が反応する
export function roomImpact(pos, spell, local) {
  if (!local || !(spell.elements || []).includes('fire')) return;
  for (const e of events) {
    if (e.done) continue;
    if (e.type === 'flames') e.bowls.forEach((g, k) => { if (!e.lit[k] && g.position.distanceTo(pos) < 2) lightBowl(e, k, true); });
    if (e.type === 'frozen' && e.pos.distanceTo(pos) < 2.2) melt(e, true);
  }
}
// 術を放った: 灯火の術なら近くの碑文が読める
export function roomCast(spell, pos) {
  if (!(spell.effects || []).includes('light')) return;
  for (const e of events) if (e.type === 'tablet' && !e.done && e.pos.distanceTo(pos) < 9) readTablet(e, true);
}

function spawnWave(e) {
  const types = G.floor >= 4 ? ['skeleton', 'ghoul', 'spider', 'knight'] : ['skeleton', 'ghoul', 'bat'];
  const n = 2 + Math.floor(G.floor / 2) + (e.wave === 2 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 2;
    const pos = e.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    pos.y = e.pos.y;
    const id = `rt${e.i}_${e.wave}_${k}_${Math.floor(Math.random() * 1e6)}`, type = types[Math.floor(Math.random() * types.length)];
    const en = H.spawn(id, type, pos);
    if (en) en.trialOf = e.i;
  }
}

// ---- 調べる・触れる ----
function nearestSearch(p) {
  const decor = G.dungeon?.decor; if (!decor) return null;
  let best = null, bd = 2.3;
  decor.forEach((d, i) => {
    if (!SEARCH_NAME[d.type] || searched.has(i)) return;
    const dist = Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z);
    if (dist < bd && Math.abs(d.pos.y - p.pos.y) < 1.2) { bd = dist; best = i; }
  });
  return best;
}
function nearestEvent(p) {
  for (const e of events) {
    if (e.done || e.running) continue;
    if ((e.type === 'trial' || e.type === 'altar' || e.type === 'tablet') && p.pos.distanceTo(e.pos) < 2.4) return e;
  }
  return null;
}
export function roomHint(p, key) {
  const e = nearestEvent(p);
  if (e) return `${key}: ` + ({ trial: '試練の碑に触れる(魔物が湧く)', altar: '祭壇に血を捧げる(体力25)', tablet: '碑文を見る' })[e.type];
  const i = nearestSearch(p);
  if (i != null) return `${key}: ${SEARCH_NAME[G.dungeon.decor[i].type]}を調べる`;
  return '';
}
export function roomInteract(p) {
  const e = nearestEvent(p);
  if (e) {
    if (e.type === 'tablet') { H.ui.log('文字は闇に沈んで読めない — 灯火の術で照らせ', '#e8d8b0'); return true; }
    if (e.type === 'trial') { e.running = true; e.wave = 1; H.ui.banner('試練の碑', '亡者が湧き出る — すべて退けよ', 3); spawnWave(e); G.net?.send({ t: 'rev', i: e.i, a: 'trial' }); return true; }
    if (e.type === 'altar') {
      if (p.hp <= 30) { H.ui.log('捧げるだけの血が残っていない', '#ff9a8a'); return true; }
      p.hp -= 25; e.done = true; e.bowl.material = M().blood;
      const roll = Math.random();
      if (roll < 0.4) { p.status.might = { t: 60 }; H.ui.banner('祭壇の加護', '覇気が宿った — 60秒間 術の威力×1.3', 4); }
      else if (roll < 0.7) { p.mp = p.maxMp; H.inv('ether', 2); H.ui.banner('祭壇の加護', '魔力が満ち、魔力薬を授かった', 4); }
      else { p.hp = p.maxHp; H.inv('herb', 2); H.ui.banner('祭壇の加護', '傷が癒え、霊草を授かった', 4); }
      G.fx?.burst(e.pos.clone().setY(1.2), 0xff5040, 50, { speed: 2.5, up: 2 });
      G.net?.send({ t: 'rev', i: e.i, a: 'altar' });
      return true;
    }
  }
  const i = nearestSearch(p);
  if (i == null) return false;
  searched.add(i); G.net?.send({ t: 'rev', a: 'search', k: i });
  const d = G.dungeon.decor[i];
  openAnim(d);
  setTimeout(() => searchResult(i, d), d.lid ? 700 : 350); // 蓋が開いてから中身が分かる
  return true;
}
// ---- 調べた物が開く動き: 棺は石の蓋が横へずれ落ち、樽は蓋が跳ね、木箱は蓋板がはがれる。書棚や机は揺れて埃が舞う ----
const opening = [];
function openAnim(d) {
  if (!d?.obj) return;
  const lid = d.lid;
  opening.push({ d, lid, t: 0, p0: lid?.position.clone(), r0: lid?.rotation.clone(), g0: d.obj.position.clone() });
  const at = d.pos.clone().setY(d.pos.y + (d.type === 'coffin' ? 0.7 : 0.9));
  G.fx?.burst(at, d.type === 'coffin' ? 0x9a9488 : 0x8a7050, 24, { speed: 1.5, up: 1 });
  if (d.type === 'coffin') H.sfx.crumble?.(at); else H.sfx.step?.(at);
}
function updateOpening(dt) {
  for (let k = opening.length - 1; k >= 0; k--) {
    const o = opening[k];
    o.t = Math.min(1, o.t + dt / (o.lid ? 0.75 : 0.5));
    const e = 1 - Math.pow(1 - o.t, 3), t = o.d.type;
    if (o.lid && t === 'coffin') { // 重い石の蓋がずれて、床へ傾いて落ちる
      o.lid.position.set(o.p0.x + 0.75 * e, o.p0.y - 0.35 * Math.max(0, (o.t - 0.55) / 0.45) ** 2, o.p0.z);
      o.lid.rotation.set(o.r0.x, o.r0.y, o.r0.z - 0.5 * Math.max(0, (o.t - 0.45) / 0.55));
      if (o.t > 0.95 && !o.thud) { o.thud = true; H.sfx.crumble?.(o.d.pos); G.shake = Math.max(G.shake || 0, 0.15); }
    } else if (o.lid && t === 'barrel') { // 蓋が跳ねて転がる
      o.lid.position.set(o.p0.x + 0.45 * e, o.p0.y + Math.sin(o.t * Math.PI) * 0.35 - 0.9 * Math.max(0, o.t - 0.6), o.p0.z);
      o.lid.rotation.set(o.r0.x + 2.4 * e, o.r0.y, o.r0.z);
    } else if (o.lid) { // 木箱: 蓋板が持ち上がり、後ろへ立てかかる
      o.lid.position.set(o.p0.x, o.p0.y + Math.sin(o.t * Math.PI) * 0.18, o.p0.z - 0.3 * e);
      o.lid.rotation.set(o.r0.x - 1.2 * e, o.r0.y, o.r0.z);
    } else { // 書棚・机・本の山: 揺れる
      o.d.obj.position.set(o.g0.x + Math.sin(o.t * 40) * 0.02 * (1 - o.t), o.g0.y, o.g0.z);
    }
    if (o.t >= 1) opening.splice(k, 1);
  }
}
function searchResult(i, d) {
  const name = SEARCH_NAME[d.type];
  H.sfx.pickup?.();
  const roll = Math.random();
  const bookish = d.type === 'shelf' || d.type === 'desk' || d.type === 'books';
  if (d.type === 'coffin' && roll < 0.22 && G.isHost !== false) {
    H.ui.log('棺の蓋が内側から押し開けられた!', '#ff9a8a');
    H.spawn(`cf${i}_${Math.floor(Math.random() * 1e6)}`, G.floor >= 4 && Math.random() < 0.4 ? 'ghoul' : 'skeleton', d.pos.clone().add(new THREE.Vector3(0, 0, 0.8)));
    return true;
  }
  if (bookish ? roll < 0.32 : roll < 0.3) { H.ui.log(`${name}を調べた — 何もない`, '#a8a090'); return true; }
  const r2 = Math.random();
  if (bookish) {
    if (r2 < 0.45) fragment();
    else if (r2 < 0.75) H.ui.banner(`${name}に挟まっていた書き付け`, LORE[Math.floor(Math.random() * LORE.length)], 5.5);
    else if (r2 < 0.9) H.inv('ether', 1);
    else H.inv('crystal', 1);
  } else if (d.type === 'coffin') {
    if (r2 < 0.4) H.inv('bone', 2); else if (r2 < 0.7) fragment(); else H.inv('ether', 1);
  } else {
    if (r2 < 0.4) H.inv('herb', 1); else if (r2 < 0.62) H.inv('crystal', 1); else if (r2 < 0.86) H.inv('ether', 1); else fragment();
  }
  return true;
}
// 古文書の断片: 3枚そろうと言霊を一つ覚える
function fragment() {
  if(!G.invAdd('frag',1)){H.inv('frag',1);H.ui.log('断片を持つ空き枠がない — 足元に置いた');return;}
  if (G.inv.frag >= 3) { G.inv.frag -= 3; H.ui.log('古文書の断片が三枚そろった — 一つの頁になった', '#ffe08a'); H.learnWord(); }
  else H.ui.log(`古文書の断片を見つけた (${G.inv.frag}/3) — 三枚そろうと言霊が読める`, '#ffe08a');
}

// 仲間の端末から届いた知らせ
export function roomNet(m) {
  if (m.a === 'search') { searched.add(m.k); openAnim(G.dungeon?.decor?.[m.k]); return; }
  const e = events[m.i]; if (!e) return;
  if (m.a === 'lit') lightBowl(e, m.k, false);
  else if (m.a === 'melt') melt(e, false);
  else if (m.a === 'read') readTablet(e, false);
  else if (m.a === 'altar') { e.done = true; e.bowl.material = M().blood; }
  else if (m.a === 'trial') { e.running = true; e.wave = 1; }
  else if (m.a === 'trialDone') { e.running = false; e.done = true; }
}
